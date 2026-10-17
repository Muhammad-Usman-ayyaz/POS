import { randomBytes, randomUUID } from 'node:crypto';
import type { AppState, ApprovalAction, Channel, Output, ParsedInput, SessionUser } from '@pos/api-contract';
import {
  createCatalogueService,
  createCustomerDirectoryService,
  createCustomerSettingsService,
  createPaymentService,
  createKhataService,
  createPurchaseService,
  createReferenceService,
  createSaleService,
  createSalesReturnService,
  createStockService,
  DomainError,
  systemClock,
  type Clock,
  type DeviceScope,
  type IdGenerator,
} from '@pos/core';
import { PAGE, renderDocumentHtml, type DocumentFonts } from '@pos/ui/print';
import {
  createSqliteRepositories,
  createSqliteUnitOfWork,
  findActiveOwnerId,
  getInvoiceDetail,
  getPrintConfig,
  findUserForLogin,
  firstLaunchSetup,
  hasInvoiceForRequest,
  holdBill,
  invoiceDocumentData,
  isSetupDone,
  listHeldBills,
  listInvoices,
  resumeHeldBill,
  discardHeldBill,
  loadDeviceInfo,
  migrate,
  openDatabase,
  PRINT_AUDIT_ACTION,
  profitByDay,
  resetCredentials,
  setPrintConfig,
  setRecoveryCodeHash,
  type Db,
  type DeviceInfo,
  type Migration,
} from '@pos/db-sqlite';
import { createApprovalStore, neededApprovals, subjectHash } from './approvals.js';
import { noPrinting, type PrintDriver } from './printing/driver.js';
import { documentFonts } from './printing/fonts.js';
import { argon2Hasher, type PasswordHasher } from './password.js';
import { guardHandlers, requireCapability } from './permissions.js';
import { PrefsStore } from './prefs.js';
import { generateRecoveryCode, normalizeRecoveryCode } from './recovery.js';
import { SessionStore } from './session.js';
import { AttemptThrottle } from './throttle.js';

export interface RuntimeOptions {
  dbPath: string;
  /** Electron-ABI better_sqlite3.node. Left out when running on plain Node (tests). */
  nativeBinding?: string;
  /** The migrations, already loaded (the Electron build bundles them). Defaults to reading the db-sqlite folder. */
  migrations?: readonly Migration[];
  /** Where the language preference is kept. null: not saved (tests). */
  prefsPath: string | null;
  hasher?: PasswordHasher;
  clock?: Clock;
  ids?: IdGenerator;
  randomBytes?: (count: number) => Uint8Array;
  /**
   * Runs a background job after the reply has gone out (default: setImmediate). Tests pass a function that collects the jobs, so they
   * can see WHICH calls schedule a pre-warm.
   */
  schedule?: (job: () => void) => void;
  /** Puts a document on paper (Electron's printing in the app, a fake in tests). Left out: no printer, no PDF. */
  printing?: PrintDriver;
  /** The fonts a printed document carries inside itself. Defaults to the ones bundled with the app. */
  fonts?: DocumentFonts;
}

/** One function per channel in the contract. Input is already validated and cleaned by the time it arrives. */
export type Handlers = { [C in Channel]: (input: ParsedInput<C>) => Promise<Output<C>> };

export interface Runtime {
  handlers: Handlers;
  session: SessionStore;
  db: Db;
  close(): void;
}

