import type { Api, CustomerSummaryView } from '@pos/api-contract';
import { useRef, useState } from 'react';
import { ErrorNotice, useToast } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Dialog } from '../../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../../i18n/index.js';
import { cn } from '../../../lib/cn.js';
import { Actions, DialogInput, FieldLabel } from '../../pos/counter-ui.js';
import { balanceView } from '../detail/customer-detail-state.js';
import { adjustmentFor, buildAdjustRequest, directionOf, openingPaisa, REASON_MAX, reasonOk, signedOpening, type OpeningDirection } from './customer-opening-requests.js';

/**
 * Correct opening balance (OWNER only; the page never opens it for staff, the shell refuses staff). Shown by the Opening balance box when the customer
 * already has one. It shows the CURRENT opening amount (from the statement), asks for the NEW amount and a reason, then a confirm step, and sends
 * `khata:adjustOpening` with the delta from the pure `adjustmentFor`. The opening row is never edited: the shell adds one Adjustment row.
 */
export function OpeningCorrection({
  api,
  customerId,
  name,
  current,
  onClose,
  onSaved,
}: {
  api: Api;
  customerId: string;
  name: string;
  /** The opening balance now, in signed paisa, from the statement. */
  current: number;
  onClose: () => void;
  onSaved: (summary: CustomerSummaryView) => void;
}) {
  const { m, language } = useI18n();
  const t = m.customerOpening;
  const toast = useToast();
  const [direction, setDirection] = useState<OpeningDirection>(directionOf(current));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const money = (n: number) => formatMoney(n, language);
  const show = (n: number) => {
    const b = balanceView(n);
    return b.kind === 'advance' ? m.customerDetail.advance(money(b.amount)) : money(b.amount);
  };
  const paisa = openingPaisa(amount);
  const delta = paisa !== null ? adjustmentFor(current, signedOpening(direction, paisa)) : null;
  const amountBad = checked && (paisa === null || delta === 0);
  const reasonBad = checked && !reasonOk(reason);

  const goConfirm = () => {
    setChecked(true);
    setError(null);
    if (paisa !== null && delta !== 0 && reasonOk(reason)) setStep('confirm');
  };

  const save = async () => {
    if (inFlight.current || paisa === null || delta === 0) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await api.khata.adjustOpening(buildAdjustRequest(customerId, current, direction, amount, reason));
      const summary = await api.customers.get({ customer_id: customerId });
      const b = balanceView(summary.balance);
      const text = b.kind === 'owes' ? m.customerDetail.owes(money(b.amount)) : b.kind === 'advance' ? m.customerDetail.advance(money(b.amount)) : m.customerDetail.clear;
      toast.show({ tone: 'success', title: t.fixSaved(name, text) });
      onSaved(summary);
      onClose();
    } catch (e) {
      setError(e);
      setStep('form');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (step === 'confirm' && paisa !== null) {
    return (
      <Dialog counter open title={t.fixConfirmTitle} onClose={onClose} locked={saving} className="max-w-[460px]">
        <p data-fix-confirm className="text-[15px]">
          {t.fixConfirm(name, show(current), show(signedOpening(direction, paisa)))}
        </p>
        <p data-fix-reason className="text-sm text-muted">
          {t.reasonLabel}: {reason.trim()}
        </p>
        <p className="text-sm text-muted">{t.fixHint}</p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button variant="secondary" size="dialog" disabled={saving} onClick={() => setStep('form')}>
            {t.back}
          </Button>
          <Button size="dialog" disabled={saving} onClick={() => void save()}>
            {saving ? t.saving : t.fixConfirmButton}
          </Button>
        </Actions>
      </Dialog>
    );
  }

  const options: { value: OpeningDirection; label: string }[] = [
    { value: 'they_owe_us', label: t.theyOweUs },
    { value: 'we_owe_them', label: t.weOweThem },
  ];
  return (
    <Dialog counter eyebrow={t.ownerOnly} title={t.fixTitle} lead={t.exists} onClose={onClose} locked={saving} open className="max-w-[460px]">
      <form
        noValidate
        data-fix-form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          goConfirm();
        }}
      >
        <div className="rounded-[12px] bg-tint-soft p-3">
          <div className="text-xs text-muted">{t.customer}</div>
          <div data-customer-name className="font-bold">
            {name}
          </div>
          <div className="mt-1 text-xs text-muted">{t.currentOpening}</div>
          <div data-current-opening className="num font-bold">
            {show(current)}
          </div>
        </div>
        <div>
          <FieldLabel id="fix-direction-label">{t.direction}</FieldLabel>
          <div role="radiogroup" aria-labelledby="fix-direction-label" className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={direction === o.value}
                onClick={() => setDirection(o.value)}
                className={cn('lift min-h-11 rounded-sm border px-2 text-sm font-semibold', direction === o.value ? 'border-accent bg-tint text-accent-dark' : 'border-field-line bg-card text-ink hover:bg-row-hover')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="fix-amount">{t.newOpening}</FieldLabel>
          <div dir="ltr" className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
              {t.rs}
            </span>
            <DialogInput
              id="fix-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              invalid={amountBad}
              aria-describedby={amountBad ? 'fix-amount-error' : undefined}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className="num ps-10 text-end"
            />
          </div>
          {amountBad && (
            <p id="fix-amount-error" role="alert" className="mt-1 text-sm font-medium text-danger-ink">
              {paisa !== null && delta === 0 ? t.fixSame : t.amountInvalid}
            </p>
          )}
        </div>
        <div>
          <FieldLabel htmlFor="fix-reason">{t.reasonLabel}</FieldLabel>
          <DialogInput
            id="fix-reason"
            autoComplete="off"
            maxLength={REASON_MAX}
            value={reason}
            invalid={reasonBad}
            aria-describedby={reasonBad ? 'fix-reason-error' : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          />
          {reasonBad && (
            <p id="fix-reason-error" role="alert" className="mt-1 text-sm font-medium text-danger-ink">
              {t.reasonRequired}
            </p>
          )}
        </div>
        <p className="text-sm text-muted">{t.fixHint}</p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button type="button" variant="secondary" size="dialog" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" size="dialog">
            {t.fixSave}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
