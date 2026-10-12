import type { Clock } from '@pos/core';
import { DomainError } from '@pos/core';

/**
 * How many wrong passwords in a row lock something out, and for how long. The first lock is 30 seconds; each time five more wrong passwords
 * bring the lock back (after it ends) it doubles, up to 15 minutes. The count of wrong passwords starts again from zero when a lock starts. A right password clears everything.
 */
export const THROTTLE = { maxFailures: 5, firstLockMs: 30_000, maxLockMs: 15 * 60_000 } as const;

interface Entry {
  failures: number;
  locks: number;
  lockedUntil: number;
}

/**
 * Remembers wrong passwords per key and refuses further tries while a key is locked. Used for sign-in (key: the username) and for the owner's
 * approval at the counter (key: the person asking), with this one policy, so both behave the same.
 *
 * Kept in memory: closing the app clears it (the argon2 hashing, about a quarter of a second a try, still limits guessing in the meantime).
 * A locked key refuses without checking the password, so a locked-out caller learns nothing, not even whether the password was right.
 */
export class AttemptThrottle {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock) {}

  private now(): number {
    return this.clock.now().getTime();
  }

  /** Throws TOO_MANY_ATTEMPTS (with the seconds left) when this key is locked. */
  check(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    const left = entry.lockedUntil - this.now();
    if (left > 0) {
      throw new DomainError('TOO_MANY_ATTEMPTS', 'too many wrong passwords: wait and try again', { seconds: Math.ceil(left / 1000) });
    }
  }

  /** Records a wrong password. Returns the lock that started, if this one was the last allowed. */
  fail(key: string): { lockedForSeconds: number } | null {
    this.prune();
    const entry = this.entries.get(key) ?? { failures: 0, locks: 0, lockedUntil: 0 };
    entry.failures += 1;
    let started: { lockedForSeconds: number } | null = null;
    if (entry.failures >= THROTTLE.maxFailures) {
      const ms = Math.min(THROTTLE.firstLockMs * 2 ** entry.locks, THROTTLE.maxLockMs);
      entry.lockedUntil = this.now() + ms;
      entry.locks += 1;
      entry.failures = 0;
      started = { lockedForSeconds: Math.ceil(ms / 1000) };
    }
    this.entries.set(key, entry);
    return started;
  }

  /** A right password: forget every wrong one. */
  succeed(key: string): void {
    this.entries.delete(key);
  }

  /** Drops keys that are neither locked nor holding failures worth remembering, so the map cannot grow without end. */
  private prune(): void {
    if (this.entries.size < 500) return;
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.lockedUntil <= now && entry.failures === 0) this.entries.delete(key);
  }
}
