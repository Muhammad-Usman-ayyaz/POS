// The requests the invoice history and the print buttons send, built in one place with no React, so the desktop tests can send exactly these
// through the real handlers (`@pos/ui/rules`): the screen and the shell must agree.
import type { Api, DocumentKind } from '@pos/api-contract';

export type StatusFilter = 'all' | 'active' | 'voided';
export type PrintOutput = 'printer' | 'pdf';
export const PAGE_SIZE = 25;

export interface ListFilters {
  query: string;
  status: StatusFilter;
  from: string;
  to: string;
  offset: number;
}

type ListInput = NonNullable<Parameters<Api['invoices']['list']>[0]>;
type PrintInput = Parameters<Api['print']['document']>[0];

/** Only what is set is sent. The language is never sent: the shell uses the one chosen in the print settings. */
export function buildListRequest(f: ListFilters): ListInput {
  return {
    ...(f.query.trim() ? { query: f.query.trim() } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
    ...(f.status !== 'all' ? { status: f.status } : {}),
    limit: PAGE_SIZE,
    offset: f.offset,
  };
}

export function buildPrintRequest(invoiceId: string, kind: DocumentKind, output: PrintOutput): PrintInput {
  return { invoice_id: invoiceId, kind, output };
}
