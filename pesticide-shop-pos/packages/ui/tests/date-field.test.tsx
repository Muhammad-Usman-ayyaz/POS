// @vitest-environment jsdom
// Dates are never ambiguous: written "12 Oct 2026" in both languages, typed strictly, sent as YYYY-MM-DD.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField, I18nProvider } from '../src/index.js';
import { parseDateText } from '../src/i18n/parse-date.js';
import { en } from '../src/i18n/messages/en.js';
import { ur } from '../src/i18n/messages/ur.js';

afterEach(cleanup);

// ---------- the parser ----------

describe('parseDateText: strict, never guesses', () => {
  const accepted: [string, string][] = [
    ['12 Oct 2026', '2026-10-12'],
    ['12-Oct-2026', '2026-10-12'],
    ['2026-10-12', '2026-10-12'],
    ['  12   Oct   2026  ', '2026-10-12'],
    ['5 Dec 2026', '2026-12-05'],
    ['05 Dec 2026', '2026-12-05'],
    ['12 oct 2026', '2026-10-12'],
    ['12 OCT 2026', '2026-10-12'],
    ['12 October 2026', '2026-10-12'],
    ['3 Sept 2026', '2026-09-03'],
    ['1 Jan 2000', '2000-01-01'],
    ['31 Dec 2100', '2100-12-31'],
    ['29 Feb 2028', '2028-02-29'], // a leap year
    ['29 Feb 2000', '2000-02-29'], // divisible by 400: a leap year
    ['2028-02-29', '2028-02-29'],
  ];
  it.each(accepted)('accepts %j as %s', (text, iso) => {
    expect(parseDateText(text)).toEqual({ ok: true, iso });
  });

  it('every month name maps to its own month (and no other)', () => {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    names.forEach((name, i) => expect(parseDateText(`1 ${name} 2026`)).toEqual({ ok: true, iso: `2026-${String(i + 1).padStart(2, '0')}-01` }));
  });

  const refusedFormat = [
    '05/10/2026', // 5 October or 10 May: never guessed
    '5/10/26',
    '05-10-2026',
    '5.10.2026',
    '10/05/2026',
    '2026/10/12',
    '12/10/2026',
    '12 10 2026',
    '12 Oct 26', // two-digit year
    'Oct 12 2026', // month first
    'Oct 12, 2026',
    '12 Octo 2026',
    '12 Foo 2026',
    '12Oct2026',
    '12 Oct-2026', // mixed separators
    '2026-1-5',
    '20261012',
    '12 Oct',
    '',
    'tomorrow',
    '٢٠٢٦-١٠-١٢', // Eastern Arabic digits
  ];
  it.each(refusedFormat)('refuses %j as a format it will not guess', (text) => {
    expect(parseDateText(text)).toEqual({ ok: false, reason: 'format' });
  });

  it.each([
    ['31 Feb 2026', 'impossible'],
    ['30 Feb 2028', 'impossible'],
    ['29 Feb 2025', 'impossible'], // not a leap year
    ['29 Feb 2100', 'impossible'], // divisible by 100, not by 400
    ['31 Apr 2026', 'impossible'],
    ['0 Oct 2026', 'impossible'],
    ['32 Oct 2026', 'impossible'],
    ['2026-02-31', 'impossible'],
    ['2026-13-01', 'impossible'],
    ['2026-00-10', 'impossible'],
    ['1 Jan 1999', 'year'],
    ['31 Dec 2101', 'year'],
    ['2999-01-01', 'year'],
    ['0001-01-01', 'year'],
  ])('refuses %j (%s), with no rollover to another day', (text, reason) => {
    expect(parseDateText(text)).toEqual({ ok: false, reason });
  });
});

// ---------- the field ----------

function Harness({ initial = '', onValue, fieldRef, ...rest }: { initial?: string; onValue?: (v: string) => void; fieldRef?: React.Ref<HTMLInputElement> } & Partial<React.ComponentProps<typeof DateField>>) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField ref={fieldRef} id="d" name="d" label="Date" value={value} onChange={(v) => (setValue(v), onValue?.(v))} {...rest} />
      <output data-testid="value">{value}</output>
    </>
  );
}
const inLanguage = (ui: React.ReactNode, language: 'en' | 'ur' = 'en') =>
  render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      {ui}
    </I18nProvider>,
  );
