import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  /** Language of the label, so an Urdu word gets the Urdu font even inside an English page. */
  lang?: string;
}

const segment = cva('lift inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-base font-semibold', {
  variants: {
    tone: {
      /** On the page background (Sign in screen). */
      light: '',
      /** On the dark sidebar. */
      dark: '',
    },
    selected: { true: '', false: '' },
  },
  compoundVariants: [
    { tone: 'light', selected: true, className: 'bg-accent text-white' },
    { tone: 'light', selected: false, className: 'border border-line bg-card text-ink hover:bg-row-hover' },
    { tone: 'dark', selected: true, className: 'bg-nav-active text-white' },
    { tone: 'dark', selected: false, className: 'border border-white/20 text-sidebar-ink hover:bg-nav-hover' },
  ],
});

/** A row of mutually exclusive buttons (the EN / اردو switch; Retail / Wholesale later). Arrow keys move between them. */
export function SegmentedToggle<V extends string>({
  label,
  value,
  options,
  onChange,
  tone = 'light',
  className,
}: {
  label: string;
  value: V;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-2', className)}>
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
            className={segment({ tone, selected })}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              // Arrows follow what you SEE: in right-to-left text the right arrow goes to the previous button.
              const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
              const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
              const back = rtl ? 'ArrowRight' : 'ArrowLeft';
              const step = event.key === forward || event.key === 'ArrowDown' ? 1 : event.key === back || event.key === 'ArrowUp' ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const next = options[(index + step + options.length) % options.length];
              if (next) {
                onChange(next.value);
                const group = event.currentTarget.parentElement;
                group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[(index + step + options.length) % options.length]?.focus();
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