export async function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  const hasher = options.hasher ?? argon2Hasher;
  const clock = options.clock ?? systemClock;
  const ids: IdGenerator = options.ids ?? { newId: () => randomUUID() };
  const random = options.randomBytes ?? ((count: number) => randomBytes(count));

  const db = openDatabase(options.dbPath, options.nativeBinding ? { nativeBinding: options.nativeBinding } : {});
  await migrate(db, options.migrations ? { migrations: options.migrations } : {});

  const session = new SessionStore();
  // Wrong passwords at sign-in and at the owner's approval share one lock-out policy; approvals are one-use tokens kept in memory only.
  const loginThrottle = new AttemptThrottle(clock);
  const approvalThrottle = new AttemptThrottle(clock);
  const approvals = createApprovalStore(clock);
  const prefs = new PrefsStore(options.prefsPath);
  const printing = options.printing ?? noPrinting;
  const fonts = options.fonts ?? documentFonts;

  // ---- services: built once the shop exists, because they need its shop, branch and device ids ----
  interface Services {
    info: DeviceInfo;
    scope: DeviceScope;
    repos: ReturnType<typeof createSqliteRepositories>;
    stock: ReturnType<typeof createStockService>;
    purchase: ReturnType<typeof createPurchaseService>;
    catalogue: ReturnType<typeof createCatalogueService>;
    reference: ReturnType<typeof createReferenceService>;
    sale: ReturnType<typeof createSaleService>;
    salesReturn: ReturnType<typeof createSalesReturnService>;
    khata: ReturnType<typeof createKhataService>;
    customers: ReturnType<typeof createCustomerDirectoryService>;
    customerSettings: ReturnType<typeof createCustomerSettingsService>;
    payment: ReturnType<typeof createPaymentService>;
  }
  let built: Services | null = null;
  const services = (): Services => {
    if (built) return built;
    const info = loadDeviceInfo(db);
    if (!info) throw new DomainError('NOT_SIGNED_IN', 'the shop is not set up yet');
    const deps = { uow: createSqliteUnitOfWork(db, info.scope), clock, ids, scope: info.scope };
    built = {
      info,
      scope: info.scope,
      repos: createSqliteRepositories(db, info.scope),
      stock: createStockService(deps),
      purchase: createPurchaseService(deps),
      catalogue: createCatalogueService(deps),
      reference: createReferenceService(deps),
      sale: createSaleService(deps),
      salesReturn: createSalesReturnService(deps),
      khata: createKhataService(deps),
      customers: createCustomerDirectoryService(deps),
      customerSettings: createCustomerSettingsService(deps),
      payment: createPaymentService(deps),
    };
    return built;
  };

  // ---- audit: a row for sign-ins, resets and so on. It joins the caller's transaction, so a change and its record go together ----
  interface AuditEntry {
    userId: string | null;
    action: string;
    rowId: string | null;
    details: Record<string, unknown>;
    /** Default 'users'. */
    table?: string;
  }
  const audit = (repos: Services['repos'], entry: AuditEntry): void => {
    repos.audit.insert({
      id: ids.newId(),
      user_id: entry.userId,
      action: entry.action,
      table_name: entry.table ?? 'users',
      row_id: entry.rowId,
      details: JSON.stringify(entry.details),
    });
  };
  /** Runs `work` in one transaction with the repositories. */
  const inTransaction = <T>(work: (s: Services) => T): T => {
    const s = services();
    return db.transaction(() => work(s)).immediate();
  };

  // A real hash to compare against when the user does not exist, so an unknown name takes as long as a wrong password.
  let dummy: Promise<string> | null = null;
  const dummyHash = (): Promise<string> => (dummy ??= hasher.hash('this-is-not-anyones-password'));

  const getState = (): AppState => {
    const language = prefs.get();
    const info = isSetupDone(db) ? loadDeviceInfo(db) : undefined;
    if (!info) return { phase: 'needs-setup', language, shop: null, device: null, user: null };
    const user = session.current();
    return {
      phase: user ? 'ready' : 'needs-login',
      language,
      shop: { name: info.shopName },
      device: { name: info.deviceName, code: info.deviceCode },
      user,
    };
  };

  const startSession = (user: { id: string; name: string; username: string; role: 'owner' | 'staff' }): SessionUser => session.start(user);

  // ---- pre-warm: after the owner changes the catalogue (or receives stock), rebuild the search index and the stock picture in the
  // background, so the next list or search does not wait for it. Not after a sale: that would stall the counter. ----
  const schedule = options.schedule ?? ((job: () => void) => void setImmediate(job));
  const prewarm = (): void =>
    schedule(() => {
      try {
        services().catalogue.list({ limit: 1 }); // builds both caches (the text index and the stock picture)
      } catch {
        // the app may be closing, or the shop gone: a missed pre-warm only means the next call is a little slower
      }
    });
  /** The signed-in owner, or an error: for catalogue changes. (The guard has checked it already; this keeps each handler honest on its own.) */
  const catalogueOwner = (): SessionUser => {
    const user = session.require();
    requireCapability(user, 'catalogue.edit');
    return user;
  };
  const directoryOwner = (): SessionUser => {
    const user = session.require();
    requireCapability(user, 'directory.add');
    return user;
  };

  /** An active owner's id, for PRICING a cart someone else asked a different price for (the quote needs a valid approver; nothing is written). */
  const requireOwnerId = (): string => {
    const id = findActiveOwnerId(db);
    if (!id) throw new DomainError('NOT_FOUND', 'there is no active owner');
    return id;
  };
  /** The cart as the core takes it. `approvedBy` stands behind any price override in it. */
  const coreCart = (input: ParsedInput<'sale:quote'>, userId: string, approvedBy: string) => ({
    ...(input.customer_id ? { customer_id: input.customer_id } : {}),
    ...(input.price_type ? { price_type: input.price_type } : {}),
    ...(input.due_date ? { due_date: input.due_date } : {}),
    ...(input.paid_amount !== undefined ? { paid_amount: input.paid_amount } : {}),
    ...(input.payment_method ? { payment_method: input.payment_method } : {}),
    ...(input.reference_no ? { reference_no: input.reference_no } : {}),
    created_by: userId,
    lines: input.lines.map(({ price_override, ...line }) => ({
      ...line,
      ...(price_override ? { price_override: { unit_price: price_override.unit_price, approved_by: approvedBy } } : {}),
    })),
  });

  const rawHandlers: Handlers = {
    // ---------- start-up ----------
    'app:getState': async () => getState(),

    'setup:createShop': async (input) => {
      if (isSetupDone(db)) throw new DomainError('ALREADY_SET_UP', 'this shop is already set up');
      const passwordHash = await hasher.hash(input.password);
      const recoveryCode = generateRecoveryCode(random);
      const recoveryCodeHash = await hasher.hash(normalizeRecoveryCode(recoveryCode));

      // Nothing awaits between this check and the writes, so two calls cannot both set up the shop.
      if (isSetupDone(db)) throw new DomainError('ALREADY_SET_UP', 'this shop is already set up');
      const ownerId = db
        .transaction(() => {
          const created = firstLaunchSetup(db, {
            shopName: input.shopName,
            ownerName: input.ownerName,
            ownerUsername: input.username,
            ownerPasswordHash: passwordHash,
            ownerRecoveryCodeHash: recoveryCodeHash,
          });
          return created.ownerId;
        })
        .immediate();
      built = null; // the shop now exists: build the services against it

      const user = startSession({ id: ownerId, name: input.ownerName, username: input.username, role: 'owner' });
      inTransaction((s) => audit(s.repos, { userId: ownerId, action: 'login', rowId: ownerId, details: { username: input.username, via: 'first_launch_setup' } }));
      return { user, recoveryCode };
    },

    // ---------- sign in ----------
    'auth:login': async ({ username, password }) => {
      // A locked name is refused before the password is looked at, so the answer never says whether the password was right.
      const key = `login:${username.trim().toLowerCase()}`;
      loginThrottle.check(key);
      const record = findUserForLogin(db, username);
      const passwordOk = record ? await hasher.verify(record.password_hash, password) : (await hasher.verify(await dummyHash(), password), false);
      const usable = record !== undefined && passwordOk && record.is_active === 1 && record.deleted_at === null;

      if (!usable) {
        const reason = !record ? 'unknown_user' : !passwordOk ? 'wrong_password' : 'inactive_user';
        const lock = loginThrottle.fail(key);
        if (isSetupDone(db)) {
          inTransaction((s) => {
            audit(s.repos, { userId: record?.id ?? null, action: 'login_failed', rowId: record?.id ?? null, details: { username, reason } });
            if (lock) audit(s.repos, { userId: record?.id ?? null, action: 'login_locked', rowId: record?.id ?? null, details: { username, seconds: lock.lockedForSeconds } });
          });
        }
        // The same answer for every reason: the screen must not say which part was wrong.
        throw new DomainError('INVALID_CREDENTIALS', 'wrong username or password');
      }

      loginThrottle.succeed(key);
      const user = startSession(record);
      inTransaction((s) => audit(s.repos, { userId: record.id, action: 'login', rowId: record.id, details: { username } }));
      return user;
    },

    'auth:logout': async () => {
      session.end();
      return null;
    },

    'auth:me': async () => session.current(),

    // ---------- owner recovery ----------
    'auth:regenerateRecoveryCode': async ({ password }) => {
      const user = session.require();
      if (user.role !== 'owner') throw new DomainError('NOT_AUTHORIZED', 'only the owner has a recovery code');
      const record = findUserForLogin(db, user.username);
      if (!record || !(await hasher.verify(record.password_hash, password))) throw new DomainError('INVALID_CREDENTIALS', 'wrong password');

      const recoveryCode = generateRecoveryCode(random);
      const recoveryCodeHash = await hasher.hash(normalizeRecoveryCode(recoveryCode));
      inTransaction((s) => {
        setRecoveryCodeHash(db, user.id, recoveryCodeHash);
        audit(s.repos, { userId: user.id, action: 'recovery_code_regenerated', rowId: user.id, details: { username: user.username } });
      });
      return { recoveryCode };
    },

    'auth:resetOwnerPassword': async ({ username, recoveryCode, newPassword }) => {
      if (!isSetupDone(db)) throw new DomainError('INVALID_RECOVERY_CODE', 'the shop is not set up yet');
      const record = findUserForLogin(db, username);
      const eligible = record !== undefined && record.role === 'owner' && record.is_active === 1 && record.deleted_at === null && record.recovery_code_hash !== null;
      const normalized = normalizeRecoveryCode(recoveryCode);
      const codeOk = eligible ? await hasher.verify(record.recovery_code_hash as string, normalized) : (await hasher.verify(await dummyHash(), normalized), false);

      if (!eligible || !codeOk) {
        const reason = !record ? 'unknown_user' : !eligible ? 'not_an_owner_with_a_code' : 'wrong_code';
        inTransaction((s) => audit(s.repos, { userId: record?.id ?? null, action: 'owner_password_reset_failed', rowId: record?.id ?? null, details: { username, reason } }));
        throw new DomainError('INVALID_RECOVERY_CODE', 'that recovery code is not right');
      }

      // The code works once: it is replaced by a new one, which the owner must write down.
      const newHash = await hasher.hash(newPassword);
      const newCode = generateRecoveryCode(random);
      const newCodeHash = await hasher.hash(normalizeRecoveryCode(newCode));
      inTransaction((s) => {
        resetCredentials(db, record.id, newHash, newCodeHash);
        audit(s.repos, { userId: record.id, action: 'owner_password_reset', rowId: record.id, details: { username } });
      });
      session.end();
      return { recoveryCode: newCode };
    },

    // ---------- preferences ----------
    'prefs:setLanguage': async ({ language }) => {
      prefs.setLanguage(language);
      return language;
    },

    // ---------- business calls: signed in, role-checked here, the user comes from the session ----------
    // The cart priced and checked by the core, nothing written. For someone who is not the owner it also says what the owner would have to approve.
    'sale:quote': async (input) => {
      const user = session.require();
      const quote = services().sale.quote(coreCart(input, user.id, user.role === 'owner' ? user.id : requireOwnerId()));
      return { ...quote, requires_approval: neededApprovals(user, quote, input.lines) };
    },

    'sale:create': async (input) => {
      const user = session.require();
      const { credit_override, approval_token, lines, ...rest } = input;

      // Who stands behind a different price, going over the credit limit, or a discount above the staff limit. The owner, on their own sale,
      // is their own approver. Anyone else needs the owner's one-use approval for EXACTLY what this sale needs and for exactly this cart.
      let approver: string | null = user.role === 'owner' ? user.id : null;
      let spent: ApprovalAction[] = [];
      const alreadyMade = rest.request_id !== undefined && hasInvoiceForRequest(db, rest.request_id);
      if (user.role !== 'owner' && !alreadyMade) {
        const quote = services().sale.quote(coreCart({ ...rest, lines }, user.id, requireOwnerId()));
        const needs = neededApprovals(user, quote, lines);
        if (needs.length > 0) {
          if (!approval_token) throw new DomainError('APPROVAL_REQUIRED', 'the owner has to approve this sale', { actions: needs.join(',') });
          approver = approvals.consume(approval_token, needs, subjectHash({ ...rest, lines }), user.id).ownerId;
          spent = needs;
        }
      }
      // (A repeat of a sale already made never uses an approval: the core hands back the invoice it made the first time.)
      const stand = approver ?? requireOwnerId();

      const sold = services().sale.create({
        ...rest,
        created_by: user.id,
        ...(credit_override || spent.includes('credit_override') ? { credit_override: { approved_by: stand } } : {}),
        ...(spent.includes('discount_override') ? { discount_override: { approved_by: stand } } : {}),
        // Recorded by the sale itself, in its transaction: both the invoice and the 'approval_used' row, or neither.
        ...(spent.length > 0 && approver !== null ? { approval_used: { approved_by: approver, requested_by: user.id, actions: spent } } : {}),
        lines: lines.map(({ price_override, ...line }) => ({
          ...line,
          ...(price_override ? { price_override: { unit_price: price_override.unit_price, approved_by: stand } } : {}),
        })),
      });
      // Each line carries its batch's cost price (for profit). Only the owner may see it.
      return user.role === 'owner' ? sold : { ...sold, items: sold.items.map(({ cost_price: _cost, ...line }) => line) };
    },

    'customers:search': async (input) => {
      session.require();
      return services().customers.search(input);
    },

    // The owner types their own password at the counter, so someone else can sell over the limit, at another price, or with a big discount.
    // The answer is a token for exactly these actions and this cart that works once, for one minute. Wrong passwords lock the person asking out.
    'approval:request': async ({ username, password, actions, sale }) => {
      const requester = session.require();
      const key = `approval:${requester.id}`;
      approvalThrottle.check(key);
      const record = findUserForLogin(db, username);
      const passwordOk = record ? await hasher.verify(record.password_hash, password) : (await hasher.verify(await dummyHash(), password), false);
      const usable = record !== undefined && passwordOk && record.role === 'owner' && record.is_active === 1 && record.deleted_at === null;
      if (!usable) {
        const lock = approvalThrottle.fail(key);
        inTransaction((s) => {
          audit(s.repos, { userId: requester.id, action: 'approval_failed', rowId: record?.id ?? null, details: { requested_by: requester.id, username, actions } });
          if (lock) audit(s.repos, { userId: requester.id, action: 'approval_locked', rowId: requester.id, details: { seconds: lock.lockedForSeconds } });
        });
        throw new DomainError('INVALID_CREDENTIALS', 'wrong username or password, or not the owner'); // the same answer for every reason
      }
      approvalThrottle.succeed(key);
      const hash = subjectHash(sale);
      const grant = approvals.issue({ ownerId: record.id, requestedBy: requester.id, actions, hash, token: Buffer.from(random(32)).toString('hex') });
      inTransaction((s) => audit(s.repos, { userId: record.id, action: 'approval_granted', rowId: record.id, details: { requested_by: requester.id, actions, bill: hash.slice(0, 12) } }));
      return { ...grant, actions: [...actions].sort() };
    },

    'salesReturn:create': async (input) => {
      const user = session.require();
      requireCapability(user, 'returns.approve');
      return services().salesReturn.create({ ...input, approved_by: user.id });
    },

    // ---------- invoice history and printing: for anyone signed in. Nothing here holds a cost (the queries never select it). ----------
    'invoices:list': async (input) => {
      session.require();
      return listInvoices(db, input);
    },

    'invoices:get': async ({ invoice_id }) => {
      session.require();
      const detail = getInvoiceDetail(db, invoice_id);
      if (!detail) throw new DomainError('NOT_FOUND', 'there is no such invoice');
      return detail;
    },

    // The document as data (the screen can show it): the balance is as of that sale, and `is_copy` says whether printing it now would say COPY.
    'invoices:receipt': async ({ invoice_id, kind }) => {
      session.require();
      const data = invoiceDocumentData(db, invoice_id, kind ?? 'receipt');
      if (!data) throw new DomainError('NOT_FOUND', 'there is no such invoice');
      return data;
    },

    'printers:list': async () => {
      session.require();
      try {
        return await printing.listPrinters();
      } catch {
        return []; // "no printer available" is an answer, not an error: the screen offers the PDF
      }
    },

    'print:getConfig': async () => {
      session.require();
      return getPrintConfig(db);
    },

    'print:setConfig': async (input) => {
      const user = session.require();
      requireCapability(user, 'print.configure');
      const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const s = services();
      // The settings and their audit rows are one transaction. Only a value that really changed is written and audited, one row per field
      // (with the value before and after); a save that changes nothing writes nothing.
      return setPrintConfig(db, s.scope, changes, (changed) => {
        for (const c of changed)
          audit(s.repos, {
            userId: user.id,
            action: 'print_config_changed',
            table: c.field === 'shop_name' ? 'shops' : 'settings',
            rowId: c.field === 'shop_name' ? s.scope.shop_id : null,
            details: { field: c.field, from: c.from, to: c.to },
          });
      });
    },

    // Prints the document, or, when there is no printer or it fails, saves a PDF instead. That is a normal outcome (`fallback` says why), not an error.
    // The print is written to the audit log; the SECOND and later print of the same kind of document for an invoice says COPY.
    'print:document': async ({ invoice_id, kind, language, output }) => {
      const user = session.require();
      const data = invoiceDocumentData(db, invoice_id, kind);
      if (!data) throw new DomainError('NOT_FOUND', 'there is no such invoice');
      const config = getPrintConfig(db);
      const chosen = language ?? (kind === 'receipt' ? config.receipt_language : config.invoice_language);
      const html = renderDocumentHtml(data, chosen, fonts);
      const page = PAGE[kind];
      const pageSpec = { widthMm: page.widthMm, heightMm: page.heightMm };

      let fallback: 'no_printer' | 'print_failed' | null = null;
      let printed = false;
      if (output !== 'pdf') {
        const available = await printing.listPrinters().catch(() => []);
        const target = config.printer_name;
        if (available.length === 0 || (target !== null && !available.some((p) => p.name === target))) fallback = 'no_printer';
        else {
          try {
            await printing.print(html, { page: pageSpec, printerName: target });
            printed = true;
          } catch {
            fallback = 'print_failed';
          }
        }
      }

      let pdfPath: string | null = null;
      if (!printed) {
        try {
          const pdf = await printing.toPdf(html, { page: pageSpec });
          pdfPath = await printing.savePdf(`${data.invoice.invoice_no}-${kind}${data.is_copy ? '-copy' : ''}-${chosen}.pdf`, pdf);
        } catch {
          // Not even a PDF could be made: this IS an error (nothing was printed or saved), and nothing is recorded.
          throw new DomainError('INTERNAL', 'the document could not be printed or saved as a PDF');
        }
      }

      inTransaction((s) =>
        audit(s.repos, {
          userId: user.id,
          action: PRINT_AUDIT_ACTION,
          table: 'invoices',
          rowId: invoice_id,
          details: { kind, language: chosen, result: printed ? 'printed' : 'pdf_saved', fallback, copy: data.is_copy },
        }),
      );
      return { status: printed ? 'printed' : 'pdf_saved', pdf_path: pdfPath, fallback, kind, language: chosen, is_copy: data.is_copy };
    },

    'stock:batchesOf': async ({ productId, includeCost }) => {
      const user = session.require();
      if (includeCost) requireCapability(user, 'cost.view');
      const batches = services().stock.batchesOf(productId);
      // Staff and anyone who did not ask for cost get the stock without it.
      return includeCost ? batches : batches.map(({ cost_price: _cost, ...rest }) => rest);
    },

    'stock:openingStock': async (input) => {
      const user = session.require();
      requireCapability(user, 'stock.openingStock');
      return { batch_id: services().stock.openingStock({ ...input, created_by: user.id }) };
    },

    'stock:adjust': async (input) => {
      const user = session.require();
      requireCapability(user, 'stock.adjust');
      services().stock.adjust({ ...input, created_by: user.id });
      return null;
    },

    'stock:writeOff': async (input) => {
      const user = session.require();
      requireCapability(user, 'stock.writeOff');
      services().stock.writeOff({ ...input, created_by: user.id });
      return null;
    },

    // ---------- the catalogue: lists for anyone signed in, changes for the owner. Cost only goes to the owner. ----------
    'catalogue:list': async (input) => {
      const user = session.require();
      return services().catalogue.list({ ...input, include_cost: user.role === 'owner' });
    },

    'catalogue:createGroup': async (input) => {
      const user = catalogueOwner();
      const result = services().catalogue.createGroup({ ...input, actor_id: user.id });
      prewarm();
      return result;
    },

    'catalogue:updateGroup': async (input) => {
      const user = catalogueOwner();
      const result = services().catalogue.updateGroup({ ...input, actor_id: user.id });
      prewarm();
      return result;
    },

    'catalogue:addSize': async (input) => {
      const user = catalogueOwner();
      const result = services().catalogue.addSize({ ...input, actor_id: user.id });
      prewarm();
      return result;
    },

    'catalogue:updateSize': async (input) => {
      const user = catalogueOwner();
      const result = services().catalogue.updateSize({ ...input, actor_id: user.id });
      prewarm();
      return result;
    },

    'catalogue:setSizeActive': async (input) => {
      const user = catalogueOwner();
      services().catalogue.setSizeActive({ ...input, actor_id: user.id });
      prewarm();
      return null;
    },

    'catalogue:setGroupActive': async (input) => {
      const user = catalogueOwner();
      services().catalogue.setGroupActive({ ...input, actor_id: user.id });
      prewarm();
      return null;
    },

    'catalogue:moveSize': async (input) => {
      const user = catalogueOwner();
      const result = services().catalogue.moveSize({ ...input, actor_id: user.id });
      prewarm();
      return result;
    },

    // ---------- receiving stock: a purchase from a supplier, paid in full (the payment fields are hidden), owner only ----------
    'stock:receive': async (input) => {
      const user = session.require();
      requireCapability(user, 'stock.receive');
      const result = services().purchase.record({ ...input, created_by: user.id, pay_in_full: true });
      prewarm();
      return { purchase_id: result.purchase.id, total: result.purchase.total, batch_ids: result.items.map((i) => i.batch_id) };
    },

    // ---------- the short lists a form picks from, and the owner's quick-add ----------
    'suppliers:list': async () => (session.require(), services().reference.listSuppliers()),
    'categories:list': async () => (session.require(), services().reference.listCategories()),
    'brands:list': async () => (session.require(), services().reference.listBrands()),
    'suppliers:create': async (input) => services().reference.addSupplier({ ...input, actor_id: directoryOwner().id }),
    'categories:create': async (input) => services().reference.addCategory({ ...input, actor_id: directoryOwner().id }),
    'brands:create': async (input) => services().reference.addBrand({ ...input, actor_id: directoryOwner().id }),

    'khata:setOpeningBalance': async (input) => {
      const user = session.require();
      requireCapability(user, 'khata.openingBalance');
      services().khata.setOpeningBalance({ ...input, created_by: user.id });
      return null;
    },

    'reports:profitByDay': async ({ from, to }) => {
      const user = session.require();
      requireCapability(user, 'profit.view');
      return profitByDay(db, from, to);
    },

    // ---------- held bills: any signed-in user; the holder is the session user, never something the request says ----------
    'bills:hold': async (input) => {
      const user = session.require();
      const s = services();
      const id = ids.newId();
      holdBill(db, s.scope, { id, heldBy: user.id, cart: input }, () =>
        audit(s.repos, { userId: user.id, action: 'bill_held', table: 'held_bills', rowId: id, details: { lines: input.lines.length } }),
      );
      return { id };
    },

    'bills:list': async () => {
      session.require();
      return listHeldBills(db);
    },

    'bills:resume': async ({ id }) => {
      const user = session.require();
      const s = services();
      return resumeHeldBill(db, id, user.id, () => audit(s.repos, { userId: user.id, action: 'bill_resumed', table: 'held_bills', rowId: id, details: {} }));
    },

    'bills:discard': async ({ id }) => {
      const user = session.require();
      const s = services();
      discardHeldBill(db, id, user.id, () => audit(s.repos, { userId: user.id, action: 'bill_discarded', table: 'held_bills', rowId: id, details: {} }));
      return null;
    },

    // ---------- BEGIN Phase 6 M2: customers, payments, statement. The user (and whether they are the owner) comes from the session, never from the request ----------
    'customers:list': async (input) => (session.require(), services().customers.list(input)),
    'customers:get': async ({ customer_id }) => (session.require(), services().customers.get({ customer_id })),
    'customers:findDuplicates': async (input) => (session.require(), services().customers.findDuplicates(input)),

    // `privileged` is the SESSION's role. A staff create that carries a credit limit, price type or farmer field gets FIELD_NOT_ALLOWED from the core.
    'customers:create': async ({ fields, confirm_duplicate }) => {
      const user = session.require();
      return services().customers.create({
        fields,
        created_by: user.id,
        privileged: user.role === 'owner',
        ...(confirm_duplicate !== undefined ? { confirm_duplicate } : {}),
      });
    },

    'customers:update': async (input) => {
      const user = session.require();
      return services().customers.update({ ...input, actor: user.id });
    },

    'customers:setTerms': async (input) => {
      const user = session.require();
      requireCapability(user, 'customers.terms');
      return services().customers.setTerms({ ...input, actor: user.id });
    },

    'customers:getSettings': async () => (session.require(), services().customerSettings.get()),

    'customers:setSettings': async (input) => {
      const user = session.require();
      requireCapability(user, 'customers.settings');
      return services().customerSettings.set({ ...input, actor_id: user.id });
    },

    'payments:receive': async ({ customer_id, ...rest }) => {
      const user = session.require();
      return services().payment.receiveFromCustomer({ ...rest, party_id: customer_id, created_by: user.id });
    },

    'khata:statement': async (input) => (session.require(), services().khata.statement(input)),
    // ---------- END Phase 6 M2 ----------
  };

  // Every call goes through the guard: the channel's permission policy first, and errors made safe for the signed-in user.
  const handlers = guardHandlers(rawHandlers, () => session.current());
  return { handlers, session, db, close: () => db.close() };
}
