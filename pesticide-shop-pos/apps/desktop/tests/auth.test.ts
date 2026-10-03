import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { argon2Hasher } from '../src/main/password.js';
import { createRuntime, type Runtime } from '../src/main/runtime.js';
import { fastHasher, makeShop, OWNER, STAFF, type Shop } from './support.js';

const failureOf = async (promise: Promise<unknown>): Promise<DomainError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error('expected a DomainError');
};

describe('start-up and first-launch setup', () => {
  let runtime: Runtime;
  beforeEach(async () => {
    runtime = await createRuntime({ dbPath: ':memory:', prefsPath: null, hasher: fastHasher });
  });
  afterEach(() => runtime.close());

  it('a fresh database needs setup', async () => {
    expect(await runtime.handlers['app:getState']({})).toEqual({ phase: 'needs-setup', language: 'en', shop: null, device: null, user: null });
  });

  it('setup creates the shop and the owner, signs the owner in, and returns the recovery code once', async () => {
    const result = await runtime.handlers['setup:createShop']({ ...OWNER });
    expect(result.user).toMatchObject({ name: 'Owner', username: 'owner', role: 'owner' });
    expect(result.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);

    expect(await runtime.handlers['app:getState']({})).toEqual({
      phase: 'ready',
      language: 'en',
      shop: { name: 'Pesticide Club Shop' },
      device: { name: 'Counter PC', code: 'A1' },
      user: result.user,
    });
  });

  it('can only be done once', async () => {
    await runtime.handlers['setup:createShop']({ ...OWNER });
    const error = await failureOf(runtime.handlers['setup:createShop']({ ...OWNER, shopName: 'Another shop', username: 'someoneelse' }));
    expect(error.code).toBe('ALREADY_SET_UP');
    expect((runtime.db.prepare('SELECT COUNT(*) AS c FROM shops').get() as { c: number }).c).toBe(1);
  });

  it('two setups at the same moment make one shop', async () => {
    const results = await Promise.allSettled([runtime.handlers['setup:createShop']({ ...OWNER }), runtime.handlers['setup:createShop']({ ...OWNER, username: 'second' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((runtime.db.prepare('SELECT COUNT(*) AS c FROM shops').get() as { c: number }).c).toBe(1);
    expect((runtime.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c).toBe(1);
  });

  it('after setup the first sign-in is recorded in the audit log', async () => {
    const { user } = await runtime.handlers['setup:createShop']({ ...OWNER });
    const rows = runtime.db.prepare('SELECT user_id, action, details FROM audit_log').all() as { user_id: string; action: string; details: string }[];
    expect(rows).toEqual([{ user_id: user.id, action: 'login', details: JSON.stringify({ username: 'owner', via: 'first_launch_setup' }) }]);
  });

  it('setup and sign-in work with the real argon2 hasher, and only hashes are stored', async () => {
    const real = await createRuntime({ dbPath: ':memory:', prefsPath: null, hasher: argon2Hasher });
    try {
      const { recoveryCode } = await real.handlers['setup:createShop']({ ...OWNER });
      const row = real.db.prepare('SELECT password_hash, recovery_code_hash FROM users').get() as { password_hash: string; recovery_code_hash: string };
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.recovery_code_hash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(row)).not.toContain(OWNER.password);
      expect(JSON.stringify(row)).not.toContain(recoveryCode.replaceAll('-', ''));

      await real.handlers['auth:logout']({});
      expect((await real.handlers['auth:login']({ username: 'owner', password: OWNER.password })).role).toBe('owner');
      await real.handlers['auth:logout']({});
      expect((await failureOf(real.handlers['auth:login']({ username: 'owner', password: 'wrong-password' }))).code).toBe('INVALID_CREDENTIALS');
    } finally {
      real.close();
    }
  });
});

describe('sign in and out', () => {
  let shop: Shop;
  const run = () => shop.runtime.handlers;
  const audit = () =>
    shop.runtime.db.prepare('SELECT user_id, action, row_id, details FROM audit_log ORDER BY rowid').all() as { user_id: string | null; action: string; row_id: string | null; details: string }[];

  beforeEach(async () => {
    shop = await makeShop();
    fastHasher.verifyCalls = 0;
  });
  afterEach(() => shop.runtime.close());

  it('needs a login after setup, and shows the shop and device on the Sign in screen', async () => {
    expect(await run()['app:getState']({})).toMatchObject({ phase: 'needs-login', shop: { name: 'Pesticide Club Shop' }, device: { name: 'Counter PC', code: 'A1' }, user: null });
  });

  it('signs the owner and the staff in with the right role, and keeps the session in the main process', async () => {
    expect(await run()['auth:login']({ username: 'owner', password: OWNER.password })).toMatchObject({ username: 'owner', role: 'owner' });
    expect(await run()['auth:me']({})).toMatchObject({ role: 'owner' });
    expect(await run()['app:getState']({})).toMatchObject({ phase: 'ready', user: { username: 'owner' } });

    await run()['auth:logout']({});
    expect(await run()['auth:me']({})).toBeNull();
    expect(await run()['auth:login']({ username: 'staff', password: STAFF.password })).toMatchObject({ username: 'staff', role: 'staff' });
  });

  it('never sends a password hash to the renderer', async () => {
    const user = await run()['auth:login']({ username: 'owner', password: OWNER.password });
    expect(Object.keys(user).sort()).toEqual(['id', 'name', 'role', 'username']);
    expect(JSON.stringify(await run()['app:getState']({}))).not.toMatch(/fake\$|argon2|hash/i);
  });

  it('a wrong password, an unknown user and an inactive user all get the SAME error', async () => {
    shop.runtime.db.prepare("UPDATE users SET is_active = 0 WHERE username = 'staff'").run();
    const attempts = [
      { username: 'owner', password: 'wrong-password' },
      { username: 'nobody', password: 'whatever-it-is' },
      { username: 'staff', password: STAFF.password }, // right password, but the account is switched off
    ];
    const errors = await Promise.all(attempts.map((a) => failureOf(run()['auth:login'](a))));
    for (const e of errors) expect(e).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'wrong username or password', params: {} });
    expect(await run()['auth:me']({})).toBeNull();
  });

  it('checks a hash even for a user that does not exist, so an unknown name takes as long as a wrong password', async () => {
    await failureOf(run()['auth:login']({ username: 'nobody', password: 'whatever-it-is' }));
    expect(fastHasher.verifyCalls).toBe(1);
  });

  it('writes every successful and failed sign-in to the audit log, with the reason', async () => {
    await run()['auth:login']({ username: 'owner', password: OWNER.password });
    await run()['auth:logout']({});
    await failureOf(run()['auth:login']({ username: 'owner', password: 'wrong-password' }));
    await failureOf(run()['auth:login']({ username: 'nobody', password: 'whatever-it-is' }));
    shop.runtime.db.prepare("UPDATE users SET is_active = 0 WHERE username = 'staff'").run();
    await failureOf(run()['auth:login']({ username: 'staff', password: STAFF.password }));

    const rows = audit().slice(1); // the first row is the sign-in that setup made
    expect(rows.map((r) => [r.action, r.user_id, JSON.parse(r.details)])).toEqual([
      ['login', shop.ownerId, { username: 'owner' }],
      ['login_failed', shop.ownerId, { username: 'owner', reason: 'wrong_password' }],
      ['login_failed', null, { username: 'nobody', reason: 'unknown_user' }],
      ['login_failed', shop.staffId, { username: 'staff', reason: 'inactive_user' }],
    ]);
  });

  it('never writes a password into the audit log', async () => {
    await failureOf(run()['auth:login']({ username: 'owner', password: 'super-secret-guess' }));
    expect(JSON.stringify(audit())).not.toContain('super-secret-guess');
  });

  it('signing out ends the session', async () => {
    await shop.signInAs('owner');
    await run()['auth:logout']({});
    expect(await run()['app:getState']({})).toMatchObject({ phase: 'needs-login', user: null });
    expect(shop.runtime.session.current()).toBeNull();
  });
});

describe('the language is remembered', () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'pos-prefs-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is saved before anyone signs in, and still there when the app restarts', async () => {
    const prefsPath = join(dir, 'preferences.json');
    const first = await createRuntime({ dbPath: ':memory:', prefsPath, hasher: fastHasher });
    expect((await first.handlers['app:getState']({})).language).toBe('en');
    expect(await first.handlers['prefs:setLanguage']({ language: 'ur' })).toBe('ur');
    first.close();

    expect(JSON.parse(readFileSync(prefsPath, 'utf8'))).toEqual({ language: 'ur' });
    const second = await createRuntime({ dbPath: ':memory:', prefsPath, hasher: fastHasher });
    expect((await second.handlers['app:getState']({})).language).toBe('ur');
    second.close();
  });
});
