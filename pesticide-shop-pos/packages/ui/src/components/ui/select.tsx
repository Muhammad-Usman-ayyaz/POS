import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** A drop-down, the same height and look as <Input> (56px, 48px in a short window). The arrow sits at the end, so it flips in Urdu. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-14 w-full rounded-lg border bg-card px-4 text-lg text-ink [@media(max-height:800px)]:h-12',
        invalid ? 'border-danger-ink' : 'border-field-line',
        className,
      )}
      {...props}
    />
  );
});
