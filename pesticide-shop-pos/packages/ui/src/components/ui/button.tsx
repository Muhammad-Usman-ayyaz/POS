import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Heights: md 48, lg 56, xl 68 (the main call-to-action). Nothing is shorter than 44 (the touch target).
 * Hover lifts the button 1px, pressing scales it to .98 (the .lift class).
 */
export const buttonVariants = cva(
  'lift inline-flex min-h-11 select-none items-center justify-center gap-2 font-semibold disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white shadow-button hover:bg-accent-dark',
        secondary: 'border border-field-line bg-card text-ink hover:bg-row-hover',
        ghost: 'text-ink hover:bg-row-hover',
        danger: 'border border-field-line bg-card text-danger-ink hover:bg-danger-bg/50',
      },
      size: {
        md: 'h-12 rounded-md px-5 text-base',
        lg: 'h-14 rounded-md px-6 text-lg',
        xl: 'h-[68px] rounded-lg px-8 text-xl [@media(max-height:800px)]:h-14',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (for example a link) with the button's look. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type })} {...props} />;
}
