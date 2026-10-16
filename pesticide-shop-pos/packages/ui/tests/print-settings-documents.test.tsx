// @vitest-environment jsdom
// The owner-only print settings print_format, receipt_footer and shop_name on the screen side: the two printed papers, the Settings form, the Print
// buttons (default format) and the sidebar name. (The shell side, audit and permissions are in apps/desktop/tests/print-settings.test.ts.)
import { buildApi, type AppState, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import type { InvoiceDocumentData } from '@pos/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { PrintActions } from '../src/pages/invoices/print-actions.js';
import { SettingsPage } from '../src/pages/settings/settings-page.js';
import { buildSettingsRequest, draftFrom } from '../src/pages/settings/settings-state.js';
import { renderDocumentMarkup } from '../src/print/index.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };

// ---------------------------------------------------------------- the printed papers
function sale(shop: Partial<InvoiceDocumentData['shop']> = {}): InvoiceDocumentData {
  return {
    kind: 'receipt',
    invoice: {
      id: '11111111-1111-4111-8111-111111111111', invoice_no: 'INV-A-000002', invoice_date: '2026-10-12T05:42:00.000Z', due_date: null, status: 'active',
      payment_method: 'cash', price_type: 'retail', subtotal: 100_000, tax_total: 0, total: 100_000, paid_amount: 100_000, on_khata: 0,
    },
    customer: null,
    customer_id: null,
    sold_by: 'Owner',
    lines: [{ position: 1, name_en: 'Insecticide 1 L', name_ur: 'کیڑے مار دوا 1 لیٹر', batch_no: 'B-001', qty: 2000, base_unit: 'ml', pack_size: 1000, unit_price: 50_000, line_discount: 0, tax_rate_bp: 0, tax_amount: 0, line_total: 100_000 }],
    shop: { name: 'Pesticide Club Shop', name_ur: null, address: null, phone: null, ...shop },
    balance_as_of_sale: null,
    copies_printed: 0,
    is_copy: false,
    time_zone: 'Asia/Karachi',
  };
}
const paper = (kind: 'receipt' | 'invoice', shop: Partial<InvoiceDocumentData['shop']>, language: Language) => renderDocumentMarkup({ ...sale(shop), kind }, language);
const THANKS = { en: 'Thank you. Please keep this receipt.', ur: 'شکریہ۔ رسید سنبھال کر رکھیں۔' };

describe('the footer and the shop name on the printed papers', () => {
  for (const kind of ['receipt', 'invoice'] as const) {
    for (const language of ['en', 'ur'] as const) {
      it(`${kind} in ${language}: a non-empty footer replaces the thank-you line`, () => {
        const html = paper(kind, { footer: 'Goods once sold are not returned' }, language);
        expect(html).toMatch(/<footer class="thanks">(<span class="ltr">)?Goods once sold are not returned(<\/span>)?<\/footer>/);
        expect(html).not.toContain(THANKS[language]);
      });

      it(`${kind} in ${language}: no footer, an empty footer or spaces keep the standard thank-you line`, () => {
        for (const footer of [undefined, null, '', '    ']) expect(paper(kind, { footer }, language), JSON.stringify(footer)).toContain(`<footer class="thanks">${THANKS[language]}</footer>`);
      });

      it(`${kind} in ${language}: the footer is plain text; tags, quotes and ampersands cannot break out`, () => {
        const html = paper(kind, { footer: '</style><script>alert(1)</script> & "x" <b>' }, language);
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<b>');
        expect(html.replace(/<span class="ltr">([^<]*)<\/span>/g, '$1')).toContain('&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &lt;b&gt;');
        expect(html.match(/<\/style>/g) ?? []).toHaveLength(0); // markup only: the page's own style block is added around it by renderDocumentHtml
      });

      it(`${kind} in ${language}: the shop name is printed, as text`, () => {
        expect(paper(kind, { name: 'Burewala Agro Centre' }, language)).toContain('Burewala Agro Centre');
        const html = paper(kind, { name: 'A <b>&</b> B' }, language).replace(/<span class="ltr">([^<]*)<\/span>/g, '$1');
        expect(html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
        expect(html).not.toContain('<b>');
      });
    }
  }

  it('a long footer wraps instead of running off the paper', () => {
    expect(paper('receipt', { footer: 'x'.repeat(200) }, 'en')).toContain('x'.repeat(200));
  });
});

// ---------------------------------------------------------------- the Settings form
const CONFIG = {
  shop_name: 'Pesticide Club Shop', print_format: '80mm', receipt_footer: '', printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null,
};
type Handler = (input: any) => unknown;
function fakeShell(config: Record<string, unknown> = {}, extra: Partial<Record<Channel, Handler>> = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { config: { ...CONFIG, ...config } as Record<string, unknown> };
  const handlers: Partial<Record<Channel, Handler>> = {
    'print:getConfig': () => ({ ok: true, data: state.config }),
    'printers:list': () => ({ ok: true, data: [] }),
    'print:setConfig': (input) => {
      state.config = { ...state.config, ...input };
      return { ok: true, data: state.config };
    },
    ...extra,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : { ok: false as const, error: { code: 'INTERNAL', message: 'm', params: {} } };
  });
  return { api, calls, state, saves: () => calls.filter((c) => c.channel === 'print:setConfig').map((c) => c.input) };
}
function showSettings(shell: ReturnType<typeof fakeShell>, language: Language = 'en', onShopRenamed?: () => void) {
  return render(
    <MemoryRouter>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <SettingsPage api={shell.api} user={OWNER} onShopRenamed={onShopRenamed} />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const open = async (shell: ReturnType<typeof fakeShell>, language: Language = 'en', onShopRenamed?: () => void) => {
  showSettings(shell, language, onShopRenamed);
  await screen.findByLabelText((language === 'ur' ? ur : en).settings.shopName);
};
const save = (t = en.settings) => fireEvent.click(screen.getByRole('button', { name: t.save }));

afterEach(cleanup);

describe('Settings: print format, footer and shop name', () => {
  it('shows the saved shop name, format and footer, with the footer counter and the standard line as its placeholder', async () => {
    await open(fakeShell({ shop_name: 'Burewala Agro Centre', print_format: 'a4', receipt_footer: 'Hello' }));
    expect((screen.getByLabelText(en.settings.shopName) as HTMLInputElement).value).toBe('Burewala Agro Centre');
    const footer = screen.getByLabelText(en.settings.receiptFooter) as HTMLInputElement;
    expect(footer.value).toBe('Hello');
    expect(footer.maxLength).toBe(200);
    expect(footer.placeholder).toBe(en.settings.receiptFooterPlaceholder);
    expect(document.querySelector('[data-footer-count]')!.textContent).toBe('5 / 200');
    const group = screen.getByRole('radiogroup', { name: en.settings.printFormat });
    expect(within(group).getByRole('radio', { name: en.settings.formatA4 }).getAttribute('aria-checked')).toBe('true');
    expect(within(group).getByRole('radio', { name: en.settings.format80 }).getAttribute('aria-checked')).toBe('false');
  });

  it('the counter follows what is typed', async () => {
    await open(fakeShell());
    set(screen.getByLabelText(en.settings.receiptFooter), 'Goods once sold');
    expect(document.querySelector('[data-footer-count]')!.textContent).toBe('15 / 200');
  });

  it('with nothing changed nothing is sent; choosing the other paper sends print_format and nothing else', async () => {
    const shell = fakeShell();
    await open(shell);
    expect((screen.getByRole('button', { name: en.settings.save }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: en.settings.printFormat })).getByRole('radio', { name: en.settings.formatA4 }));
    save();
    await waitFor(() => expect(shell.saves()).toEqual([{ print_format: 'a4' }]));
  });

  it('editing only the footer sends only the footer, trimmed; emptying it sends an empty text so the standard line returns', async () => {
    const shell = fakeShell({ receipt_footer: 'Old footer' });
    await open(shell);
    set(screen.getByLabelText(en.settings.receiptFooter), '  New footer  ');
    save();
    await waitFor(() => expect(shell.saves()).toEqual([{ receipt_footer: 'New footer' }]));
    await waitFor(() => expect((screen.getByRole('button', { name: en.settings.save }) as HTMLButtonElement).disabled).toBe(true));
    set(screen.getByLabelText(en.settings.receiptFooter), '');
    save();
    await waitFor(() => expect(shell.saves()).toEqual([{ receipt_footer: 'New footer' }, { receipt_footer: '' }]));
  });

  it('the shop name cannot be emptied: Save stays off, nothing is sent, and the box is marked', async () => {
    const shell = fakeShell();
    await open(shell);
    const name = screen.getByLabelText(en.settings.shopName) as HTMLInputElement;
    set(name, '   ');
    const button = screen.getByRole('button', { name: en.settings.save }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    fireEvent.submit(name.closest('form')!);
    expect(shell.saves()).toEqual([]);
    // even with another field changed, a blank name keeps the whole form from being saved
    set(screen.getByLabelText(en.settings.receiptFooter), 'A footer');
    expect(button.disabled).toBe(true);
    fireEvent.submit(name.closest('form')!);
    expect(shell.saves()).toEqual([]);
  });

  it('renaming sends shop_name trimmed and tells the app so the sidebar can follow; other changes do not', async () => {
    const shell = fakeShell();
    const renamed = vi.fn();
    await open(shell, 'en', renamed);
    set(screen.getByLabelText(en.settings.receiptFooter), 'Only a footer');
    save();
    await waitFor(() => expect(shell.saves()).toHaveLength(1));
    expect(renamed).not.toHaveBeenCalled();
    set(screen.getByLabelText(en.settings.shopName), '  Burewala Agro Centre ');
    save();
    await waitFor(() => expect(shell.saves()).toEqual([{ receipt_footer: 'Only a footer' }, { shop_name: 'Burewala Agro Centre' }]));
    await waitFor(() => expect(renamed).toHaveBeenCalledTimes(1));
  });

  it('is in Urdu with the new words, and the footer counter stays left to right', async () => {
    await open(fakeShell(), 'ur');
    expect(screen.getByLabelText(ur.settings.receiptFooter)).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: ur.settings.printFormat })).toBeTruthy();
    expect(document.querySelector('[data-footer-count]')!.getAttribute('dir')).toBe('ltr');
  });

  it('buildSettingsRequest: only the three new fields, only when different', () => {
    const saved = draftFrom(CONFIG as never);
    expect(buildSettingsRequest(saved, saved)).toEqual({});
    expect(buildSettingsRequest(saved, { ...saved, shopName: ' New ', printFormat: 'a4', receiptFooter: ' hi ' })).toEqual({ shop_name: 'New', print_format: 'a4', receipt_footer: 'hi' });
    expect(buildSettingsRequest(saved, { ...saved, shopName: '  ' })).toEqual({}); // a blank name is never sent
    expect(buildSettingsRequest(saved, { ...saved, shopName: ' Pesticide Club Shop ' })).toEqual({}); // spaces only
  });
});

