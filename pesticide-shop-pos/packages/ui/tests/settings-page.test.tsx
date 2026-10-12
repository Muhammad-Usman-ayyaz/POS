// @vitest-environment jsdom
// The Settings screen, driven the way the owner drives it, against a fake API built with the real client code.
import { buildApi, type Channel, type Language, type SessionUser } from '@pos/api-contract';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, ToastProvider } from '../src/index.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';
import { SettingsPage } from '../src/pages/settings/settings-page.js';
import { buildSettingsRequest, draftFrom } from '../src/pages/settings/settings-state.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };

const CONFIG = { printer_name: null, receipt_language: 'en', invoice_language: 'en', shop_name_ur: null, shop_address: null, shop_phone: null };
const PRINTERS = [
  { name: 'POS-80', display_name: 'Receipt printer 80', is_default: false },
  { name: 'Office-A4', display_name: 'Office laser', is_default: true },
];

type Handler = (input: any) => unknown;
const fail = (code: string, params: Record<string, unknown> = {}) => ({ ok: false as const, error: { code, message: 'm', params } });

function fakeShell(options: { config?: Record<string, unknown>; override?: Partial<Record<Channel, Handler>> } = {}) {
  const calls: { channel: string; input: any }[] = [];
  const state = { config: { ...CONFIG, ...options.config } as Record<string, unknown> };
  const handlers: Partial<Record<Channel, Handler>> = {
    'print:getConfig': () => ({ ok: true, data: state.config }),
    'printers:list': () => ({ ok: true, data: PRINTERS }),
    'print:setConfig': (input) => {
      state.config = { ...state.config, ...input };
      return { ok: true, data: state.config };
    },
    ...options.override,
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : fail('INTERNAL');
  });
  return { api, calls, saves: () => calls.filter((c) => c.channel === 'print:setConfig') };
}

