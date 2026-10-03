import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeError, useI18n } from '../i18n/index.js';
import { cn } from '../lib/cn.js';

export type Tone = 'danger' | 'warning' | 'success';

const toneClass: Record<Tone, string> = {
  danger: 'bg-danger-bg text-danger-ink',
  warning: 'bg-warn-bg text-warn-ink',
  success: 'bg-tint text-accent',
};

function ToneIcon({ tone }: { tone: Tone }) {
  const Icon = tone === 'success' ? CircleCheck : TriangleAlert;
  return <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />;
}

/** A message in a coloured box: what happened, and what to do next. */
export function Notice({ tone = 'danger', title, next, className, code }: { tone?: Tone; title: string; next?: string | undefined; className?: string; code?: string }) {
  return (
    <div role={tone === 'success' ? 'status' : 'alert'} data-code={code} className={cn('flex gap-3 rounded-md px-4 py-3', toneClass[tone], className)}>
      <ToneIcon tone={tone} />
      <div>
        <p className="font-semibold">{title}</p>
        {next ? <p className="mt-1 text-sm">{next}</p> : null}
      </div>
    </div>
  );
}

/**
 * Shows any thrown error in the current language, with the next step. An ApiError is looked up by its code
 * (and its numbers); anything else shows the "something went wrong" message. Use it inline, next to a form.
 */
export function ErrorNotice({ error, tone = 'danger', className }: { error: unknown; tone?: Tone; className?: string }) {
  const { language } = useI18n();
  const text = describeError(error, language);
  return <Notice tone={tone} title={text.title} next={text.next} className={className} code={text.code} />;
}

// ---- toasts: the same message, but floating at the corner of the screen and gone after a few seconds ----

interface ToastInput {
  tone?: Tone;
  title: string;
  next?: string;
  /** Milliseconds before it goes away. Default 6000. */
  duration?: number;
}
interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  show(toast: ToastInput): void;
  /** Shows an error (usually an ApiError) as a toast, in the current language. */
  showError(error: unknown): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { language, m } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((toast: ToastInput) => setToasts((all) => [...all, { ...toast, id: nextId.current++ }]), []);
  const showError = useCallback(
    (error: unknown) => {
      const text = describeError(error, language);
      show({ tone: 'danger', title: text.title, next: text.next });
    },
    [language, show],
  );

  const api = useMemo(() => ({ show, showError }), [show, showError]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 end-6 z-50 flex w-[min(420px,calc(100vw-48px))] flex-col gap-3">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} closeLabel={m.toast.close} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, closeLabel, onClose }: { toast: ToastItem; closeLabel: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, toast.duration ?? 6000);
    return () => clearTimeout(timer);
  }, [toast.duration, onClose]);

  const tone = toast.tone ?? 'danger';
  return (
    <div className="pointer-events-auto animate-toast-in rounded-md shadow-toast">
      <div role={tone === 'success' ? 'status' : 'alert'} className={cn('flex items-start gap-3 rounded-md px-4 py-3', toneClass[tone])}>
        <ToneIcon tone={tone} />
        <div className="flex-1">
          <p className="font-semibold">{toast.title}</p>
          {toast.next ? <p className="mt-1 text-sm">{toast.next}</p> : null}
        </div>
        <button type="button" aria-label={closeLabel} onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-sm hover:bg-black/10">
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
