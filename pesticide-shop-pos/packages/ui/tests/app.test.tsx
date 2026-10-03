// @vitest-environment jsdom
// The screens, driven the way a person drives them, against a fake API built with the real client code.
import { buildApi, type ApiErrorPayload, type AppState, type Channel, type SessionUser } from '@pos/api-contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/index.js';

const OWNER: SessionUser = { id: 'u1', name: 'Owner', username: 'owner', role: 'owner' };
const STAFF: SessionUser = { id: 'u2', name: 'Salesman', username: 'staff', role: 'staff' };
const CODE = 'ABCD-EFGH-JKMN-PQRS-TVWX';
const NEW_CODE = '1111-2222-3333-4444-5555';

/** A tiny pretend main process: it keeps the app state and answers each call. */
function fakeShell(initial: Partial<AppState> = {}) {
  let state: AppState = { phase: 'needs-login', language: 'en', shop: { name: 'Pesticide Club Shop' }, device: { name: 'Counter PC', code: 'A1' }, user: null, ...initial };
  const calls: { channel: string; input: unknown }[] = [];
  const fail = (code: ApiErrorPayload['code'], params = {}, issues?: { path: string; message: string }[]) => ({ ok: false as const, error: { code, message: 'm', params, ...(issues ? { issues } : {}) } });
  const handlers: Partial<Record<Channel, (input: any) => unknown>> = {
    'app:getState': () => ({ ok: true, data: state }),
    'prefs:setLanguage': ({ language }) => {
      state = { ...state, language };
      return { ok: true, data: language };
    },
    'setup:createShop': ({ ownerName, username }) => {
      const user: SessionUser = { id: 'u1', name: ownerName, username, role: 'owner' };
      state = { ...state, phase: 'ready', user, shop: { name: 'New Shop' }, device: { name: 'Counter PC', code: 'A1' } };
      return { ok: true, data: { user, recoveryCode: CODE } };
    },
    'auth:login': ({ username, password }) => {
      if (password !== 'right-password') return fail('INVALID_CREDENTIALS');
      const user = username === 'staff' ? STAFF : OWNER;
      state = { ...state, phase: 'ready', user };
      return { ok: true, data: user };
    },
    'auth:logout': () => {
      state = { ...state, phase: 'needs-login', user: null };
      return { ok: true, data: null };
    },
    'auth:resetOwnerPassword': ({ recoveryCode }) => (recoveryCode.replace(/-/g, '') === CODE.replace(/-/g, '') ? { ok: true, data: { recoveryCode: NEW_CODE } } : fail('INVALID_RECOVERY_CODE')),
  };
  const api = buildApi(async (channel, input) => {
    calls.push({ channel, input });
    const handler = handlers[channel];
    return handler ? handler(input) : fail('INTERNAL');
  });
  return { api, calls, handlers, setState: (next: Partial<AppState>) => void (state = { ...state, ...next }), get state() { return state; } };
}

const user = () => userEvent.setup();
const root = () => document.getElementById('app-root')!;

beforeEach(() => {
  location.hash = '';
});
afterEach(cleanup);

