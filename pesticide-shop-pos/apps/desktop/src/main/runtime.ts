import { randomBytes, randomUUID } from 'node:crypto';
import type { AppState, Channel, Output, ParsedInput, SessionUser } from '@pos/api-contract';
import {
  createKhataService,
  createSaleService,
  createSalesReturnService,
  createStockService,
  DomainError,
  systemClock,
  type Clock,
  type DeviceScope,
  type IdGenerator,
} from '@pos/core';
import {
  createSqliteRepositories,
  createSqliteUnitOfWork,
  findUserForLogin,
  firstLaunchSetup,
  isSetupDone,
  loadDeviceInfo,
  migrate,
  openDatabase,
  profitByDay,
  resetCredentials,
  setRecoveryCodeHash,
  type Db,
  type DeviceInfo,
  type Migration,
} from '@pos/db-sqlite';
import { argon2Hasher, type PasswordHasher } from './password.js';
import { requireCapability } from './permissions.js';
import { PrefsStore } from './prefs.js';
import { generateRecoveryCode, normalizeRecoveryCode } from './recovery.js';
import { SessionStore } from './session.js';

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
  const prefs = new PrefsStore(options.prefsPath);

  // ---- services: built once the shop exists, because they need its shop, branch and device ids ----
  interface Services {
    info: DeviceInfo;
    scope: DeviceScope;
    repos: ReturnType<typeof createSqliteRepositories>;
    stock: ReturnType<typeof createStockService>;
    sale: ReturnType<typeof createSaleService>;
    salesReturn: ReturnType<typeof createSalesReturnService>;
    khata: ReturnType<typeof createKhataService>;
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
      sale: createSaleService(deps),
      salesReturn: createSalesReturnService(deps),
      khata: createKhataService(deps),
    };
    return built;
  };

  // ---- audit: a row for sign-ins, resets and so on. It joins the caller's transaction, so a change and its record go together ----
  interface AuditEntry {
    userId: string | null;
    action: string;
    rowId: string | null;
    details: Record<string, unknown>;
  }
  const audit = (repos: Services['repos'], entry: AuditEntry): void => {
    repos.audit.insert({
      id: ids.newId(),
      user_id: entry.userId,
      action: entry.action,
      table_name: 'users',
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

  const handlers: Handlers = {
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
      const record = findUserForLogin(db, username);
      const passwordOk = record ? await hasher.verify(record.password_hash, password) : (await hasher.verify(await dummyHash(), password), false);
      const usable = record !== undefined && passwordOk && record.is_active === 1 && record.deleted_at === null;

      if (!usable) {
        const reason = !record ? 'unknown_user' : !passwordOk ? 'wrong_password' : 'inactive_user';
        if (isSetupDone(db)) inTransaction((s) => audit(s.repos, { userId: record?.id ?? null, action: 'login_failed', rowId: record?.id ?? null, details: { username, reason } }));
        // The same answer for every reason: the screen must not say which part was wrong.
        throw new DomainError('INVALID_CREDENTIALS', 'wrong username or password');
      }

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
    'sale:create': async (input) => {
      const user = session.require();
      if (input.lines.some((l) => l.price_override)) requireCapability(user, 'prices.override');
      if (input.credit_override) requireCapability(user, 'credit.override');

      const { credit_override, lines, ...rest } = input;
      return services().sale.create({
        ...rest,
        created_by: user.id,
        // The owner asked for this and is the signed-in user, so they are the approver. A staff session never gets here.
        ...(credit_override ? { credit_override: { approved_by: user.id } } : {}),
        lines: lines.map(({ price_override, ...line }) => ({
          ...line,
          ...(price_override ? { price_override: { unit_price: price_override.unit_price, approved_by: user.id } } : {}),
        })),
      });
    },

    'salesReturn:create': async (input) => {
      const user = session.require();
      requireCapability(user, 'returns.approve');
      return services().salesReturn.create({ ...input, approved_by: user.id });
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
  };

  return { handlers, session, db, close: () => db.close() };
}