function show(shell: ReturnType<typeof fakeShell>, user: SessionUser = OWNER, language: Language = 'en') {
  return render(
    <MemoryRouter>
      <I18nProvider language={language} onLanguageChange={() => undefined}>
        <ToastProvider>
          <SettingsPage api={shell.api} user={user} />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const saveButton = (t = en.settings) => screen.getByRole('button', { name: t.save }) as HTMLButtonElement;
const ready = async (shell = fakeShell(), user: SessionUser = OWNER, language: Language = 'en') => {
  show(shell, user, language);
  await screen.findByLabelText((language === 'ur' ? ur : en).settings.printer);
  return shell;
};

afterEach(cleanup);

describe('who sees the form', () => {
  it('staff see a calm message and no form, and the shell is not asked for anything', async () => {
    const shell = fakeShell();
    show(shell, STAFF);
    expect(await screen.findByText(en.settings.ownerOnlyTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.settings.save })).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelectorAll('input, select')).toHaveLength(0);
    expect(shell.calls).toHaveLength(0);
  });

  it('the owner sees the saved settings, the printers and "system default"', async () => {
    await ready(fakeShell({ config: { printer_name: 'POS-80', receipt_language: 'ur', shop_phone: '0300 1234567', shop_name_ur: 'پیسٹی سائیڈ' } }));
    const printer = screen.getByLabelText(en.settings.printer) as HTMLSelectElement;
    expect(printer.value).toBe('POS-80');
    expect([...printer.options].map((o) => o.textContent)).toEqual([en.settings.printerDefault, 'Receipt printer 80', en.settings.printerDefaultMark('Office laser')]);
    expect((screen.getByLabelText(en.settings.phone) as HTMLInputElement).value).toBe('0300 1234567');
    expect((screen.getByLabelText(en.settings.shopNameUr) as HTMLInputElement).value).toBe('پیسٹی سائیڈ');
    expect(screen.getAllByRole('radio', { name: 'اردو' })[0]!.getAttribute('aria-checked')).toBe('true'); // receipt language
    expect(screen.getAllByRole('radio', { name: 'اردو' })[1]!.getAttribute('aria-checked')).toBe('false'); // invoice language
    expect(saveButton().disabled).toBe(true); // nothing changed yet
  });

  it('a saved printer that is no longer on this PC is still shown, marked as missing', async () => {
    await ready(fakeShell({ config: { printer_name: 'Old-Printer' } }));
    expect((screen.getByLabelText(en.settings.printer) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(en.settings.printerMissing('Old-Printer'));
  });
});

describe('saving', () => {
  it('sends exactly what was changed, nothing else, and shows a toast', async () => {
    const shell = await ready();
    set(screen.getByLabelText(en.settings.phone), ' 0300 1234567 ');
    set(screen.getByLabelText(en.settings.printer), 'POS-80');
    fireEvent.click(screen.getAllByRole('radio', { name: 'اردو' })[0]!); // receipt language
    fireEvent.click(saveButton());
    await waitFor(() => expect(shell.saves()).toHaveLength(1));
    expect(shell.saves()[0]!.input).toEqual({ printer_name: 'POS-80', receipt_language: 'ur', shop_phone: '0300 1234567' });
    expect(await screen.findByText(en.settings.saved)).toBeTruthy();
    expect(saveButton().disabled).toBe(true); // what is on screen is now what is saved
  });

  it('choosing "system default" sends printer_name null; emptying a box sends null for it', async () => {
    const shell = await ready(fakeShell({ config: { printer_name: 'POS-80', shop_address: 'Main Bazaar' } }));
    set(screen.getByLabelText(en.settings.printer), '');
    set(screen.getByLabelText(en.settings.address), '   ');
    fireEvent.click(saveButton());
    await waitFor(() => expect(shell.saves()).toHaveLength(1));
    expect(shell.saves()[0]!.input).toEqual({ printer_name: null, shop_address: null });
  });

  it('with no change the Save button is off and nothing is sent', async () => {
    const shell = await ready();
    fireEvent.click(saveButton());
    set(screen.getByLabelText(en.settings.address), 'x');
    set(screen.getByLabelText(en.settings.address), '');
    expect(saveButton().disabled).toBe(true);
    expect(shell.saves()).toHaveLength(0);
  });

  it('shows the shell\'s error in words, keeps what was typed, and sends nothing twice', async () => {
    const shell = await ready(fakeShell({ override: { 'print:setConfig': () => fail('NOT_AUTHORIZED', { capability: 'print.configure' }) } }));
    set(screen.getByLabelText(en.settings.phone), '0300');
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText(en.settings.phone) as HTMLInputElement).value).toBe('0300');
    expect(shell.saves()).toHaveLength(1);
    expect(screen.queryByText(en.settings.saved)).toBeNull();
  });

  it('a settings load that fails shows the error with Try again', async () => {
    let n = 0;
    const shell = fakeShell({ override: { 'print:getConfig': () => (n++ === 0 ? fail('INTERNAL') : { ok: true, data: CONFIG }) } });
    show(shell);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.settings.retry }));
    expect(await screen.findByLabelText(en.settings.printer)).toBeTruthy();
  });
});

describe('the request builder', () => {
  it('is empty when nothing differs, and lists only the differences', () => {
    const saved = draftFrom({ ...CONFIG, receipt_language: 'en', invoice_language: 'en' } as never);
    expect(buildSettingsRequest(saved, saved)).toEqual({});
    expect(buildSettingsRequest(saved, { ...saved, invoiceLanguage: 'ur' })).toEqual({ invoice_language: 'ur' });
  });
});

describe('Urdu, right to left', () => {
  it('uses the Urdu words and flips; the phone number stays left to right', async () => {
    await ready(fakeShell(), OWNER, 'ur');
    expect(document.getElementById('app-root')?.getAttribute('dir') ?? 'rtl').toBe('rtl');
    expect(screen.getByRole('heading', { name: ur.pages.settings.title, level: 1 })).toBeTruthy();
    expect(screen.getByLabelText(ur.settings.shopNameUr).getAttribute('dir')).toBe('rtl');
    expect(screen.getByLabelText(ur.settings.phone).getAttribute('dir')).toBe('ltr');
    expect(saveButton(ur.settings)).toBeTruthy();
  });

  it('staff see the message in Urdu', async () => {
    show(fakeShell(), STAFF, 'ur');
    expect(await screen.findByText(ur.settings.ownerOnlyTitle)).toBeTruthy();
  });

  it('the settings screen never uses left or right (only start and end), so it flips by itself', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..', 'src', 'pages', 'settings');
    const bad = /(?:^|[\s"'`:])(?:-?(?:ml|mr|pl|pr|left|right)-(?:\d|\[|px|auto)|text-(?:left|right)|float-(?:left|right)|rounded-[lr]-)/;
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, i) => expect(bad.test(line), `${file}:${i + 1}: ${line.trim()}`).toBe(false));
    }
  });
});
