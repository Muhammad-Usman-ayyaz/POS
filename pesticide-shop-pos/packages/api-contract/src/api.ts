import type { DomainErrorCode, ErrorParams } from '@pos/core';
import { channels, type Channel, type Input, type Output } from './contract.js';
import type { ApiResult, InputIssue } from './types.js';

/** What the UI catches. `code` is what to show the user; the message is English, for developers. */
export class ApiError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly params: ErrorParams = {},
    readonly issues: InputIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** `app:getState` becomes `api.app.getState`. */
type MethodName<C extends string, N extends string> = C extends `${N}:${infer M}` ? M : never;
type Namespace<C extends string> = C extends `${infer N}:${string}` ? N : never;

type Method<C extends Channel> = {} extends Input<C> ? (input?: Input<C>) => Promise<Output<C>> : (input: Input<C>) => Promise<Output<C>>;

/** The API the UI calls. Named functions only: no channel strings, no raw IPC. */
export type Api = {
  [N in Namespace<Channel>]: { [C in Channel as MethodName<C, N>]: Method<C> };
};

/** Sends one request to the shell. The Electron preload passes `ipcRenderer.invoke` here. */
export type Invoke = (channel: Channel, payload: unknown) => Promise<unknown>;

type BridgeMethod<C extends Channel> = {} extends Input<C> ? (input?: Input<C>) => Promise<ApiResult<Output<C>>> : (input: Input<C>) => Promise<ApiResult<Output<C>>>;

/**
 * The same named functions as Api, but each returns the result envelope and never throws. This is what the
 * Electron preload exposes to the page: an error class cannot cross the context bridge with its fields intact,
 * plain data can.
 */
export type Bridge = {
  [N in Namespace<Channel>]: { [C in Channel as MethodName<C, N>]: BridgeMethod<C> };
};

type Loose = Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;

/** Named functions on top of a transport. Used by the preload. */
export function buildBridge(invoke: Invoke): Bridge {
  const bridge: Loose = {};
  for (const channel of channels) {
    const [namespace, method] = channel.split(':') as [string, string];
    (bridge[namespace] ??= {})[method] = (input?: unknown) => invoke(channel, input ?? {}) as Promise<ApiResult<unknown>>;
  }
  return bridge as unknown as Bridge;
}

/** The API the UI uses, over a bridge: success returns the data, a failure throws an ApiError. */
export function apiFromBridge(bridge: Bridge): Api {
  const api: Loose = {};
  for (const channel of channels) {
    const [namespace, method] = channel.split(':') as [string, string];
    const call = (bridge as unknown as Loose)[namespace]?.[method];
    (api[namespace] ??= {})[method] = async (input?: unknown) => {
      if (!call) throw new ApiError('INTERNAL', `the shell does not offer ${channel}`);
      const result = (await call(input ?? {})) as ApiResult<unknown>;
      if (result.ok) return result.data;
      throw new ApiError(result.error.code, result.error.message, result.error.params, result.error.issues ?? []);
    };
  }
  return api as unknown as Api;
}

/** Bridge and API in one step, for tests and for shells that have no context bridge. */
export function buildApi(invoke: Invoke): Api {
  return apiFromBridge(buildBridge(invoke));
}
