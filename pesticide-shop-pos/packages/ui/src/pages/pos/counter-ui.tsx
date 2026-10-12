// Small pieces shared by the POS screen and its dialogs, taken from the `.chip`, `.lbl` and `.in` classes of docs/design/Main.dc.html and
// PosDialogs.dc.html, so the sizes are written once.
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** `.chip`: 12px, 600, 8px corners. Neutral grey, `ok` green (a discount, "Auto"), `warn` amber (near expiry), `bad` red. */
const chipVariants = cva('inline-flex items-center gap-1 rounded-[8px] px-2 text-xs font-semibold leading-[1.4]', {
  variants: {
    tone: {
      neutral: 'bg-thead text-ink-mid',
      ok: 'bg-tint text-accent-dark',
      warn: 'bg-warn-bg text-warn-ink',
      bad: 'bg-danger-bg text-danger-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Chip({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof chipVariants>) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}

/** `.lbl`: the small capital label above a field in a dialog. (Urdu letters are never spaced: see the base styles.) */
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-bold uppercase tracking-[0.05em] text-label', className)} {...props} />;
}

/** `.in`: 48px in a dialog, 10px corners, 15px text. */
export const DialogInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function DialogInput({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('h-12 w-full rounded-sm border bg-card px-3 text-[15px] text-ink', invalid ? 'border-danger-ink' : 'border-field-line', className)}
      {...props}
    />
  );
});

/** The row of buttons at the foot of a dialog: 10px apart, at the end. */
export function Actions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-1 flex flex-wrap items-center justify-end gap-2.5', className)} {...props} />;
}

/** The trash can of the design (an 18px line icon in the danger colour). */
export function TrashIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}
