import { hash, verify } from '@node-rs/argon2';

/** Passwords and recovery codes are hashed in the main process only. The renderer never sees a hash. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /** False for a wrong password and also for a hash that cannot be read. Never throws. */
  verify(hash: string, plain: string): Promise<boolean>;
}

/** argon2id with the library defaults (19 MiB, 2 passes). About 70 ms: fast enough to sign in, slow enough to resist guessing. */
export const argon2Hasher: PasswordHasher = {
  hash: (plain) => hash(plain),
  verify: async (storedHash, plain) => {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false;
    }
  },
};
