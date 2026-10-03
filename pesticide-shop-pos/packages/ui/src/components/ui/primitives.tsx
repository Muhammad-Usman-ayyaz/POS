import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** A white card with a 1px border and 14px corners. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-card shadow-card', className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-base font-semibold text-ink', className)} {...props} />;
}

/** Status pills, as in the Products and Khata designs. `pulse` makes a warning breathe gently. */
export const badgeVariants = cva('inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold', {
  variants: {
    tone: {
      warning: 'bg-warn-bg text-warn-ink',
      danger: 'bg-danger-bg text-danger-ink',
      success: 'bg-tint text-accent',
      neutral: 'border border-line bg-card text-muted',
    },
    pulse: { true: 'pulse-soft', false: '' },
  },
  defaultVariants: { tone: 'neutral', pulse: false },
});

export function Badge({ className, tone, pulse, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, pulse }), className)} {...props} />;
}

/** A field with its label, an optional hint, and an error message in red. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A number, amount, date or document number: stays left to right and uses equal-width digits, even in Urdu. */
export function Num({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('num', className)} {...props} />;
}
