import { ApiError, type Api, type CustomerPaymentView } from '@pos/api-contract';
import { useRef, useState, type ReactNode } from 'react';
import { ErrorNotice } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Dialog } from '../../../components/ui/dialog.js';
import { Actions, DialogInput, FieldLabel } from '../../pos/counter-ui.js';
import { formatMoney, useI18n } from '../../../i18n/index.js';
import { cn } from '../../../lib/cn.js';
import { advanceExtraPreview, balanceAfterPreview, balanceView } from '../detail/customer-detail-state.js';
import {
  amountPaisa,
  blankPayment,
  buildReceiveRequest,
  checkPayment,
  hasPaymentProblems,
  NOTE_MAX,
  PAY_METHODS,
  type PayMethod,
  type PaymentDraft,
  type PaymentProblems,
} from './customer-payment-requests.js';

export type PaymentResult = CustomerPaymentView;

/**
 * Receive payment (docs/design/CustomerForms.dc.html, section 3). Amount in rupees, a method (cash first), a reference (needed for the three
 * non-cash methods), a note, and the date shown as "Today" (no back-dating). More than the customer owes needs the advance box ticked.
 * The "Balance after" line is a PREVIEW (`balanceAfterPreview`); once saved the box shows the shell's own `balance_after` and `receipt_no`.
 * `receiptActions` (the print buttons, wired in by the app) is shown in the saved state.
 */
