import { cn } from '../../lib/cn.js';

export interface SegOption<V extends string> {
  value: V;
  label: string;
  /** Language of the label, so the Urdu word gets the Urdu font on an English page. */
  lang?: string;
}

/**
 * The two-button choice of the Settings design (`.seg` in docs/design/Settings.dc.html): 48px tall, 10px corners, the chosen one tinted green
 * with a 2px green border. A radio group: arrow keys move the choice (they follow what you see, so they flip in Urdu).
 */
export function Seg<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: readonly SegOption<V>[]; onChange: (value: V) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2.5">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            lang={option.lang}
            className={cn(
              'lift min-h-12 flex-1 rounded-sm text-[15px] font-semibold',
              selected ? 'border-2 border-accent bg-tint text-accent-dark' : 'border border-field-line bg-card text-ink hover:bg-row-hover',
              option.lang === 'ur' && 'text-[17px]',
            )}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
              const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
              const back = rtl ? 'ArrowRight' : 'ArrowLeft';
              const step = event.key === forward || event.key === 'ArrowDown' ? 1 : event.key === back || event.key === 'ArrowUp' ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const at = (index + step + options.length) % options.length;
              const next = options[at];
              if (next) {
                onChange(next.value);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[at]?.focus();
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
