// @vitest-environment jsdom
import { ApiError } from '@pos/api-contract';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge, Button, DateField, Dialog, ErrorNotice, I18nProvider, Input, Notice, Num, SegmentedToggle, ToastProvider, useToast } from '../src/index.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const inEnglish = (ui: React.ReactNode, language: 'en' | 'ur' = 'en') =>
  render(
    <I18nProvider language={language} onLanguageChange={() => undefined}>
      {ui}
    </I18nProvider>,
  );

describe('Num', () => {
  it('is a .num span: left to right, isolated, equal-width digits (the CSS rule is checked in styles.test.ts)', () => {
    inEnglish(<Num data-testid="n">Rs 1,250</Num>, 'ur');
    expect(screen.getByTestId('n').className).toContain('num');
    expect(screen.getByTestId('n').tagName).toBe('SPAN');
  });
});

describe('Button', () => {
  it('has the three heights: 48, 56 and 68, and never below the 44px touch minimum', () => {
    inEnglish(
      <>
        <Button>md</Button>
        <Button size="lg">lg</Button>
        <Button size="xl">xl</Button>
      </>,
    );
    expect(screen.getByText('md').className).toContain('h-12');
    expect(screen.getByText('lg').className).toContain('h-14');
    expect(screen.getByText('xl').className).toContain('h-[68px]');
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-11');
  });

  it('lifts on hover and presses down (the .lift class), is a real button that does not submit forms by default', () => {
    inEnglish(<Button>go</Button>);
    const b = screen.getByRole('button');
    expect(b.className).toContain('lift');
    expect(b.getAttribute('type')).toBe('button');
  });

  it('calls onClick, and not when disabled', async () => {
    const onClick = vi.fn();
    inEnglish(
      <>
        <Button onClick={onClick}>on</Button>
        <Button onClick={onClick} disabled>
          off
        </Button>
      </>,
    );
    await userEvent.setup().click(screen.getByText('on'));
    await userEvent.setup().click(screen.getByText('off'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Input and Badge', () => {
  it('an input is 56px tall with 14px corners, and is marked invalid for screen readers', () => {
    inEnglish(<Input aria-label="x" invalid />);
    const input = screen.getByLabelText('x');
    expect(input.className).toContain('h-14');
    expect(input.className).toContain('rounded-lg');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('badges have the warning and danger colours from the design, and warnings can pulse', () => {
    inEnglish(
      <>
        <Badge tone="warning" pulse>
          near
        </Badge>
        <Badge tone="danger">expired</Badge>
      </>,
    );
    expect(screen.getByText('near').className).toMatch(/bg-warn-bg.*text-warn-ink|text-warn-ink.*bg-warn-bg/);
    expect(screen.getByText('near').className).toContain('pulse-soft');
    expect(screen.getByText('expired').className).toMatch(/bg-danger-bg/);
  });
});

describe('SegmentedToggle', () => {
  it('is a radio group: one selected, click and arrow keys change it', async () => {
    const onChange = vi.fn();
    inEnglish(
      <SegmentedToggle label="Price" value="retail" onChange={onChange} options={[{ value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }]} />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Price' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Retail' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Wholesale' }));
    expect(onChange).toHaveBeenCalledWith('wholesale');
  });
});

describe('SegmentedToggle arrow keys follow the page direction', () => {
  // Three buttons, with the middle one selected, so "next" and "previous" are different answers.
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
  const press = async (language: 'en' | 'ur', key: string) => {
    const onChange = vi.fn();
    inEnglish(<SegmentedToggle label="x" value="b" onChange={onChange} options={options} />, language);
    screen.getByRole('radio', { name: 'B' }).focus();
    await userEvent.setup().keyboard(key);
    return onChange;
  };

  it('left to right: the right arrow goes to the next button, the left arrow to the previous one', async () => {
    expect(await press('en', '{ArrowRight}')).toHaveBeenCalledWith('c');
    cleanup();
    expect(await press('en', '{ArrowLeft}')).toHaveBeenCalledWith('a');
  });

  it('right to left (Urdu): the buttons are laid out right to left, so the LEFT arrow goes to the next one and the RIGHT arrow to the previous', async () => {
    expect(await press('ur', '{ArrowLeft}')).toHaveBeenCalledWith('c');
    cleanup();
    expect(await press('ur', '{ArrowRight}')).toHaveBeenCalledWith('a');
  });
});

describe('ErrorNotice', () => {
  it('shows the title and the next step for an ApiError, in English and in Urdu', () => {
    const error = new ApiError('INSUFFICIENT_STOCK', 'x', { available: 3000, requested: 5000, packSize: 1000, scope: 'batch' });
    inEnglish(<ErrorNotice error={error} />);
    expect(screen.getByRole('alert').textContent).toContain('Only 3 packs left in this batch');
    expect(screen.getByRole('alert').textContent).toContain('Lower the quantity, or choose another batch.');
    cleanup();
    inEnglish(<ErrorNotice error={error} />, 'ur');
    expect(screen.getByRole('alert').textContent).toContain('اس بیچ میں صرف');
    expect(screen.getByRole('alert').textContent).toContain('مقدار کم کریں');
  });

  it('uses the danger colours, and a warning variant uses the amber ones', () => {
    inEnglish(
      <>
        <ErrorNotice error={new ApiError('NOT_FOUND', 'x')} />
        <ErrorNotice error={new ApiError('NOT_FOUND', 'x')} tone="warning" />
      </>,
    );
    const [danger, warning] = screen.getAllByRole('alert');
    expect(danger!.className).toContain('bg-danger-bg');
    expect(warning!.className).toContain('bg-warn-bg');
  });

  it('never shows the technical message or a stack for an unexpected error', () => {
    inEnglish(<ErrorNotice error={new Error('SQLITE_CORRUPT at C:\\pos.db')} />);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('alert').textContent).not.toContain('SQLITE');
  });

  it('a plain Notice can say something good: success is announced politely', () => {
    inEnglish(<Notice tone="success" title="Saved" />);
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });
});

describe('toast', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <button onClick={() => toast.showError(new ApiError('NOT_AUTHORIZED', 'x'))}>fail</button>
        <button onClick={() => toast.show({ tone: 'success', title: 'Saved', duration: 1000 })}>ok</button>
      </>
    );
  }
  const open = (language: 'en' | 'ur' = 'en') =>
    inEnglish(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
      language,
    );

  it('shows an error as a toast with its next step, and goes away by itself', async () => {
    vi.useFakeTimers();
    open();
    act(() => screen.getByText('fail').click());
    expect(screen.getByRole('alert').textContent).toContain('Only the owner can do this');
    expect(screen.getByRole('alert').textContent).toContain('Ask the owner');
    act(() => void vi.advanceTimersByTime(5900));
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be closed with its button, which is labelled in the current language', async () => {
    open('ur');
    act(() => screen.getByText('fail').click());
    expect(screen.getByRole('alert').textContent).toContain('یہ کام صرف مالک کر سکتا ہے');
    await userEvent.setup().click(screen.getByRole('button', { name: 'بند کریں' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('several toasts stack, and a success is a polite status', () => {
    vi.useFakeTimers();
    open();
    act(() => screen.getByText('fail').click());
    act(() => screen.getByText('ok').click());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Saved');
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeNull(); // the error has longer to go
  });

  it('the toast region is announced to screen readers and sits at the end corner (the left in Urdu)', () => {
    open();
    const region = document.querySelector('[aria-live="polite"]')!;
    expect(region.className).toContain('end-6');
  });
});

describe('DateField', () => {
  const field = () => document.querySelector<HTMLElement>('[data-date-field]')!;
  const input = () => field().querySelector('input')!;

  it.each(['en', 'ur'] as const)('%s: shows the date as "30 Nov 2026" (Latin digits, English month, like the receipts), not the browser mm/dd/yyyy', (language) => {
    inEnglish(<DateField name="d" value="2026-11-30" onChange={() => undefined} />, language);
    expect(field().textContent).toBe('30 Nov 2026');
    expect(input().value).toBe('2026-11-30'); // the real value is still YYYY-MM-DD
    expect(input().type).toBe('date');
  });

  it('with no date it shows the placeholder instead, never "mm/dd/yyyy"', () => {
    inEnglish(<DateField name="d" value="" placeholder="Any date" onChange={() => undefined} />);
    expect(field().textContent).toBe('Any date');
  });

  it('a change from the calendar or the keyboard arrives as YYYY-MM-DD, and min and max are passed on', () => {
    const seen: string[] = [];
    inEnglish(<DateField name="d" value="2026-11-30" min="2026-10-12" max="2027-01-01" onChange={(v) => seen.push(v)} />);
    fireEvent.change(input(), { target: { value: '2026-12-05' } });
    expect(seen).toEqual(['2026-12-05']);
    expect(input().min).toBe('2026-10-12');
    expect(input().max).toBe('2027-01-01');
  });

  it('pressing it (or Enter / Space) opens the calendar', () => {
    inEnglish(<DateField name="d" value="2026-11-30" onChange={() => undefined} />);
    const showPicker = vi.fn();
    input().showPicker = showPicker;
    fireEvent.click(input());
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: ' ' });
    fireEvent.keyDown(input(), { key: 'a' });
    expect(showPicker).toHaveBeenCalledTimes(3);
  });

  it('a calendar that cannot be opened (no showPicker, or it throws) never breaks the field', () => {
    inEnglish(<DateField name="d" value="" onChange={() => undefined} />);
    input().showPicker = () => {
      throw new Error('needs a press');
    };
    expect(() => fireEvent.click(input())).not.toThrow();
  });
});

describe('the counter dialog (docs/design/PosDialogs.dc.html)', () => {
  it('has the grey chip, the 20px title, the 14px lead and the 16px corners; the ordinary dialog is unchanged', () => {
    inEnglish(
      <>
        <Dialog counter open title="Held bills" eyebrow="F6" lead="Bills set aside." onClose={() => undefined}>
          <p>body</p>
        </Dialog>
      </>,
    );
    const box = screen.getByRole('dialog', { name: 'Held bills' });
    expect(box.className).toContain('rounded-2xl');
    expect(box.className).toContain('p-6');
    expect(box.className).toContain('gap-3.5');
    expect(box.querySelector('h2')!.className).toContain('text-xl');
    expect(screen.getByText('F6').className).toContain('bg-thead');
    expect(screen.getByText('Bills set aside.').className).toContain('text-sm');
    cleanup();
    inEnglish(
      <Dialog open title="Old look" onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('rounded-xl');
    expect(screen.getByRole('dialog').hasAttribute('data-counter-dialog')).toBe(false);
  });
});

describe('SegmentedToggle in a track (Retail / Wholesale, % / Rs)', () => {
  it('the chosen one is a white tile, the other is plain text on the grey track', () => {
    inEnglish(
      <SegmentedToggle<'a' | 'b'>
        tone="track"
        label="Price type"
        value="a"
        onChange={() => undefined}
        options={[
          { value: 'a', label: 'Retail' },
          { value: 'b', label: 'Wholesale' },
        ]}
      />,
    );
    const [on, off] = screen.getAllByRole('radio');
    expect(on!.className).toContain('bg-card');
    expect(on!.className).toContain('rounded-[9px]');
    expect(off!.className).not.toContain('bg-card ');
    expect(off!.className).toContain('font-normal');
    expect(on!.className).toContain('min-h-11');
  });
});
