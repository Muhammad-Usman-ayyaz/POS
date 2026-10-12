import { useRef } from 'react';
import { formatDate, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';

/**
 * A date that reads the same in English and Urdu: "30 Nov 2026" (Latin digits, English month), like every date on the receipts and in the
 * designs. A bare `<input type="date">` shows the browser's own order ("11/30/2026", "mm/dd/yyyy" in an empty one), which changes with the
 * PC's region and is not what the shop approved.
 *
 * The real date input is laid over the text, see-through, so it keeps the native calendar, keyboard entry, `min` and `max`, and its value is
 * still `YYYY-MM-DD`. A press (or Enter / Space) opens the calendar. `className` styles the visible box.
 */
export function DateField({
  value,
  onChange,
  name,
  id,
  min,
  max,
  label,
  placeholder = '',
  className,
}: {
  /** `YYYY-MM-DD`, or '' for no date. */
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  min?: string | undefined;
  max?: string | undefined;
  /** The accessible name, when no `<label>` wraps the field. */
  label?: string;
  /** Shown while there is no date. */
  placeholder?: string;
  className?: string;
}) {
  const { language } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const open = () => {
    try {
      input.current?.showPicker?.();
    } catch {
      /* the calendar can only open from a press; typing in the field still works */
    }
  };
  return (
    <span data-date-field className={cn('field relative inline-flex items-center border bg-card px-2.5 focus-within:border-accent', className)}>
      <span aria-hidden className={cn('num truncate', value === '' && 'text-muted')}>
        {value === '' ? placeholder : formatDate(value, language)}
      </span>
      <input
        ref={input}
        type="date"
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </span>
  );
}