// ---------------------------------------------------------------- the Print buttons use the default format
function withPrint(config: Record<string, unknown> | 'fails', counter: boolean) {
  const shell = fakeShell(
    {},
    {
      'print:getConfig': () => (config === 'fails' ? { ok: false, error: { code: 'INTERNAL', message: 'm', params: {} } } : { ok: true, data: { ...CONFIG, ...config } }),
      'print:document': (input) => ({ ok: true, data: { status: 'printed', pdf_path: null, fallback: null, kind: input.kind, language: 'en', is_copy: false } }),
    },
  );
  render(
    <MemoryRouter>
      <I18nProvider language="en" onLanguageChange={() => undefined}>
        <ToastProvider>
          <PrintActions counter={counter} api={shell.api} invoiceId="11111111-1111-4111-8111-111111111111" kinds={['receipt', 'invoice']} />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
  const prints = () => shell.calls.filter((c) => c.channel === 'print:document').map((c) => c.input);
  return { shell, prints };
}
const btn = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!;

describe('the Print buttons print the default format', () => {
  it('counter, A4 default: the main button is "Print A4 invoice" and prints the invoice; Save PDF saves the invoice', async () => {
    const { prints } = withPrint({ print_format: 'a4' }, true);
    await waitFor(() => expect(btn('[data-print="invoice:printer"]')).toBeTruthy());
    await waitFor(() => expect(btn('[data-print="invoice:printer"]').disabled).toBe(false));
    expect(btn('[data-print="invoice:printer"]').textContent).toBe(en.invoices.print.invoice);
    expect(document.querySelector('[data-print="receipt:printer"]')).toBeNull();
    fireEvent.click(btn('[data-print="invoice:printer"]'));
    await waitFor(() => expect(prints()).toEqual([{ invoice_id: '11111111-1111-4111-8111-111111111111', kind: 'invoice', output: 'printer' }]));
    fireEvent.click(btn('[data-print="invoice:pdf"]'));
    await waitFor(() => expect(prints().at(-1)).toMatchObject({ kind: 'invoice', output: 'pdf' }));
  });

  it('counter, 80 mm default: "Print receipt" prints the receipt', async () => {
    const { prints } = withPrint({ print_format: '80mm' }, true);
    await waitFor(() => expect(btn('[data-print="receipt:printer"]').disabled).toBe(false));
    expect(btn('[data-print="receipt:printer"]').textContent).toBe(en.invoices.print.receipt);
    fireEvent.click(btn('[data-print="receipt:printer"]'));
    await waitFor(() => expect(prints()).toEqual([expect.objectContaining({ kind: 'receipt', output: 'printer' })]));
  });

  it('the Print button waits until the setting is read, so it can never print the wrong paper', async () => {
    let release: (v: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => (release = resolve));
    const shell = fakeShell({}, { 'print:getConfig': async () => (await gate, { ok: true, data: { ...CONFIG, print_format: 'a4' } }) });
    render(
      <MemoryRouter>
        <I18nProvider language="en" onLanguageChange={() => undefined}>
          <ToastProvider>
            <PrintActions counter api={shell.api} invoiceId="11111111-1111-4111-8111-111111111111" kinds={['receipt', 'invoice']} />
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(btn('[data-print$=":printer"]').disabled).toBe(true);
    release(null);
    await waitFor(() => expect(btn('[data-print="invoice:printer"]').disabled).toBe(false));
  });

  it('a setting that cannot be read means the receipt, like before the setting existed', async () => {
    const { prints } = withPrint('fails', true);
    await waitFor(() => expect(btn('[data-print="receipt:printer"]').disabled).toBe(false));
    fireEvent.click(btn('[data-print="receipt:printer"]'));
    await waitFor(() => expect(prints()).toEqual([expect.objectContaining({ kind: 'receipt' })]));
  });

  it('history, A4 default: the A4 button comes first and is marked as the default; the receipt and both PDF buttons stay', async () => {
    withPrint({ print_format: 'a4' }, false);
    await waitFor(() => expect(document.querySelector('[data-print-default]')).toBeTruthy());
    const order = [...document.querySelectorAll('[data-print]')].map((b) => b.getAttribute('data-print'));
    expect(order).toEqual(['invoice:printer', 'receipt:printer', 'invoice:pdf', 'receipt:pdf']);
    expect(document.querySelector('[data-print-default]')!.getAttribute('data-print')).toBe('invoice:printer');
  });

  it('history, 80 mm default: the receipt button comes first', async () => {
    const { prints } = withPrint({ print_format: '80mm' }, false);
    await waitFor(() => expect(document.querySelector('[data-print-default]')!.getAttribute('data-print')).toBe('receipt:printer'));
    expect([...document.querySelectorAll('[data-print]')].map((b) => b.getAttribute('data-print'))).toEqual(['receipt:printer', 'invoice:printer', 'receipt:pdf', 'invoice:pdf']);
    await waitFor(() => expect(btn('[data-print="invoice:printer"]').disabled).toBe(false));
    fireEvent.click(btn('[data-print="invoice:printer"]')); // the explicit A4 button still prints A4
    await waitFor(() => expect(prints()).toEqual([expect.objectContaining({ kind: 'invoice', output: 'printer' })]));
  });
});

// ---------------------------------------------------------------- the sidebar follows a rename
describe('the shop name in the sidebar', () => {
  beforeEach(() => {
    location.hash = '#/settings';
  });

  it('shows the new name right after the owner saves it, without signing in again', async () => {
    let appState: AppState = { phase: 'ready', language: 'en', shop: { name: 'Pesticide Club Shop' }, device: { name: 'Counter PC', code: 'A1' }, user: OWNER };
    const shell = fakeShell(
      {},
      {
        'app:getState': () => ({ ok: true, data: appState }),
        'print:setConfig': (input) => {
          if (input.shop_name) appState = { ...appState, shop: { name: input.shop_name } };
          shellState.config = { ...shellState.config, ...input };
          return { ok: true, data: shellState.config };
        },
      },
    );
    const shellState = shell.state;
    render(<App api={shell.api} />);
    const sidebar = () => document.querySelector('aside, nav')!.closest('aside') ?? document.body;
    await screen.findByLabelText(en.settings.shopName);
    expect(within(sidebar() as HTMLElement).getByText('Pesticide Club Shop')).toBeTruthy();
    set(screen.getByLabelText(en.settings.shopName), 'Burewala Agro Centre');
    save();
    await waitFor(() => expect(within(sidebar() as HTMLElement).getByText('Burewala Agro Centre')).toBeTruthy());
    expect(within(sidebar() as HTMLElement).queryByText('Pesticide Club Shop')).toBeNull();
  });
});
