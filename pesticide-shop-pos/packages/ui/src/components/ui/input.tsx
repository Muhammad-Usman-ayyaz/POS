import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** A text field: 56px tall, 14px radius, a soft green glow on focus (from the base styles). */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-14 w-full rounded-lg border bg-card px-4 text-lg text-ink placeholder:text-muted/70 [@media(max-height:800px)]:h-12',
        invalid ? 'border-danger-ink' : 'border-field-line',
        className,
      )}
      {...props}
    />
  );
});