const box = () => screen.getByLabelText('Date') as HTMLInputElement;
const picker = () => document.querySelector<HTMLInputElement>('[data-date-field] input[type=date]')!;
const sent = () => screen.getByTestId('value').textContent;

describe('DateField', () => {
  it.each(['en', 'ur'] as const)('%s: shows 2026-11-30 as "30 Nov 2026" (Latin digits, English month), never mm/dd/yyyy, and keeps the left-to-right box', (language) => {
    inLanguage(<Harness initial="2026-11-30" />, language);
    expect(box().value).toBe('30 Nov 2026');
    expect(box().getAttribute('dir')).toBe('ltr');
    expect(box().name).toBe('d');
    expect(picker().value).toBe('2026-11-30'); // the calendar behind it still holds YYYY-MM-DD
  });

  it('empty: the placeholder is the example date, never "mm/dd/yyyy"; a screen can give its own', () => {
    inLanguage(<Harness placeholder="Any date" />);
    expect(box().placeholder).toBe('Any date');
    cleanup();
    inLanguage(<Harness />);
    expect(box().placeholder).toBe('12 Oct 2026');
  });

  it('typing "12 Oct 2026" sends 2026-10-12; leaving the box tidies "12-oct-2026" to "12 Oct 2026"', async () => {
    const user = userEvent.setup();
    inLanguage(<Harness />);
    await user.type(box(), '12-oct-2026');
    expect(sent()).toBe('2026-10-12');
    expect(picker().value).toBe('2026-10-12'); // the calendar follows what was typed
    await user.tab();
    expect(box().value).toBe('12 Oct 2026');
  });

  it('typing the ISO form is accepted too', async () => {
    inLanguage(<Harness />);
    fireEvent.change(box(), { target: { value: '2026-10-12' } });
    expect(sent()).toBe('2026-10-12');
  });

  it.each(['05/10/2026', '5/10/26', '05-10-2026'])('"%s" is refused with "Write the date like 12 Oct 2026" and sends no date', async (text) => {
    const user = userEvent.setup();
    inLanguage(<Harness initial="2026-10-12" />);
    await user.clear(box());
    await user.type(box(), text);
    expect(sent()).toBe(''); // never the old date, never a guess
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe(en.dateField.format('12 Oct 2026'));
    expect(screen.getByRole('alert').textContent).toBe('Write the date like 12 Oct 2026');
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(box().value).toBe(text); // the person's text is left for them to fix
  });

  it('an impossible date and a silly year each get their own words, and neither rolls over', async () => {
    const user = userEvent.setup();
    inLanguage(<Harness />);
    await user.type(box(), '31 Feb 2026');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe(en.dateField.impossible('12 Oct 2026'));
    expect(sent()).toBe('');
    await user.clear(box());
    await user.type(box(), '29 Feb 2025');
    expect(sent()).toBe('');
    await user.clear(box());
    await user.type(box(), '12 Oct 2126');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('The year must be between 2000 and 2100');
    await user.clear(box());
    await user.type(box(), '29 Feb 2028');
    expect(sent()).toBe('2028-02-29');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is not shouted at while typing: the message waits for leaving the box (or Enter)', async () => {
    const user = userEvent.setup();
    inLanguage(<Harness />);
    await user.type(box(), '12 Oc');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.type(box(), 't 2026'); // fixing it clears the message
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sent()).toBe('2026-10-12');
  });

  it('clearing the box sends "" and shows no error', async () => {
    const user = userEvent.setup();
    inLanguage(<Harness initial="2026-10-12" />);
    await user.clear(box());
    await user.tab();
    expect(sent()).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Urdu: the same words in Urdu with the example kept left to right, the same format, the same value sent', async () => {
    const user = userEvent.setup();
    inLanguage(<Harness />, 'ur');
    await user.type(box(), '05/10/2026');
    await user.tab();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(ur.dateField.format('⁦12 Oct 2026⁩'));
    expect(alert.textContent).toContain('تاریخ');
    expect(alert.textContent).toContain('⁦12 Oct 2026⁩'); // LTR-isolated, so the month does not hop around the year
    expect(sent()).toBe('');
    await user.clear(box());
    await user.type(box(), '12 Oct 2026');
    expect(sent()).toBe('2026-10-12');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the calendar: a day chosen there is shown as "5 Dec 2026" and sent as YYYY-MM-DD; min and max reach the calendar', () => {
    const seen: string[] = [];
    inLanguage(<Harness initial="2026-11-30" min="2026-10-12" max="2027-01-01" onValue={(v) => seen.push(v)} />);
    expect(picker().min).toBe('2026-10-12');
    expect(picker().max).toBe('2027-01-01');
    fireEvent.change(picker(), { target: { value: '2026-12-05' } });
    expect(seen).toEqual(['2026-12-05']);
    expect(box().value).toBe('5 Dec 2026');
    expect(picker().value).toBe('2026-12-05');
  });

  it('the calendar button (and the down arrow) open the native calendar; one that cannot open never breaks the field', () => {
    inLanguage(<Harness initial="2026-11-30" />);
    const showPicker = vi.fn();
    picker().showPicker = showPicker;
    fireEvent.click(screen.getByRole('button', { name: en.dateField.openCalendar }));
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'a' });
    expect(showPicker).toHaveBeenCalledTimes(2);
    picker().showPicker = () => {
      throw new Error('needs a press');
    };
    expect(() => fireEvent.click(screen.getByRole('button', { name: en.dateField.openCalendar }))).not.toThrow();
  });

  it('a value set from outside (a button that fills the field) replaces the text; a screen can read when the text is not a date', async () => {
    const user = userEvent.setup();
    const flags: boolean[] = [];
    function Outer() {
      const [value, setValue] = useState('2026-10-12');
      return (
        <>
          <DateField id="d" label="Date" value={value} onChange={setValue} onTextInvalid={(x) => flags.push(x)} />
          <button type="button" onClick={() => setValue('2027-03-12')}>
            use
          </button>
        </>
      );
    }
    inLanguage(<Outer />);
    await user.type(box(), 'x');
    expect(flags.at(-1)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'use' }));
    expect(box().value).toBe('12 Mar 2027');
    expect(flags.at(-1)).toBe(false);
    expect(picker().value).toBe('2027-03-12');
  });

  it('passes a ref, disabled and the screen\'s own aria-describedby and invalid through', () => {
    const ref = { current: null as HTMLInputElement | null };
    inLanguage(<Harness fieldRef={ref} disabled invalid aria-describedby="why" />);
    expect(ref.current).toBe(box());
    expect(box().disabled).toBe(true);
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe('why');
  });
});

