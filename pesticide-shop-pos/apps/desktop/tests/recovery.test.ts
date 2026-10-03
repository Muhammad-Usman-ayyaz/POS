import { DomainError } from '@pos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRecoveryCodeHash } from '@pos/db-sqlite';
import { generateRecoveryCode, looksLikeRecoveryCode, normalizeRecoveryCode } from '../src/main/recovery.js';
import { argon2Hasher } from '../src/main/password.js';
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

describe('recovery code format', () => {
  const bytes = (...values: number[]) => () => Uint8Array.from({ length: 20 }, (_, i) => values[i % values.length] ?? 0);

  it('is 20 characters in five groups of four, from an alphabet without I, L, O or U', () => {
    const code = generateRecoveryCode(bytes(0, 1, 2, 3, 255, 128, 77));
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(code.replaceAll('-', '')).toHaveLength(20);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it('uses every one of the 32 letters equally: byte & 31 has no bias', () => {
    const seen = new Set<string>();
    for (let b = 0; b < 256; b++) seen.add(generateRecoveryCode(() => new Uint8Array(20).fill(b)).charAt(0));
    expect(seen.size).toBe(32);
  });

  it('is different every time with real random bytes', async () => {
    const { randomBytes } = await import('node:crypto');
    const codes = new Set(Array.from({ length: 200 }, () => generateRecoveryCode((n) => randomBytes(n))));
    expect(codes.size).toBe(200);
  });

  it('is cleaned up before checking: case, dashes, spaces and look-alike letters do not matter', () => {
    expect(normalizeRecoveryCode('abcd-efgh jkmn-pqrs-tvwx')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeRecoveryCode('O1IL-0000')).toBe('01110000'); // O is 0, I and L are 1
    expect(looksLikeRecoveryCode('0123-4567-89AB-CDEF-GHJK')).toBe(true);
    expect(looksLikeRecoveryCode('0123-4567')).toBe(false);
  });
});

describe('owner recovery', () => {
  let shop: Shop;
  const handlers = () => shop.runtime.handlers;
  const newPassword = 'a-brand-new-password';
  const reset = (over: Record<string, unknown> = {}) =>
    handlers()['auth:resetOwnerPassword']({ username: 'owner', recoveryCode: shop.recoveryCode, newPassword, ...over } as never);
  const audit = () => shop.runtime.db.prepare('SELECT user_id, action, details FROM audit_log ORDER BY rowid').all() as { user_id: string | null; action: string; details: string }[];

  beforeEach(async () => {
    shop = await makeShop();
  });
  afterEach(() => shop.runtime.close());

  it('stores only an argon2 hash of the code, never the code itself (real hasher)', async () => {
    const real = await makeShop({ hasher: argon2Hasher });
    try {
      const row = real.runtime.db.prepare('SELECT * FROM users WHERE username = ?').get('owner') as Record<string, unknown>;
      expect(row.recovery_code_hash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(row)).not.toContain(real.recoveryCode);
      expect(JSON.stringify(row)).not.toContain(real.recoveryCode.replaceAll('-', ''));
    } finally {
      real.runtime.close();
    }
  });

  it('is never sent back by the API after setup', async () => {
    await shop.signInAs('owner');
    expect(JSON.stringify(await handlers()['app:getState']({}))).not.toContain(shop.recoveryCode);
    expect(JSON.stringify(await handlers()['auth:me']({}))).not.toContain(shop.recoveryCode);
  });

  it('resets the password: the new one works, the old one does not', async () => {
    await reset();
    await expect(handlers()['auth:login']({ username: 'owner', password: newPassword })).resolves.toMatchObject({ role: 'owner' });
    await handlers()['auth:logout']({});
    expect((await failureOf(handlers()['auth:login']({ username: 'owner', password: OWNER.password }))).code).toBe('INVALID_CREDENTIALS');
  });

  it('accepts the code as the owner wrote it: lower case, spaces, no dashes, O for 0', async () => {
    const sloppy = shop.recoveryCode.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o');
    await expect(reset({ recoveryCode: sloppy })).resolves.toBeTruthy();
  });

  it('works once: it is replaced by a NEW code, and the old code stops working', async () => {
    const first = await reset();
    expect(first.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(first.recoveryCode).not.toBe(shop.recoveryCode);

    expect((await failureOf(reset({ newPassword: 'yet-another-password' }))).code).toBe('INVALID_RECOVERY_CODE'); // the old code again
    await expect(reset({ recoveryCode: first.recoveryCode, newPassword: 'yet-another-password' })).resolves.toBeTruthy(); // the new one
  });

  it('refuses a wrong code, and says nothing about whether the user exists', async () => {
    const wrong = await failureOf(reset({ recoveryCode: '0000-0000-0000-0000-0000' }));
    const noUser = await failureOf(reset({ username: 'nobody' }));
    const staff = await failureOf(reset({ username: STAFF.username })); // staff have no recovery code
    for (const e of [wrong, noUser, staff]) expect(e).toMatchObject({ code: 'INVALID_RECOVERY_CODE', message: 'that recovery code is not right' });
    // and nothing changed: the old password still works
    await expect(handlers()['auth:login']({ username: 'owner', password: OWNER.password })).resolves.toBeTruthy();
  });

  it('refuses a STAFF user even if they somehow have a valid recovery code hash: only an owner can reset this way', async () => {
    const code = 'ABCD-EFGH-JKMN-PQRS-TVWX';
    setRecoveryCodeHash(shop.runtime.db, shop.staffId, await fastHasher.hash(normalizeRecoveryCode(code)));
    const error = await failureOf(reset({ username: STAFF.username, recoveryCode: code }));
    expect(error.code).toBe('INVALID_RECOVERY_CODE');
    expect(audit().at(-1)).toMatchObject({ action: 'owner_password_reset_failed', user_id: shop.staffId });
    expect(JSON.parse(audit().at(-1)!.details)).toEqual({ username: 'staff', reason: 'not_an_owner_with_a_code' });
    // and the staff password did not change
    await expect(handlers()['auth:login']({ username: 'staff', password: STAFF.password })).resolves.toBeTruthy();
  });

  it('checks a hash even for a name that does not exist, so an unknown name takes as long as a wrong code', async () => {
    fastHasher.verifyCalls = 0;
    await failureOf(reset({ username: 'nobody' }));
    expect(fastHasher.verifyCalls).toBe(1);
  });

  it('writes the attempts to the audit log: failed ones with the reason, the successful one with the owner', async () => {
    await failureOf(reset({ recoveryCode: '0000-0000-0000-0000-0000' }));
    await failureOf(reset({ username: 'nobody' }));
    await reset();

    const rows = audit().slice(1); // the first row is the sign-in setup made
    expect(rows.map((r) => [r.action, r.user_id, JSON.parse(r.details)])).toEqual([
      ['owner_password_reset_failed', shop.ownerId, { username: 'owner', reason: 'wrong_code' }],
      ['owner_password_reset_failed', null, { username: 'nobody', reason: 'unknown_user' }],
      ['owner_password_reset', shop.ownerId, { username: 'owner' }],
    ]);
    expect(JSON.stringify(audit())).not.toContain(shop.recoveryCode);
    expect(JSON.stringify(audit())).not.toContain(newPassword);
  });

  it('signs out whoever was signed in', async () => {
    await shop.signInAs('staff');
    await reset();
    expect(shop.runtime.session.current()).toBeNull();
  });

  it('does not change the password if a step fails: password and code change together or not at all', async () => {
    const before = shop.runtime.db.prepare('SELECT password_hash, recovery_code_hash FROM users WHERE username = ?').get('owner');
    shop.runtime.db.exec(`CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_log WHEN NEW.action = 'owner_password_reset' BEGIN SELECT RAISE(ABORT, 'disk full'); END;`);
    await expect(reset()).rejects.toThrow(/disk full/);
    expect(shop.runtime.db.prepare('SELECT password_hash, recovery_code_hash FROM users WHERE username = ?').get('owner')).toEqual(before);
    await expect(handlers()['auth:login']({ username: 'owner', password: OWNER.password })).resolves.toBeTruthy();
  });

  describe('regenerating the code while signed in', () => {
    const regenerate = (password: string) => handlers()['auth:regenerateRecoveryCode']({ password });

    it('gives a new code, and the old one stops working', async () => {
      await shop.signInAs('owner');
      const { recoveryCode } = await regenerate(OWNER.password);
      expect(recoveryCode).not.toBe(shop.recoveryCode);
      await handlers()['auth:logout']({});
      expect((await failureOf(reset())).code).toBe('INVALID_RECOVERY_CODE');
      await expect(reset({ recoveryCode })).resolves.toBeTruthy();
    });

    it('needs the password again, and a signed-in owner', async () => {
      expect((await failureOf(regenerate(OWNER.password))).code).toBe('NOT_SIGNED_IN');
      await shop.signInAs('owner');
      expect((await failureOf(regenerate('not-the-password'))).code).toBe('INVALID_CREDENTIALS');
      await handlers()['auth:logout']({});
      await shop.signInAs('staff');
      expect((await failureOf(regenerate(STAFF.password))).code).toBe('NOT_AUTHORIZED');
    });

    it('is recorded in the audit log', async () => {
      await shop.signInAs('owner');
      await regenerate(OWNER.password);
      expect(audit().at(-1)).toMatchObject({ action: 'recovery_code_regenerated', user_id: shop.ownerId });
    });
  });

  it('works with the real argon2 hasher end to end', async () => {
    const real = await makeShop({ hasher: argon2Hasher });
    try {
      const result = await real.runtime.handlers['auth:resetOwnerPassword']({ username: 'owner', recoveryCode: real.recoveryCode, newPassword });
      expect(result.recoveryCode).not.toBe(real.recoveryCode);
      await expect(real.runtime.handlers['auth:login']({ username: 'owner', password: newPassword })).resolves.toBeTruthy();
      expect((await failureOf(real.runtime.handlers['auth:resetOwnerPassword']({ username: 'owner', recoveryCode: real.recoveryCode, newPassword: 'another-password-1' }))).code).toBe('INVALID_RECOVERY_CODE');
    } finally {
      real.runtime.close();
    }
  });
});

void fastHasher;
