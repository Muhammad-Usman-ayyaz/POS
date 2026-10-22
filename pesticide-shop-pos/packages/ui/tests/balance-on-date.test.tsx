// @vitest-environment jsdom
// "Balance on date": the screen sends only `to` and shows the shell's closing_balance, with no arithmetic of its own.
import { buildApi, type Channel } from '@pos/api-contract';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { BalanceOnDate } from '../src/pages/khata/balance-on-date.js';
import { scanSource } from './source-scan.js';

type Handler = (input: any) => unknown;
function shell(closing: (to: string) => number | null) {
  const calls: { channel: string; input: any }[] = [];
  const handlers: Partial<Record<Channel, Handler>> = {
    'khata:statement': (input) => (closing(input.to) === null ? { ok: false, error: { code: 'NOT_FOUND', message: 'm', params: {} } } : { ok: true, data: { lines: [], brought_forward: 0, totals: { owes_more: 0, owes_less: 0 }, closing_balance: closing(input.to) } }),
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    return (handlers[channel] ?? (() => ({ ok: false, error: { code: 'INTERNAL', message: 'm', params: {} } })))(input) as never;
  });
  return { api, calls };
}
const show = (s: ReturnType<typeof shell>, language: 'en' | 'ur' = 'en') =>
  render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      <BalanceOnDate api={s.api} customerId="c1" />
    </I18nProvider>,
  );
const box = () => document.querySelector<HTMLInputElement>('input[name="balance-on"]')!;
afterEach(cleanup);

describe('Balance on date', () => {
  it('asks nothing until a date is typed, then sends only the customer and `to`, and shows the shell\'s closing balance', async () => {
    const s = shell(() => 123_400);
    show(s);
    expect(screen.getAllByText(en.statement.balanceOnLabel).length).toBeGreaterThan(0);
    expect(s.calls).toHaveLength(0);
    await userEvent.setup().type(box(), '05 Oct 2026');
    await waitFor(() => expect(document.querySelector('[data-balance-on-value]')).not.toBeNull());
    expect(s.calls.at(-1)!.input).toEqual({ customer_id: 'c1', to: '2026-10-05' });
    expect(document.querySelector('[data-balance-on-value]')!.textContent).toBe(en.statement.balanceOnResult('5 Oct 2026', 'Rs 1,234'));
  });

  it('words a negative closing balance as an Advance, never a minus', async () => {
    show(shell(() => -50_000));
    await userEvent.setup().type(box(), '05 Oct 2026');
    await waitFor(() => expect(document.querySelector('[data-balance-on-value]')).not.toBeNull());
    expect(document.querySelector('[data-balance-on-value]')!.textContent).toBe(en.statement.balanceOnResult('5 Oct 2026', 'Advance Rs 500'));
  });

  it('shows the error from the shell and no balance', async () => {
    show(shell(() => null));
    await userEvent.setup().type(box(), '05 Oct 2026');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(document.querySelector('[data-balance-on-value]')).toBeNull();
  });

  it('the component does no arithmetic on the balance and names no time zone', () => {
    const code = scanSource(readFileSync(join(__dirname, '../src/pages/khata/balance-on-date.tsx'), 'utf8')).code;
    expect(code).not.toMatch(/closing\s*[+*/]|[+*/]\s*closing|reduce\(|Asia\/Karachi|timeZone/);
  });
});