export function CustomerPaymentDialog({
  api,
  customerId,
  name,
  village,
  balance,
  onClose,
  onSaved,
  receiptActions,
}: {
  api: Api;
  customerId: string;
  name: string;
  village?: string | null | undefined;
  /** What the customer owes now (minus: an advance), as the shell sent it. */
  balance: number;
  onClose: () => void;
  /** Called once the payment is saved, so the page behind can reload. */
  onSaved: (result: PaymentResult) => void;
  receiptActions?: (result: PaymentResult) => ReactNode;
}) {
  const { m, language } = useI18n();
  const t = m.customerPayment;
  const [draft, setDraft] = useState<PaymentDraft>(blankPayment);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  // The shell said "confirm the advance" (ADVANCE_NOT_CONFIRMED) even though the preview did not: show the same confirm.
  const [shellAskedAdvance, setShellAskedAdvance] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const inFlight = useRef(false);

  const money = (n: number) => formatMoney(n, language);
  const amount = amountPaisa(draft);
  const problems: PaymentProblems = checked ? checkPayment(draft) : { amount: false, reference: false, note: draft.note.trim().length > NOTE_MAX };
  const owed = balanceView(balance);
  const exceeds = amount !== null && amount > balance;
  const needsConfirm = exceeds || (shellAskedAdvance && amount !== null);
  const extra = amount === null ? 0 : advanceExtraPreview(balance, amount) || amount;
  const after = amount === null ? null : balanceView(balanceAfterPreview(balance, amount));

  const edit = (patch: Partial<PaymentDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null); // a message about an earlier try never stays once something is changed
    if ('amount' in patch) setConfirmAdvance(false); // the tick was for that amount
  };

  const save = async () => {
    if (inFlight.current || result) return;
    setError(null);
    setChecked(true);
    if (hasPaymentProblems(checkPayment(draft))) return;
    if (needsConfirm && !confirmAdvance) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const reply = await api.payments.receive(buildReceiveRequest(customerId, draft, { confirmAdvance: needsConfirm && confirmAdvance }));
      setResult(reply);
      onSaved(reply);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ADVANCE_NOT_CONFIRMED') {
        setShellAskedAdvance(true);
        setConfirmAdvance(false);
      } else {
        setError(e);
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (result) {
    const now = balanceView(result.balance_after);
    return (
      <Dialog counter open title={t.savedTitle} onClose={onClose} className="max-w-[520px]">
        <div data-payment-saved className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[12px] bg-tint-soft p-4 text-[15px]">
            <dt className="text-muted">{t.receiptNo}</dt>
            <dd data-receipt-no className="num text-end font-bold">
              {result.receipt_no}
            </dd>
            <dt className="text-muted">{t.balanceNow}</dt>
            <dd data-balance-after className="text-end font-bold">
              {now.kind === 'owes' ? t.owes(money(now.amount)) : now.kind === 'advance' ? t.advanceAfter(money(now.amount)) : t.clear}
            </dd>
          </dl>
          <Actions>
            {receiptActions?.(result)}
            <Button size="dialog" onClick={onClose}>
              {t.done}
            </Button>
          </Actions>
        </div>
      </Dialog>
    );
  }

  const amountMsg = problems.amount ? t.amountInvalid : undefined;
  return (
    <Dialog counter open title={t.title} lead={t.lead} onClose={onClose} locked={saving} className="max-w-[520px]">
      <form
        noValidate
        data-payment-form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-start justify-between gap-3 rounded-[12px] bg-tint-soft px-3 py-2.5">
          <div className="min-w-0">
            <div data-customer-name className="font-bold">
              {name}
            </div>
            {village && <div className="text-sm text-muted">{village}</div>}
          </div>
          <div className="text-end">
            <div className="text-xs text-muted">{owed.kind === 'advance' ? t.advanceNow : t.owesNow}</div>
            <div data-owes-now className="num font-bold">
              {money(owed.amount)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <div>
          <FieldLabel htmlFor="pay-amount">{t.amount}</FieldLabel>
          <div dir="ltr" className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
              {t.rs}
            </span>
            <DialogInput id="pay-amount" inputMode="decimal" autoComplete="off" value={draft.amount} invalid={problems.amount} aria-describedby={amountMsg ? 'pay-amount-error' : undefined} onChange={(e) => edit({ amount: e.target.value })} className="num ps-10 text-end" />
          </div>
          {amountMsg && (
            <p id="pay-amount-error" role="alert" className="mt-1 text-sm font-medium text-danger-ink">
              {amountMsg}
            </p>
          )}
        </div>
          <div>
            <FieldLabel>{t.date}</FieldLabel>
            <div data-payment-date className="flex h-12 items-center rounded-sm border border-line bg-thead px-3 text-[15px] text-muted">
              {t.today}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel id="pay-method-label">{t.method}</FieldLabel>
          <div role="radiogroup" aria-labelledby="pay-method-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAY_METHODS.map((k: PayMethod) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={draft.method === k}
                onClick={() => edit({ method: k })}
                className={cn('lift min-h-11 rounded-sm border px-2 text-sm font-semibold', draft.method === k ? 'border-accent bg-tint text-accent-dark' : 'border-field-line bg-card text-ink hover:bg-row-hover')}
              >
                {t.methods[k]}
              </button>
            ))}
          </div>
        </div>

        <div className={cn('grid gap-3', draft.method !== 'cash' && 'grid-cols-2')}>
          {draft.method !== 'cash' && (
            <div>
              <FieldLabel htmlFor="pay-reference">{t.reference}</FieldLabel>
              <DialogInput id="pay-reference" dir="ltr" autoComplete="off" placeholder={t.referencePlaceholder} value={draft.reference} invalid={problems.reference} aria-describedby={problems.reference ? 'pay-reference-error' : undefined} onChange={(e) => edit({ reference: e.target.value })} className="num" />
              {problems.reference && (
                <p id="pay-reference-error" role="alert" className="mt-1 text-sm font-medium text-danger-ink">
                  {t.referenceRequired}
                </p>
              )}
            </div>
          )}
          <div>
            <FieldLabel htmlFor="pay-note">{t.note}</FieldLabel>
            <DialogInput id="pay-note" dir="auto" autoComplete="off" value={draft.note} invalid={problems.note} aria-describedby={problems.note ? 'pay-note-error' : undefined} onChange={(e) => edit({ note: e.target.value })} />
          </div>
        </div>
        {problems.note && (
          <p id="pay-note-error" role="alert" className="-mt-2 text-sm font-medium text-danger-ink">
            {t.noteTooLong}
          </p>
        )}

        {after && (
          <div data-balance-after-preview className="flex items-baseline justify-between gap-3 rounded-[12px] bg-thead px-3 py-2">
            <span className="font-semibold">{t.balanceAfter}</span>
            <span className="num font-bold">{after.kind === 'owes' ? t.owes(money(after.amount)) : after.kind === 'advance' ? t.advanceAfter(money(after.amount)) : t.clear}</span>
          </div>
        )}

        {needsConfirm && (
          <div data-advance-confirm className="flex flex-col gap-1 rounded-[12px] bg-warn-bg px-3 py-2 text-sm text-warn-ink">
            <p>{t.advanceExplain(money(extra), name)}</p>
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={confirmAdvance} onChange={(e) => setConfirmAdvance(e.target.checked)} />
              <span>{t.advanceConfirm(money(extra))}</span>
            </label>
          </div>
        )}

        {error != null && <ErrorNotice error={error} />}

        <Actions>
          <Button type="button" variant="secondary" size="dialog" disabled={saving} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" size="dialog" disabled={saving || (needsConfirm && !confirmAdvance)}>
            {saving ? t.saving : t.save}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
