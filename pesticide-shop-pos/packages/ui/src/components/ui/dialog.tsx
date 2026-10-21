import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal message over the page. Focus moves into it and comes back to where it was; Tab stays inside; Escape closes it.
 * `title` names it for screen readers. The content is up to the caller.
 */
export function Dialog({
  open,
  title,
  onClose,
  icon,
  children,
  className,
  eyebrow,
  lead,
  counter = false,
  locked = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A small grey chip above the title ("Edit line", "F6"). Counter dialogs only. */
  eyebrow?: string | undefined;
  /** The one-line explanation under the title. Counter dialogs only. */
  lead?: ReactNode;
  /**
   * The counter dialog of docs/design/PosDialogs.dc.html: 16px corners, a soft 40px shadow, 24px padding, 14px between the parts, a 20px
   * title and a 14px grey lead. The ordinary dialog (the default) is left as it was.
   */
  counter?: boolean;
  /**
   * True while something is being saved: Escape, a click on the backdrop and the close button are ignored, so the dialog cannot vanish before the
   * answer is shown (a customer created but not put on the bill, a payment saved but the receipt number never seen). Default false.
   */
  locked?: boolean;
}) {
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

  const close = () => {
    if (!locked) onClose();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
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

  if (counter) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-6" onKeyDown={onKeyDown} onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-busy={locked || undefined}
          aria-labelledby={titleId}
          data-counter-dialog
          className={cn('pop-once flex max-h-full w-full max-w-[420px] flex-col gap-3.5 overflow-y-auto rounded-2xl bg-card p-6 shadow-[0_14px_40px_rgba(23,38,30,0.18)]', className)}
        >
          <div>
            {eyebrow && <span className="mb-1.5 inline-flex items-center rounded-[8px] bg-thead px-2 text-xs font-semibold leading-[1.4] text-ink-mid">{eyebrow}</span>}
            <h2 id={titleId} className="m-0 text-xl font-bold leading-[1.3]">
              {title}
            </h2>
            {lead && <div className="mt-0.5 text-sm text-muted">{lead}</div>}
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-6" onKeyDown={onKeyDown} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} role="dialog" aria-modal="true" aria-busy={locked || undefined} aria-labelledby={titleId} className={cn('pop-once w-full max-w-[560px] rounded-xl bg-card p-6 shadow-card', className)}>
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
