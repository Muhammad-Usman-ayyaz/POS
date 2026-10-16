import { CalendarDays } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatDate, ltr, useI18n } from '../../i18n/index.js';
import { MAX_YEAR, MIN_YEAR, parseDateText } from '../../i18n/parse-date.js';
import { cn } from '../../lib/cn.js';

/** The example in every hint. Always written the same way, in both languages. */
const EXAMPLE = '12 Oct 2026';

/**
 * The ONE date field of the app. A date is written, and shown, as "12 Oct 2026" (Latin digits, English month, in English AND Urdu, like the
 * receipts and the designs), never as the browser's "mm/dd/yyyy": a Pakistani reads 05/10/2026 as 5 October, the browser as 10 May.
 *
 * It is a text box the person can type in, plus a calendar button. What is typed is read strictly (`i18n/parse-date.ts`): "12 Oct 2026",
 * "12-Oct-2026" and "2026-10-12" are accepted; "05/10/2026" and other numeric day/month forms are refused with "Write the date like
 * 12 Oct 2026", impossible dates (31 Feb) are refused, and nothing is guessed or rolled over. A hidden native date input is the
 * calendar (opened by the button or the down arrow); it keeps `min` and `max` for the calendar and always holds `YYYY-MM-DD`. `name` goes on the text box (what a screen or a test looks up).
 *
 * `value` and `onChange` are `YYYY-MM-DD`, or '' for no date. While the text is not a date, `onChange('')` is sent, so a form can never
 * go ahead with an old date the person has since overwritten. The text box is always left to right (an isolate in Urdu pages).
 */
export interface DateFieldProps {
  /** `YYYY-MM-DD`, or '' for no date. */
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  /** The first and last day the CALENDAR offers. A typed date is checked by the screen that owns the rule, not here. */
  min?: string | undefined;
  max?: string | undefined;
  /** The accessible name, when no `<label>` points at `id`. */
  label?: string;
  /** Shown while the box is empty. Defaults to "12 Oct 2026". */
  placeholder?: string;
  /** Styles the visible box (height, width, border, text size). */
  className?: string;
  /** Styles the outer element (the box and its message), e.g. `w-full`. */
  wrapperClassName?: string;
  /** Draws the box red. The screen sets it for its own problems; a text that is not a date sets it by itself. */
  invalid?: boolean;
  /** The id of the screen's own message, kept next to this field's own. */
  'aria-describedby'?: string;
  disabled?: boolean;
  required?: boolean;
  /** Called when the box is left, after a good text was tidied to "12 Oct 2026". */
  onBlur?: () => void;
  /** Tells the screen whether the text in the box is not a date, so it can leave its own "Enter the date" to this field's message. */
  onTextInvalid?: (invalid: boolean) => void;
}

const show = (iso: string): string => (iso === '' ? '' : formatDate(iso, 'en'));

export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, name, id, min, max, label, placeholder, className, wrapperClassName, invalid, 'aria-describedby': describedBy, disabled, required, onBlur, onTextInvalid },
  ref,
) {
  const { m, language } = useI18n();
  const t = m.dateField;
  const reactId = useId();
  const errorId = `${id ?? reactId}-format`;
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => show(value));
  const [checked, setChecked] = useState(false); // the person has left the box (or pressed Enter): now a bad text is told off

  const parsed = parseDateText(text);
  const blank = text.trim() === '';
  const textInvalid = !blank && !parsed.ok;
  const typedIso = parsed.ok ? parsed.iso : '';

  // A new value from outside (a button that fills the field, a reset) replaces the text; the text's own echo does not.
  useEffect(() => {
    if (value !== typedIso) {
      setText(show(value));
      setChecked(false);
    }
    // only when the value changes from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    onTextInvalid?.(textInvalid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInvalid]);

  const type = (next: string) => {
    setText(next);
    const result = parseDateText(next);
    const iso = result.ok ? result.iso : '';
    if (result.ok || next.trim() === '') setChecked(false);
    if (iso !== value) onChange(iso);
  };

  const openCalendar = () => {
    try {
      picker.current?.showPicker?.();
    } catch {
      /* the calendar can only open from a press; typing in the field still works */
    }
  };

  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const problem = textInvalid && checked && !parsed.ok ? parsed.reason : null;
  const message =
    problem === 'year' ? t.year(MIN_YEAR, MAX_YEAR) : problem === 'impossible' ? t.impossible(language === 'ur' ? ltr(EXAMPLE) : EXAMPLE) : problem === 'format' ? t.format(language === 'ur' ? ltr(EXAMPLE) : EXAMPLE) : null;
  const bad = invalid || message !== null;

  return (
    <span data-date-field className={cn('inline-flex flex-col gap-1', wrapperClassName)}>
      <span className={cn('field relative inline-flex items-center border bg-card px-2.5 focus-within:border-accent', bad && 'border-danger-ink', disabled && 'opacity-60', className)}>
        <input
          ref={setRef}
          type="text"
          id={id}
          name={name}
          dir="ltr"
          lang="en"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          required={required}
          aria-label={label}
          aria-invalid={bad || undefined}
          aria-describedby={[describedBy, message ? errorId : undefined].filter(Boolean).join(' ') || undefined}
          placeholder={placeholder ?? EXAMPLE}
          onChange={(e) => type(e.target.value)}
          onBlur={() => {
            if (textInvalid) setChecked(true);
            else if (parsed.ok) setText(show(parsed.iso));
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && textInvalid) setChecked(true);
            if (e.key === 'ArrowDown' && !disabled) {
              e.preventDefault();
              openCalendar();
            }
          }}
          className="num h-full min-h-11 min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-start outline-none placeholder:text-muted/70"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={t.openCalendar}
          onClick={openCalendar}
          className="-me-1.5 ms-1 inline-grid h-full min-h-11 w-9 shrink-0 place-items-center rounded-md text-muted hover:text-accent"
        >
          <CalendarDays aria-hidden className="size-4" />
        </button>
        <input
          ref={picker}
          type="date"
          min={min}
          max={max}
          value={typedIso}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            // the calendar chose a day (or cleared it)
            setText(show(e.target.value));
            setChecked(false);
            if (e.target.value !== value) onChange(e.target.value);
          }}
          className="pointer-events-none absolute inset-y-0 end-0 min-h-11 w-9 opacity-0"
        />
      </span>
      {message && (
        <p id={errorId} role="alert" className="w-0 min-w-full text-sm font-medium text-danger-ink">
          {message}
        </p>
      )}
    </span>
  );
});
