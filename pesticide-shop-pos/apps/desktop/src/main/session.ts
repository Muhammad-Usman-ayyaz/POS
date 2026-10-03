import type { Role, SessionUser } from '@pos/api-contract';
import { DomainError } from '@pos/core';

/**
 * Who is signed in. Held in the main process only: the renderer cannot read or forge it, and it never
 * says who is acting. Every request takes the user from here. One PC, one signed-in user at a time.
 */
export class SessionStore {
  private user: SessionUser | null = null;

  start(user: { id: string; name: string; username: string; role: Role }): SessionUser {
    this.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    return this.user;
  }

  end(): void {
    this.user = null;
  }

  current(): SessionUser | null {
    return this.user;
  }

  /** The signed-in user, or a NOT_SIGNED_IN error. */
  require(): SessionUser {
    if (!this.user) throw new DomainError('NOT_SIGNED_IN', 'sign in first');
    return this.user;
  }
}
