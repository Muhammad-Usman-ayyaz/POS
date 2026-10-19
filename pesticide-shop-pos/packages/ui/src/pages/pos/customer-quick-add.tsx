import { ApiError, type Api, type DuplicateMatchView } from '@pos/api-contract';
import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { CustomerDuplicateDialog } from '../customers/form/customer-form-duplicate-dialog.js';
import { billCustomerFrom, buildQuickAddDuplicatesRequest, buildQuickAddRequest, hasUrduScript, quickAddNameMissing, type QuickAddForm } from './customer-quick-add-request.js';
import { Actions, DialogInput, FieldLabel } from './counter-ui.js';
import type { Customer } from './pos-state.js';

/**
 * The compact "New customer" form inside the F4 picker. There is no design for it: it uses the picker's own parts (48px inputs, `.lbl` labels, the
 * dialog button row). Contact fields only: no credit field for anyone, because the shell applies the shop's default limit and the retail price type
 * and the owner sets terms on the customer page. A line under the form says what limit the new customer will have, so unlimited credit is never a surprise.
 */
export function CustomerQuickAdd({ api, start, onBack, onCreated }: { api: Api; start: QuickAddForm; onBack: () => void; onCreated: (customer: Customer) => void }) {
  const { m, language } = useI18n();
  const t = m.quickAdd;
  const [form, setForm] = useState<QuickAddForm>(start);
  const [defaultLimit, setDefaultLimit] = useState<number | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [matches, setMatches] = useState<DuplicateMatchView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false); // set at once, so a second press before React re-renders cannot send a second request
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    api.customers.getSettings().then(
      (s) => alive && setDefaultLimit(s.default_credit_limit),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const set = (key: keyof QuickAddForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'name') setNameMissing(false);
  };

  const finish = (customer: Customer) => onCreated(customer);

  const save = async (confirmDuplicate = false) => {
    if (working.current) return;
    if (quickAddNameMissing(form)) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await api.customers.create(buildQuickAddRequest(form, confirmDuplicate));
      finish(billCustomerFrom(created.customer));
      return; // the dialog closes: stay "busy" so nothing can be sent again
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE_CUSTOMER' && !confirmDuplicate) {
        try {
          const found = await api.customers.findDuplicates(buildQuickAddDuplicatesRequest(form));
          if (found.length > 0) {
            setMatches(found);
            working.current = false;
            setBusy(false);
            return;
          }
        } catch {
          // fall through to the plain message
        }
      }
      setError(e);
    }
    working.current = false;
    setBusy(false);
  };

  /** "Use existing": the picked customer goes onto the bill with their own price type (the warning only lists names and balances). */
  const useExisting = async (customerId: string) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const found = await api.customers.get({ customer_id: customerId });
      finish(billCustomerFrom(found.customer));
      return;
    } catch (e) {
      setMatches(null);
      setError(e);
    }
    working.current = false;
    setBusy(false);
  };

  const typedName = form.name.trim();
  return (
    <>
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <FieldLabel htmlFor="quick-name">{t.name}</FieldLabel>
          <DialogInput
            id="quick-name"
            name="name"
            ref={nameRef}
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            dir={hasUrduScript(form.name) ? 'rtl' : 'auto'}
            invalid={nameMissing}
            aria-describedby={nameMissing ? 'quick-name-problem' : undefined}
          />
          {nameMissing && (
            <p id="quick-name-problem" role="alert" className="mt-1 text-[13px] font-semibold text-danger-ink">
              {t.nameRequired}
            </p>
          )}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="quick-phone">{t.phone}</FieldLabel>
            <DialogInput id="quick-phone" name="phone" type="tel" inputMode="tel" dir="ltr" className="num text-start" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="quick-village">{t.village}</FieldLabel>
            <DialogInput id="quick-village" name="village" dir="auto" value={form.village} onChange={(e) => set('village', e.target.value)} />
          </div>
        </div>
        {defaultLimit !== null && (
          <p data-default-limit className="rounded-md bg-thead px-3 py-2.5 text-[13px] font-semibold text-ink-mid">
            {defaultLimit > 0 ? t.limitIs(formatMoney(defaultLimit, language)) : t.limitNone}
          </p>
        )}
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button type="button" variant="secondary" size="dialog" onClick={onBack} disabled={busy}>
            {t.back}
          </Button>
          <Button type="submit" size="dialog" disabled={busy}>
            {busy ? t.saving : t.save}
          </Button>
        </Actions>
      </form>
      <CustomerDuplicateDialog
        matches={matches}
        typedName={typedName}
        busy={busy}
        openLabel={t.useExisting}
        onCancel={() => setMatches(null)}
        onOpen={(id) => void useExisting(id)}
        onSaveNew={() => {
          setMatches(null);
          void save(true);
        }}
      />
    </>
  );
}
