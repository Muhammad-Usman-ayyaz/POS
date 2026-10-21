// The requests the statement screen and its print buttons send, built in one place with no React, so the desktop tests can send exactly these
// through the real handlers (the screen and the shell must agree). The renderer never says who is acting and never sends a language: the shell
// uses the language chosen in the print settings for that paper.
import type { Api, DocumentKind } from '@pos/api-contract';

export type PrintOutput = 'printer' | 'pdf';

type StatementInput = Parameters<Api['khata']['statement']>[0];
type PrintStatementInput = Parameters<Api['print']['statement']>[0];
type PrintReceiptInput = Parameters<Api['print']['paymentReceipt']>[0];
type ExportInput = Parameters<Api['khata']['exportStatement']>[0];

/** Only a date that is set is sent; '' means "no limit on that side". */
const range = (from: string, to: string): { from?: string; to?: string } => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) });

export const buildStatementRequest = (customerId: string, from: string, to: string): StatementInput => ({ customer_id: customerId, ...range(from, to) });
export const buildPrintStatementRequest = (customerId: string, from: string, to: string, kind: DocumentKind, output: PrintOutput): PrintStatementInput => ({
  customer_id: customerId,
  ...range(from, to),
  kind,
  output,
});
export const buildPrintReceiptRequest = (paymentId: string, output: PrintOutput): PrintReceiptInput => ({ payment_id: paymentId, output });
export const buildExportRequest = (customerId: string, from: string, to: string): ExportInput => ({ customer_id: customerId, ...range(from, to) });

/** The shop's calendar day today (`YYYY-MM-DD`) in a time zone. */
export function todayIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** From the 1st of this month to today. */
export function thisMonthRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** The last 30 days, today included (29 days back). Calendar maths in UTC on plain dates: no time zone involved. */
export function last30Range(today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 29);
  return { from: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, to: today };
}
