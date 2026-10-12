// Test setup for the main process: a real SQLite database in memory, the real migrations, the real handlers.
// (Does not use @pos/core/testing: desktop tests build their own shop.)
import { addDays, systemClock, todayUtc, type Clock } from '@pos/core';
import { createUser, loadDeviceInfo } from '@pos/db-sqlite';
import { seedDemoData, type DemoIds } from '@pos/db-sqlite/demo';
import type { PrinterInfo } from '@pos/core';
import type { PrintDriver, PrintPage } from '../src/main/printing/driver.js';
import { createRuntime, type Runtime } from '../src/main/runtime.js';
import type { PasswordHasher } from '../src/main/password.js';

/** A fast stand-in for argon2: tests that need the real thing pass argon2Hasher. */
export const fastHasher: PasswordHasher & { verifyCalls: number } = {
  verifyCalls: 0,
  hash: async (plain) => `fake$${plain}`,
  verify: async function (stored, plain) {
    fastHasher.verifyCalls += 1;
    return stored === `fake$${plain}`;
  },
};

export const OWNER = { shopName: 'Pesticide Club Shop', ownerName: 'Owner', username: 'owner', password: 'test-owner-secret-1' } as const;
export const STAFF = { name: 'Salesman', username: 'staff', password: 'test-staff-secret-1' } as const;

export interface Shop {
  runtime: Runtime;
  demo: DemoIds;
  ownerId: string;
  staffId: string;
  recoveryCode: string;
  today: string;
  signInAs(who: 'owner' | 'staff'): Promise<void>;
  signOut(): Promise<void>;
  count(table: string): number;
}

/** A set-up shop: owner and staff users, demo products and customers. Nobody is signed in. */
/** A clock a test can move: the approval minute and the lock-outs depend on time. */
export function movableClock(startIso = new Date().toISOString()): Clock & { advance(ms: number): void } {
  let now = new Date(startIso).getTime();
  return { now: () => new Date(now), advance: (ms: number) => void (now += ms) };
}

export async function makeShop(options: { hasher?: PasswordHasher; prefsPath?: string | null; schedule?: (job: () => void) => void; clock?: Clock; dbPath?: string; printing?: PrintDriver } = {}): Promise<Shop> {
  const hasher = options.hasher ?? fastHasher;
  const runtime = await createRuntime({ dbPath: options.dbPath ?? ':memory:', prefsPath: options.prefsPath ?? null, hasher, ...(options.schedule ? { schedule: options.schedule } : {}), ...(options.clock ? { clock: options.clock } : {}), ...(options.printing ? { printing: options.printing } : {}) });
  const setup = await runtime.handlers['setup:createShop']({ ...OWNER });

  const info = loadDeviceInfo(runtime.db);
  if (!info) throw new Error('setup did not create a device');
  const staffId = createUser(runtime.db, info.scope, { name: STAFF.name, username: STAFF.username, passwordHash: await hasher.hash(STAFF.password), role: 'staff' });
  const today = todayUtc(systemClock);
  const demo = seedDemoData(runtime.db, info.scope, setup.user.id, today);
  runtime.session.end();

  const shop: Shop = {
    runtime,
    demo,
    ownerId: setup.user.id,
    staffId,
    recoveryCode: setup.recoveryCode,
    today,
    signInAs: async (who) => {
      const creds = who === 'owner' ? OWNER : STAFF;
      await runtime.handlers['auth:login']({ username: creds.username, password: creds.password });
    },
    signOut: async () => void (await runtime.handlers['auth:logout']({})),
    count: (table) => (runtime.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c,
  };
  return shop;
}

export const day = (n: number): string => addDays(todayUtc(systemClock), n);

/**
 * A stand-in for the printer and the PDF maker. It records every page it is given (the complete HTML), so a test can read what would have
 * gone to paper; `printers` is what the PC "has", and `failPrint` makes the printer refuse.
 */
export function fakePrinting(options: { printers?: PrinterInfo[]; failPrint?: boolean; failPdf?: boolean } = {}) {
  const state = {
    printers: options.printers ?? [{ name: 'POS-80', display_name: 'POS-80 thermal', is_default: true }],
    failPrint: options.failPrint ?? false,
    failPdf: options.failPdf ?? false,
    printed: [] as { html: string; page: PrintPage; printerName: string | null }[],
    pdfs: [] as { html: string; page: PrintPage }[],
    saved: [] as { fileName: string; bytes: number }[],
  };
  const driver: PrintDriver = {
    listPrinters: async () => state.printers,
    print: async (html, { page, printerName }) => {
      if (state.failPrint) throw new Error('paper jam');
      state.printed.push({ html, page, printerName });
    },
    toPdf: async (html, { page }) => {
      if (state.failPdf) throw new Error('no pdf');
      state.pdfs.push({ html, page });
      return new Uint8Array([37, 80, 68, 70]);
    },
    savePdf: async (fileName, pdf) => {
      state.saved.push({ fileName, bytes: pdf.length });
      return `C:/Documents/Receipts/${fileName}`;
    },
  };
  return { driver, state };
}
