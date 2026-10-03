import { channels, contract, type ApiErrorPayload, type ApiResult, type Channel } from '@pos/api-contract';
import { DomainError } from '@pos/core';
import type { Handlers } from './runtime.js';

/** The part of Electron's ipcMain we use. A fake with the same shape is used in tests. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void;
}

export interface IpcEventLike {
  sender: { id: number };
  senderFrame: { url: string; parent: unknown | null } | null;
}

export type SenderCheck = (event: IpcEventLike) => boolean;

function failure(error: ApiErrorPayload): ApiResult<never> {
  return { ok: false, error };
}

/** Turns anything that was thrown into the answer the renderer gets. Unexpected errors are logged here and not leaked. */
export function toErrorResult(error: unknown, log: (message: string, error: unknown) => void = console.error): ApiResult<never> {
  if (error instanceof DomainError) {
    return failure({ code: error.code, message: error.message, params: error.params });
  }
  log('Unexpected error in an API handler:', error);
  return failure({ code: 'INTERNAL', message: 'something went wrong', params: {} });
}

/**
 * Registers one handler per channel in the contract. For every call, in this order:
 *   1. the sender must be our own window and page (otherwise NOT_AUTHORIZED, no handler runs)
 *   2. the payload is validated with the channel's strict Zod schema (otherwise INVALID_INPUT, no handler runs)
 *   3. the handler runs; whatever it throws becomes an error result with the same code
 * The renderer therefore can only call named channels, with checked input, from the right place.
 */
export function registerIpc(ipcMain: IpcMainLike, handlers: Handlers, isTrusted: SenderCheck, log?: (message: string, error: unknown) => void): void {
  for (const channel of channels) {
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrusted(event)) {
        return failure({ code: 'NOT_AUTHORIZED', message: 'this caller is not allowed to use the API', params: {} });
      }

      const parsed = contract[channel].input.safeParse(payload ?? {});
      if (!parsed.success) {
        return failure({
          code: 'INVALID_INPUT',
          message: 'the request is not valid',
          params: {},
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }

      try {
        const handler = handlers[channel as Channel] as (input: unknown) => Promise<unknown>;
        return { ok: true, data: await handler(parsed.data) } satisfies ApiResult<unknown>;
      } catch (error) {
        return toErrorResult(error, log);
      }
    });
  }
}
