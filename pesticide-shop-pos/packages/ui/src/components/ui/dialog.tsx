import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal message over the page. Focus moves into it and comes back to where it was; Tab stays inside; Escape closes it.
 * `title` names it for screen readers. The content is up to the caller.
 */
export function Dialog({ open, title, onClose, icon, children, className }: { open: boolean; title: string; onClose: () => void; icon?: ReactNode; children: ReactNode; className?: string }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    before.current = document.activeElement;
    // The last button is the main action: start there? No, start on the first control, so a stray Enter does the safe thing.
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (before.current instanceof HTMLElement) before.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-6" onKeyDown={onKeyDown} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('pop-once w-full max-w-[560px] rounded-xl bg-card p-6 shadow-card', className)}>
        <div className="flex items-start gap-4">
          {icon}
          <h2 id={titleId} className="min-w-0 text-2xl font-bold leading-snug">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
}
