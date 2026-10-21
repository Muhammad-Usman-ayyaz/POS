import { ApiError, type Api, type CustomerSummaryView } from '@pos/api-contract';
import { useRef, useState } from 'react';
import { ErrorNotice, Notice, useToast } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Dialog } from '../../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../../i18n/index.js';
import { cn } from '../../../lib/cn.js';
import { Actions, DialogInput, FieldLabel } from '../../pos/counter-ui.js';
import { balanceView } from '../detail/customer-detail-state.js';
import { buildOpeningRequest, DEFAULT_DIRECTION, openingPaisa, type OpeningDirection } from './customer-opening-requests.js';

/**
 * Opening balance (docs/design/CustomerForms.dc.html, section 2; OWNER only: the page never offers it to staff, and the shell refuses staff).
 * Direction (They owe us / We owe them), an amount in rupees, then a confirm step. The contract has no note and no date for it, so the
 * design's Note and Date fields are not here. A second one is refused by the shell (OPENING_BALANCE_EXISTS): the box says so calmly;
 * correcting an opening balance is not built yet (the owner has not decided how).
 * After saving the customer is read again and the toast says what the shell now reports.
 */
export function CustomerOpeningDialog({
  api,
  customerId,
  name,
  onClose,
  onSaved,
}: {
  api: Api;
  customerId: string;
  name: string;
  onClose: () => void;
  /** Called with the customer as the shell reports it after the save. */
  onSaved: (summary: CustomerSummaryView) => void;
}) {
  const { m, language } = useI18n();
  const t = m.customerOpening;
  const toast = useToast();
  const [direction, setDirection] = useState<OpeningDirection>(DEFAULT_DIRECTION);
  const [amount, setAmount] = useState('');
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const money = (n: number) => formatMoney(n, language);
  const paisa = openingPaisa(amount);
  const invalid = checked && paisa === null;

  const goConfirm = () => {
    setChecked(true);
    setError(null);
    if (paisa !== null) setStep('confirm');
  };

  const save = async () => {
    if (inFlight.current || paisa === null) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await api.khata.setOpeningBalance(buildOpeningRequest(customerId, direction, amount));
      const summary = await api.customers.get({ customer_id: customerId });
      const b = balanceView(summary.balance);
      const text = b.kind === 'owes' ? m.customerDetail.owes(money(b.amount)) : b.kind === 'advance' ? m.customerDetail.advance(money(b.amount)) : m.customerDetail.clear;
      toast.show({ tone: 'success', title: t.saved(name, text) });
      onSaved(summary);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OPENING_BALANCE_EXISTS') setExists(true);
      else setError(e);
      setStep('form');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (exists) {
    return (
      <Dialog counter open title={t.title} onClose={onClose} className="max-w-[460px]">
        <Notice tone="warning" title={t.exists} />
        <Actions>
          <Button size="dialog" onClick={onClose}>
            {t.close}
          </Button>
        </Actions>
      </Dialog>
    );
  }

  if (step === 'confirm' && paisa !== null) {
    return (
      <Dialog counter open title={t.confirmTitle} onClose={onClose} locked={saving} className="max-w-[460px]">
        <p data-opening-confirm className="text-[15px]">
          {direction === 'they_owe_us' ? t.confirmTheyOwe(name, money(paisa)) : t.confirmWeOwe(name, money(paisa))}
        </p>
        <p className="text-sm text-muted">{t.oneTime}</p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button variant="secondary" size="dialog" disabled={saving} onClick={() => setStep('form')}>
            {t.back}
          </Button>
          <Button size="dialog" disabled={saving} onClick={() => void save()}>
            {saving ? t.saving : t.confirm}
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
    <Dialog counter eyebrow={t.ownerOnly} title={t.title} lead={t.lead} onClose={onClose} locked={saving} open className="max-w-[460px]">
      <form
        noValidate
        data-opening-form
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
        </div>
        <div>
          <FieldLabel id="open-direction-label">{t.direction}</FieldLabel>
          <div role="radiogroup" aria-labelledby="open-direction-label" className="grid grid-cols-2 gap-2">
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
          <FieldLabel htmlFor="open-amount">{t.amount}</FieldLabel>
          <div dir="ltr" className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
              {t.rs}
            </span>
            <DialogInput
              id="open-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              invalid={invalid}
              aria-describedby={invalid ? 'open-amount-error' : undefined}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className="num ps-10 text-end"
            />
          </div>
          {invalid && (
            <p id="open-amount-error" role="alert" className="mt-1 text-sm font-medium text-danger-ink">
              {t.amountInvalid}
            </p>
          )}
        </div>
        <p className="text-sm text-muted">{t.oneTime}</p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button type="button" variant="secondary" size="dialog" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" size="dialog">
            {t.save}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
