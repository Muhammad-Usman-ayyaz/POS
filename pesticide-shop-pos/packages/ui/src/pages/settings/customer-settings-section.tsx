import type { Api, CustomerSettingsView } from '@pos/api-contract';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorNotice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useI18n } from '../../i18n/index.js';
import { buildCustomerSettingsRequest, settingsDraftFrom, settingsLimitInvalid, type CustomerSettingsDraft } from '../customers/form/customer-form-requests.js';
import { groupTyped, tidyPaidText } from '../pos/pos-state.js';
import { Seg } from './seg.js';

export type SettingsSection = 'shop' | 'customers';

const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-[.05em] text-[#4A564E]';
const PANEL = 'rounded-lg border border-[#E1DED3] bg-card px-5 py-[18px]';

/** The list of sections on the left of Settings. The one shown is marked; the owner picks the other. */
export function SettingsNav({ section, onSelect, shopLabel, label }: { section: SettingsSection; onSelect: (s: SettingsSection) => void; shopLabel: string; label: string }) {
  const { m } = useI18n();
  const items: { key: SettingsSection; text: string }[] = [
    { key: 'shop', text: shopLabel },
    { key: 'customers', text: m.customerSettings.sectionLabel },
  ];
  return (
    <nav aria-label={label} className="flex w-[216px] shrink-0 flex-col gap-1">
      {items.map((item) =>
        item.key === section ? (
          <span key={item.key} aria-current="page" className="flex min-h-12 items-center rounded-sm border-s-[3px] border-accent bg-tint pe-3.5 ps-[11px] text-[15px] font-bold text-accent-dark">
            {item.text}
          </span>
        ) : (
          <button key={item.key} type="button" onClick={() => onSelect(item.key)} className="lift flex min-h-12 items-center rounded-sm px-3.5 text-start text-[15px] font-semibold text-ink hover:bg-row-hover">
            {item.text}
          </button>
        ),
      )}
    </nav>
  );
}

/**
 * Settings, Customers section (owner only: the page shows staff a calm message instead and never gets here): the default credit limit
 * (rupees, sent as paisa) and whether the customer form shows the farmer details. Only what changed is sent.
 */
export function CustomerSettingsSection({ api }: { api: Api }) {
  const { m } = useI18n();
  const s = m.customerSettings;
  const toast = useToast();
  const [saved, setSaved] = useState<CustomerSettingsView | null>(null);
  const [draft, setDraft] = useState<CustomerSettingsDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const current = await api.customers.getSettings();
      setSaved(current);
      setDraft(settingsDraftFrom(current));
    } catch (error) {
      setLoadError(error);
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  const request = useMemo(() => (saved && draft ? buildCustomerSettingsRequest(saved, draft) : {}), [saved, draft]);
  const changed = Object.keys(request).length > 0;
  const invalid = draft !== null && settingsLimitInvalid(draft);

  const submit = async () => {
    if (!saved || !changed || saving || invalid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const reply = await api.customers.setSettings(request);
      setSaved(reply);
      setDraft(settingsDraftFrom(reply));
      toast.show({ tone: 'success', title: s.saved });
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form data-section="customers" noValidate onSubmit={(e) => (e.preventDefault(), void submit())} className="stagger flex min-w-0 grow flex-col gap-4" style={{ '--i': 1 } as React.CSSProperties}>
      <div>
        <h2 className="text-[20px] font-bold leading-[1.3]">{s.heading}</h2>
        <p className="mt-0.5 text-sm text-muted">{s.hint}</p>
      </div>
      {loadError != null && (
        <div className="flex flex-wrap items-start gap-3">
          <ErrorNotice error={loadError} className="max-w-xl" />
          <Button variant="secondary" onClick={() => void load()}>
            {s.retry}
          </Button>
        </div>
      )}
      {draft === null && loadError == null && <p className="text-muted">{s.loading}</p>}
      {saveError != null && <ErrorNotice error={saveError} className="max-w-3xl" />}
      {draft !== null && (
        <>
          <section className={`${PANEL} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
            <div>
              <label htmlFor="default-credit-limit" className={LABEL}>
                {s.defaultLimit}
              </label>
              <div dir="ltr" className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-muted">
                  {m.customerForm.rs}
                </span>
                <Input id="default-credit-limit" name="defaultCreditLimit" inputMode="decimal" invalid={invalid} aria-describedby="default-credit-limit-hint" value={draft.defaultLimit} onChange={(e) => setDraft({ ...draft, defaultLimit: groupTyped(e.target.value) })} onBlur={() => setDraft({ ...draft, defaultLimit: tidyPaidText(draft.defaultLimit) })} className="num h-12 rounded-sm ps-12 text-end text-[15px]" />
              </div>
              <p id="default-credit-limit-hint" className={invalid ? 'mt-1.5 text-sm font-medium text-danger-ink' : 'mt-1.5 text-sm text-muted'} role={invalid ? 'alert' : undefined}>
                {invalid ? s.limitInvalid : s.defaultLimitHint}
              </p>
            </div>
            <div>
              <span className={LABEL}>{s.showFarmer}</span>
              <Seg
                label={s.showFarmer}
                value={draft.showFarmer ? 'on' : 'off'}
                options={[
                  { value: 'on' as const, label: s.on },
                  { value: 'off' as const, label: s.off },
                ]}
                onChange={(v) => setDraft({ ...draft, showFarmer: v === 'on' })}
              />
              <p className="mt-1.5 text-sm text-muted">{s.showFarmerHint}</p>
            </div>
          </section>
          <div className="flex items-center justify-end gap-4">
            {!changed && <p className="text-sm text-muted">{s.nothingChanged}</p>}
            <Button type="submit" className="rounded-md px-[18px] text-[15px] font-bold shadow-none" disabled={!changed || saving || invalid}>
              {saving ? s.saving : s.save}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