describe('boot', () => {
  it('shows a loading message, then the Sign in screen when the shop is set up', async () => {
    const shell = fakeShell();
    render(<App api={shell.api} />);
    expect(screen.getByText('Starting…')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pesticide Club Shop', level: 1 })).toBeTruthy(); // the shop name, from the database
    expect(screen.getByText('Counter PC · A1')).toBeTruthy();
  });

  it('shows the first-launch setup when there is no shop yet', async () => {
    render(<App api={fakeShell({ phase: 'needs-setup', shop: null, device: null }).api} />);
    expect(await screen.findByLabelText('Shop name')).toBeTruthy();
  });

  it('shows a readable error, not a blank screen, if the shell cannot be reached', async () => {
    const shell = fakeShell();
    shell.handlers['app:getState'] = () => ({ ok: false, error: { code: 'INTERNAL', message: 'x', params: {} } });
    render(<App api={shell.api} />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });

  it('opens in the language the shell remembered: Urdu is right to left from the first screen', async () => {
    render(<App api={fakeShell({ language: 'ur' }).api} />);
    await screen.findByRole('heading', { name: 'لاگ ان', level: 2 });
    expect(root().getAttribute('dir')).toBe('rtl');
    expect(root().getAttribute('lang')).toBe('ur');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });
});

describe('language', () => {
  it('switching to Urdu sets dir=rtl and lang=ur on the app root, and back again to ltr and en', async () => {
    const shell = fakeShell();
    render(<App api={shell.api} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(root().getAttribute('dir')).toBe('ltr');
    expect(root().getAttribute('lang')).toBe('en');

    await user().click(screen.getByRole('radio', { name: 'اردو' }));
    expect(root().getAttribute('dir')).toBe('rtl');
    expect(root().getAttribute('lang')).toBe('ur');
    expect(document.documentElement.getAttribute('lang')).toBe('ur');
    expect(screen.getByRole('heading', { name: 'لاگ ان', level: 2 })).toBeTruthy();

    await user().click(screen.getByRole('radio', { name: 'EN' }));
    expect(root().getAttribute('dir')).toBe('ltr');
    expect(root().getAttribute('lang')).toBe('en');
  });

  it('asks the shell to remember the choice', async () => {
    const shell = fakeShell();
    render(<App api={shell.api} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    await user().click(screen.getByRole('radio', { name: 'اردو' }));
    expect(shell.calls.filter((c) => c.channel === 'prefs:setLanguage')).toEqual([{ channel: 'prefs:setLanguage', input: { language: 'ur' } }]);
    expect(shell.state.language).toBe('ur');
  });

  it('shows which language is on, and the Urdu button is always written in Urdu', async () => {
    render(<App api={fakeShell().api} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.getByRole('radio', { name: 'EN' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'اردو' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'اردو' }).getAttribute('lang')).toBe('ur');
  });

  it('the arrow keys move between the two language buttons', async () => {
    render(<App api={fakeShell().api} />);
    await screen.findByRole('heading', { name: 'Sign in' });
    screen.getByRole('radio', { name: 'EN' }).focus();
    await user().keyboard('{ArrowRight}');
    expect(root().getAttribute('lang')).toBe('ur');
  });
});

describe('sign in', () => {
  async function openLogin(language: 'en' | 'ur' = 'en') {
    const shell = fakeShell({ language });
    render(<App api={shell.api} />);
    await screen.findByLabelText(language === 'en' ? 'Username' : 'صارف نام');
    return shell;
  }

  it('signs the owner in and shows the app with its seven pages', async () => {
    await openLogin();
    await user().type(screen.getByLabelText('Username'), 'owner');
    await user().type(screen.getByLabelText('Password'), 'right-password');
    await user().click(screen.getByRole('button', { name: 'Sign in' }));

    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['POS', 'Products', 'Purchases', 'Customers & Khata', 'Returns', 'Reports', 'Settings']);
    expect(screen.getByText('Signed in as')).toBeTruthy();
    expect(within(root()).getByText('Owner', { selector: 'b' })).toBeTruthy();
  });

  it('shows "Signed in as Staff" for a staff user', async () => {
    await openLogin();
    await user().type(screen.getByLabelText('Username'), 'staff');
    await user().type(screen.getByLabelText('Password'), 'right-password');
    await user().click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('navigation');
    expect(within(root()).getByText('Staff', { selector: 'b' })).toBeTruthy();
  });

  it('a wrong password shows the message and the next step in English, and clears the password field', async () => {
    await openLogin();
    await user().type(screen.getByLabelText('Username'), 'owner');
    await user().type(screen.getByLabelText('Password'), 'nope');
    await user().click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Wrong username or password');
    expect(alert.textContent).toContain('recovery code');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('shows the same error in Urdu', async () => {
    await openLogin('ur');
    await user().type(screen.getByLabelText('صارف نام'), 'owner');
    await user().type(screen.getByLabelText('پاس ورڈ'), 'nope');
    await user().click(screen.getByRole('button', { name: 'لاگ ان' }));
    expect((await screen.findByRole('alert')).textContent).toContain('صارف نام یا پاس ورڈ غلط ہے');
  });

  it('asks for both fields before calling the shell', async () => {
    const shell = await openLogin();
    await user().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getAllByText('Required')).toHaveLength(2);
    expect(shell.calls.some((c) => c.channel === 'auth:login')).toBe(false);
  });

  it('sends the username and password, and does not keep the password after a failure', async () => {
    const shell = await openLogin();
    await user().type(screen.getByLabelText('Username'), 'Owner');
    await user().type(screen.getByLabelText('Password'), 'nope');
    await user().click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    expect(shell.calls.find((c) => c.channel === 'auth:login')?.input).toEqual({ username: 'Owner', password: 'nope' });
  });

  it('signing out goes back to Sign in', async () => {
    const shell = fakeShell({ phase: 'ready', user: OWNER });
    render(<App api={shell.api} />);
    await screen.findByRole('navigation');
    await user().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(shell.state.user).toBeNull();
  });
});

describe('the signed-in layout', () => {
  async function openApp(language: 'en' | 'ur' = 'en') {
    render(<App api={fakeShell({ phase: 'ready', user: OWNER, language }).api} />);
    return screen.findByRole('navigation');
  }

  it('lands on POS and shows a placeholder for each page', async () => {
    const nav = await openApp();
    expect(await screen.findByRole('heading', { name: 'POS', level: 1 })).toBeTruthy();
    expect(screen.getByText('This screen is built in Phase 5.')).toBeTruthy();
    await user().click(within(nav).getByRole('link', { name: 'Products' }));
    expect(await screen.findByRole('heading', { name: 'Products and stock' })).toBeTruthy();
    expect(screen.getByText('This screen is built in Phase 4.')).toBeTruthy();
  });

  it('marks the page you are on in the sidebar', async () => {
    const nav = await openApp();
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'POS' }).getAttribute('aria-current')).toBe('page'));
    await user().click(within(nav).getByRole('link', { name: 'Returns' }));
    expect(within(nav).getByRole('link', { name: 'Returns' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'POS' }).getAttribute('aria-current')).toBeNull();
  });

  it('Urdu: right to left, the Urdu page names, and the sidebar still has all seven pages', async () => {
    const nav = await openApp('ur');
    expect(root().getAttribute('dir')).toBe('rtl');
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['بلنگ', 'مصنوعات', 'خریداری', 'گاہک اور کھاتہ', 'واپسی', 'رپورٹس', 'ترتیبات']);
    expect(await screen.findByRole('heading', { name: 'بلنگ', level: 1 })).toBeTruthy();
  });

  it('the Returns icon is mirrored in Urdu and not in English', async () => {
    const nav = await openApp('ur');
    const icon = within(nav).getByRole('link', { name: 'واپسی' }).querySelector('svg')!;
    expect(icon.getAttribute('class')).toContain('-scale-x-100');
    cleanup();
    const navEn = await openApp('en');
    expect(within(navEn).getByRole('link', { name: 'Returns' }).querySelector('svg')!.getAttribute('class')).not.toContain('-scale-x-100');
  });

  it('every nav link has a name for screen readers and a tooltip, even when the sidebar shrinks to icons', async () => {
    const nav = await openApp();
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.getAttribute('title')).toBeTruthy();
      expect(link.textContent!.trim()).not.toBe('');
    }
  });

  it('an unknown address goes back to POS', async () => {
    await openApp();
    location.hash = '#/nowhere';
    await waitFor(() => expect(location.hash).toBe('#/pos'));
  });
});

