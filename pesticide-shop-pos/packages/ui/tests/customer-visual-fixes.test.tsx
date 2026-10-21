// @vitest-environment jsdom
// Phase 6 screenshot-run fixes (customers): the pieces that were wrong on screen, checked on the rendered output and the classes that decide the look.
// jsdom has no layout, so "fits in the window" is proved by the classes that make it fit (a sticky button row, a two-column body) and by the
// screenshot layout gate (apps/desktop/scripts/screenshots.mjs), which fails the run on overflow, clipping and targets under 44px.
import { buildApi, type Channel, type DuplicateMatchView } from '@pos/api-contract';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { CustomerPaymentDialog } from '../src/pages/customers/payment/customer-payment-dialog.js';
import { CustomerDuplicateDialog } from '../src/pages/customers/form/customer-form-duplicate-dialog.js';
import { CustomerDialog } from '../src/pages/pos/customer-dialog.js';
import { Actions } from '../src/pages/pos/counter-ui.js';
import { StatementPrintActions } from '../src/pages/khata/index.js';
import { SettingsNav } from '../src/pages/settings/customer-settings-section.js';

afterEach(cleanup);

const ok = (data: unknown) => ({ ok: true as const, data });
const inLang = (ui: React.ReactNode, language: 'en' | 'ur' = 'en') =>
  render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      {ui}
    </I18nProvider>,
  );
type Handler = (input: any) => unknown;
const shellOf = (handlers: Partial<Record<Channel, Handler>>) => {
  const calls: { channel: string; input: any }[] = [];
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const h = handlers[channel];
    return h ? h(input) : { ok: false as const, error: { code: 'INTERNAL', message: 'm', params: {} } };
  });
  return { api, calls };
};

// ---------- 1. dialogs that fit: the button row is always in view ----------

describe('counter dialogs: the buttons are always visible', () => {
  it('Actions is sticky to the bottom of the scrolling dialog, on the card colour, so Cancel and Save are never scrolled out of view', () => {
    inLang(<Actions data-testid="row" />);
    const cls = screen.getByTestId('row').className;
    expect(cls).toContain('sticky');
    expect(cls).toContain('bottom-0');
    expect(cls).toContain('bg-card');
  });

  it('Receive payment: amount and date share a row, reference and note share a row (non-cash), and the buttons stay at 48px in the sticky row', async () => {
    const { api } = shellOf({});
    inLang(<CustomerPaymentDialog api={api} customerId="c1" name="Rashid Ali" village="Chak 12" balance={900_000} onClose={() => undefined} onSaved={() => undefined} />);
    const form = document.querySelector('[data-payment-form]')!;
    const amount = form.querySelector('#pay-amount')!;
    const date = form.querySelector('[data-payment-date]')!;
    expect(amount.closest('.grid')!.className).toContain('grid-cols-'); // a real two-column row
    expect(amount.closest('.grid')).toBe(date.closest('.grid')); // one row
    await userEvent.setup().click(screen.getByRole('radio', { name: en.customerPayment.methods.bank }));
    const reference = form.querySelector('#pay-reference')!;
    const note = form.querySelector('#pay-note')!;
    expect(reference.closest('.grid')!.className).toContain('grid-cols-2');
    expect(reference.closest('.grid')).toBe(note.closest('.grid')); // one row
    const save = screen.getByRole('button', { name: en.customerPayment.save });
    expect(save.className).toContain('h-12');
    expect(save.closest('.sticky')?.className).toContain('bottom-0');
    expect(screen.getByRole('button', { name: en.customerPayment.cancel }).closest('.sticky')).toBe(save.closest('.sticky'));
  });

  it('Receive payment with the advance box showing still keeps the buttons in the sticky row', async () => {
    const { api } = shellOf({});
    inLang(<CustomerPaymentDialog api={api} customerId="c1" name="Rashid Ali" balance={100_000} onClose={() => undefined} onSaved={() => undefined} />);
    await userEvent.setup().type(document.querySelector<HTMLInputElement>('#pay-amount')!, '5000');
    expect(document.querySelector('[data-advance-confirm]')).not.toBeNull();
    expect(screen.getByRole('button', { name: en.customerPayment.save }).closest('.sticky')).not.toBeNull();
  });
});