// ---------- the whole UI package ----------

describe('no ambiguous date anywhere in packages/ui/src', () => {
  const root = join(__dirname, '..', 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const all = files(root).map((path) => ({ file: relative(root, path).replace(/\\/g, '/'), code: readFileSync(path, 'utf8') }));

  it('the browser date input is used in ONE place: the calendar inside DateField', () => {
    const raw = all.filter(({ code }) => /type\s*=\s*["'{`]+\s*date\b/.test(code) || /type:\s*['"]date['"]/.test(code)).map((f) => f.file);
    expect(raw).toEqual(['components/ui/date-field.tsx']);
    const inField = all.find((f) => f.file === 'components/ui/date-field.tsx')!.code;
    expect(inField.match(/type="date"/g)).toHaveLength(1);
    expect(inField).toContain('aria-hidden'); // and it is the hidden calendar, not the box the person reads
  });

  it('nothing formats a date with the PC\'s region (toLocaleDateString, toLocaleString; a clock time alone is not a date)', () => {
    const offenders = all.filter(({ code }) => /toLocaleDateString|toLocaleString\(/.test(code)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('every <DateField> in a screen is the shared one (no second date component, no dd/mm/yyyy placeholder)', () => {
    const numeric = all.filter(({ code }) => /placeholder=["'][^"']*(dd|mm|yyyy)[^"']*["']/i.test(code)).map((f) => f.file);
    expect(numeric).toEqual([]);
    const receive = all.filter((f) => f.file.startsWith('pages/purchases/')).map((f) => f.code).join('\n');
    expect(receive.match(/<DateField/g)?.length).toBe(2); // the receipt date and the expiry of every line
  });
});