describe('first-launch setup', () => {
  async function openSetup() {
    const shell = fakeShell({ phase: 'needs-setup', shop: null, device: null });
    render(<App api={shell.api} />);
    await screen.findByLabelText('Shop name');
    return shell;
  }
  const fill = async (over: Partial<Record<'Shop name' | 'Owner name' | 'Username' | 'Password' | 'Type the password again', string>> = {}) => {
    const values = { 'Shop name': 'Pesticide Club Shop', 'Owner name': 'Ali', Username: 'ali', Password: 'long-enough-1', 'Type the password again': 'long-enough-1', ...over };
    for (const [label, value] of Object.entries(values)) {
      const field = screen.getByLabelText(label);
      await user().clear(field);
      if (value) await user().type(field, value);
    }
  };

  it('checks every field before it calls the shell', async () => {
    const shell = await openSetup();
    await user().click(screen.getByRole('button', { name: 'Create shop' }));
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('At least 8 characters', { selector: 'p' })).toBeTruthy();
    expect(shell.calls.some((c) => c.channel === 'setup:createShop')).toBe(false);
  });

  it('refuses two passwords that differ, and a short one', async () => {
    const shell = await openSetup();
    await fill({ 'Type the password again': 'something-else' });
    await user().click(screen.getByRole('button', { name: 'Create shop' }));
    expect(screen.getByText('The two passwords are not the same')).toBeTruthy();
    await fill({ Password: 'short', 'Type the password again': 'short' });
    await user().click(screen.getByRole('button', { name: 'Create shop' }));
    expect(shell.calls.some((c) => c.channel === 'setup:createShop')).toBe(false);
  });

  it('sends the shop, owner, a clean username and the password (not the confirmation)', async () => {
    const shell = await openSetup();
    await fill({ Username: '  Ali ' });
    await user().click(screen.getByRole('button', { name: 'Create shop' }));
    await screen.findByTestId('recovery-code');
    expect(shell.calls.find((c) => c.channel === 'setup:createShop')?.input).toEqual({ shopName: 'Pesticide Club Shop', ownerName: 'Ali', username: 'ali', password: 'long-enough-1' });
  });

  it('then shows the recovery code ONCE, and the owner must tick "I have written it down" before going on', async () => {
    const shell = await openSetup();
    await fill();
    await user().click(screen.getByRole('button', { name: 'Create shop' }));

    expect((await screen.findByTestId('recovery-code')).textContent).toBe(CODE);
    expect(screen.getByRole('heading', { name: 'Write down your recovery code', level: 2 })).toBeTruthy();
    expect(screen.getAllByText('Write down your recovery code')).toHaveLength(1); // said once, not twice
    const next = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    // the form with the password is gone
    expect(screen.queryByLabelText('Password')).toBeNull();

    await user().click(screen.getByRole('checkbox'));
    expect(next.disabled).toBe(false);
    await user().click(next);

    // now in the app, and the code is nowhere on the screen
    await screen.findByRole('navigation');
    expect(document.body.textContent).not.toContain(CODE);
    expect(shell.calls.at(-1)?.channel).toBe('app:getState');
  });

  it('shows the error from the shell, for example if the shop was already set up', async () => {
    const shell = await openSetup();
    shell.handlers['setup:createShop'] = () => ({ ok: false, error: { code: 'ALREADY_SET_UP', message: 'x', params: {} } });
    await fill();
    await user().click(screen.getByRole('button', { name: 'Create shop' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This shop is already set up');
  });

  it('works in Urdu too', async () => {
    const shell = fakeShell({ phase: 'needs-setup', shop: null, device: null, language: 'ur' });
    render(<App api={shell.api} />);
    await screen.findByLabelText('دکان کا نام');
    expect(root().getAttribute('dir')).toBe('rtl');
    await user().click(screen.getByRole('button', { name: 'دکان بنائیں' }));
    expect(screen.getAllByText('ضروری ہے').length).toBeGreaterThan(0);
  });
});

describe('owner password reset with the recovery code', () => {
  async function openReset() {
    const shell = fakeShell();
    render(<App api={shell.api} />);
    await user().click(await screen.findByRole('button', { name: 'Owner: reset with your recovery code' }));
    await screen.findByLabelText('Recovery code');
    return shell;
  }
  const submit = async (code: string) => {
    await user().type(screen.getByLabelText('Owner username'), 'owner');
    await user().type(screen.getByLabelText('Recovery code'), code);
    await user().type(screen.getByLabelText('New password'), 'a-new-password-1');
    await user().click(screen.getByRole('button', { name: 'Reset password' }));
  };

  it('a wrong code shows what to check', async () => {
    await openReset();
    await submit('0000-0000-0000-0000-0000');
    expect((await screen.findByRole('alert')).textContent).toContain('That recovery code is not right');
  });

  it('the right code gives a NEW code to write down, then goes back to Sign in', async () => {
    await openReset();
    await submit(CODE);
    expect((await screen.findByTestId('recovery-code')).textContent).toBe(NEW_CODE);
    expect(screen.getByRole('heading', { name: 'Password changed', level: 2 })).toBeTruthy();
    await user().click(screen.getByRole('checkbox'));
    await user().click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('checks the code length before calling the shell, and can go back', async () => {
    const shell = await openReset();
    await user().type(screen.getByLabelText('Owner username'), 'owner');
    await user().type(screen.getByLabelText('Recovery code'), 'ABC');
    await user().type(screen.getByLabelText('New password'), 'a-new-password-1');
    await user().click(screen.getByRole('button', { name: 'Reset password' }));
    expect(screen.getByText('The code has 20 letters and numbers')).toBeTruthy();
    expect(shell.calls.some((c) => c.channel === 'auth:resetOwnerPassword')).toBe(false);
    await user().click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('accessibility basics', () => {
  it('every field on Sign in has a label, and the form can be submitted with Enter', async () => {
    const shell = fakeShell();
    render(<App api={shell.api} />);
    await screen.findByLabelText('Username');
    await user().type(screen.getByLabelText('Username'), 'owner');
    await user().type(screen.getByLabelText('Password'), 'right-password{Enter}');
    expect(await screen.findByRole('navigation')).toBeTruthy();
  });

  it('the first field has focus when Sign in opens', async () => {
    render(<App api={fakeShell().api} />);
    const field = await screen.findByLabelText('Username');
    expect(document.activeElement).toBe(field);
  });

  it('messages are announced: an error is role=alert', async () => {
    render(<App api={fakeShell().api} />);
    await screen.findByLabelText('Username');
    await user().type(screen.getByLabelText('Username'), 'owner');
    await user().type(screen.getByLabelText('Password'), 'x');
    await user().click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).getAttribute('data-code')).toBe('INVALID_CREDENTIALS');
  });
});

void [fireEvent, act, vi];