// ---------- 3 and 4. the duplicate dialog ----------

const match = (over: Partial<DuplicateMatchView>): DuplicateMatchView => ({ customer_id: 'c1', name_en: 'Rashid Ali', name_ur: 'راشد علی', village: 'Chak 3', phone: null, balance: 0, same_name: true, same_phone: false, ...over }) as DuplicateMatchView;

describe('the duplicate dialog', () => {
  const dialog = (matches: DuplicateMatchView[], language: 'en' | 'ur' = 'en') =>
    inLang(<CustomerDuplicateDialog matches={matches} typedName="Rashid Ali" busy={false} onCancel={() => undefined} onOpen={() => undefined} onSaveNew={() => undefined} />, language);

  it('a clear account says Clear (never "Owes Rs 0"), in English and in Urdu; owes and advance keep their words', () => {
    dialog([match({ customer_id: 'a', balance: 0 }), match({ customer_id: 'b', balance: 250_000 }), match({ customer_id: 'c', balance: -50_000 })]);
    const text = [...document.querySelectorAll('[data-balance]')].map((b) => b.textContent);
    expect(text).toEqual([en.customerForm.clear, en.customerForm.owes('Rs 2,500'), en.customerForm.advance('Rs 500')]);
    expect(document.body.textContent).not.toMatch(/Owes Rs 0\b/);
    cleanup();
    dialog([match({ balance: 0 })], 'ur');
    expect(document.querySelector('[data-balance]')!.textContent).toBe(ur.customerForm.clear);
    expect(document.body.textContent).not.toContain('بقایا Rs 0');
  });

  it('two customers with the same name get different Open buttons (village and phone), in English and Urdu', () => {
    dialog([match({ customer_id: 'a', village: 'Chak 3', phone: null }), match({ customer_id: 'b', village: 'Chak 12', phone: '0300 1112223' })]);
    const names = screen.getAllByRole('button', { name: /^Open existing/ }).map((b) => b.textContent);
    expect(names).toEqual([en.customerForm.dupOpen('Rashid Ali (Chak 3)'), en.customerForm.dupOpen('Rashid Ali (Chak 12 · 0300 1112223)')]);
    expect(new Set(names).size).toBe(2);
    cleanup();
    dialog([match({ customer_id: 'a', village: 'Chak 3' }), match({ customer_id: 'b', village: 'Chak 12' })], 'ur');
    const urNames = screen.getAllByRole('button', { name: /کھولیں/ }).map((b) => b.textContent);
    expect(urNames).toEqual([ur.customerForm.dupOpen('راشد علی (Chak 3)'), ur.customerForm.dupOpen('راشد علی (Chak 12)')]);
  });

  it('with no village and no phone the balance tells the buttons apart', () => {
    dialog([match({ customer_id: 'a', village: null, balance: 0 }), match({ customer_id: 'b', village: null, balance: 100_000 })]);
    const names = screen.getAllByRole('button', { name: /^Open existing/ }).map((b) => b.textContent);
    expect(names).toEqual([en.customerForm.dupOpen(`Rashid Ali (${en.customerForm.clear})`), en.customerForm.dupOpen(`Rashid Ali (${en.customerForm.owes('Rs 1,000')})`)]);
  });
});

describe('the customer picker', () => {
  it('a clear account says Clear, an advance says Advance, only a real balance says Owes (never "Owes Rs 0" or a minus)', async () => {
    const row = (id: string, balance: number) => ({ id, name_en: `C${id}`, name_ur: null, village: 'V', phone: null, default_price_type: 'retail', credit_limit: 0, balance });
    const { api } = shellOf({ 'customers:search': () => ok([row('1', 0), row('2', 120_000), row('3', -50_000)]) });
    inLang(<CustomerDialog api={api} current={null} onPick={() => undefined} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByText(en.pos.customer.clear)).toBeTruthy());
    const list = within(screen.getByRole('listbox'));
    expect(list.getByText(en.pos.customer.owes('Rs 1,200'))).toBeTruthy();
    expect(list.getByText(en.pos.customer.advance('Rs 500'))).toBeTruthy();
    expect(list.queryByText(/Owes Rs 0\b/)).toBeNull();
    expect(list.queryByText(/Owes Rs -/)).toBeNull();
  });
});

// ---------- 5 and 6. the statement buttons ----------

describe('the statement buttons', () => {
  it('draw only the button row when there is nothing to say (an empty full-width box would wrap the row and make the buttons uneven)', () => {
    const { api } = shellOf({});
    inLang(<StatementPrintActions api={api} customerId="c1" from="" to="" />);
    const row = document.querySelector('[data-statement-actions]')!;
    expect(row.querySelector('[data-statement-notices]')).toBeNull();
    for (const b of row.querySelectorAll('button')) {
      expect(b.className).toContain('h-12');
      expect(b.parentElement).toBe(row);
    }
  });

  it('a saved CSV shows its notice in a floating panel (out of the page flow, so the buttons and the table never move), after the buttons, with the long path clamped to two lines and the whole path on hover', async () => {
    const path = 'C:/Users/Shop Owner/Documents/Khata statements/2026/October/Rashid Ali - statement 01 Oct to 31 Oct 2026 (final copy).csv';
    const { api } = shellOf({ 'khata:exportStatement': () => ok({ status: 'saved', path }) });
    inLang(<StatementPrintActions api={api} customerId="c1" from="" to="" />);
    await userEvent.setup().click(screen.getByRole('button', { name: en.statement.exportCsv }));
    await waitFor(() => expect(document.querySelector('[data-csv-outcome="saved"]')).not.toBeNull());
    const notices = document.querySelector('[data-statement-notices]')!;
    const last = document.querySelector('[data-statement-export]')!;
    expect(last.compareDocumentPosition(notices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notices.className).toContain('fixed'); // not in the flow: nothing below it moves
    const shown = notices.querySelector('[data-csv-path]')!;
    expect(shown.className).toContain('line-clamp-2');
    expect(shown.className).toContain('break-all');
    expect(shown.getAttribute('title')).toBe(path);
  });

  it('the floating notice can be closed, and comes back for the next result', async () => {
    const { api } = shellOf({ 'khata:exportStatement': () => ok({ status: 'cancelled' }) });
    inLang(<StatementPrintActions api={api} customerId="c1" from="" to="" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: en.statement.exportCsv }));
    await waitFor(() => expect(document.querySelector('[data-csv-outcome="cancelled"]')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: en.statement.dismissNotice }));
    expect(document.querySelector('[data-statement-notices]')).toBeNull();
    await user.click(screen.getByRole('button', { name: en.statement.exportCsv }));
    await waitFor(() => expect(document.querySelector('[data-csv-outcome="cancelled"]')).not.toBeNull());
  });
});

// ---------- 7. the Settings nav marker ----------

describe('the Settings nav', () => {
  it.each(['en', 'ur'] as const)('marks the current section with a LOGICAL start border (%s), so it sits on the reading-start side in both directions', (language) => {
    inLang(<SettingsNav section="customers" onSelect={() => undefined} shopLabel="Shop" label="Sections" />, language);
    const here = document.querySelector('[aria-current="page"]')!;
    expect(here.className).toContain('border-s-[3px]');
    expect(here.className).toContain('border-accent');
    expect(here.className).not.toMatch(/\brtl:|shadow-\[inset|border-l|border-r|\bpl-|\bpr-/);
  });
});
