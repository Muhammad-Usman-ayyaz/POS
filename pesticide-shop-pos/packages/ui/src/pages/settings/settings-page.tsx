import type { Api, PrinterInfo, SessionUser } from '@pos/api-contract';
import { Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorNotice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Card, Field } from '../../components/ui/primitives.js';
import { SegmentedToggle } from '../../components/ui/segmented.js';
import { Select } from '../../components/ui/select.js';
import { useI18n } from '../../i18n/index.js';
import { buildSettingsRequest, draftFrom, type SettingsDraft } from './settings-state.js';

/**
 * Settings: the printer, the language of receipts and A4 invoices, and the shop header that is printed on them (`print:getConfig`,
 * `print:setConfig`). Owner only: staff get a calm message and no form, and nothing is asked of the shell for them.
 * Built from the Products and Receive stock forms; there is NO design file for it (Settings.dc.html is missing), so the look follows those screens.
 */
export function SettingsPage({ api, user }: { api: Api; user: SessionUser }) {
  const { m } = useI18n();
  if (user.role !== 'owner') {
    return (
      <div data-page="settings">
        <Header />
        <Card className="stagger grid min-h-[240px] place-items-center p-8 text-center" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="max-w-md">
            <Lock aria-hidden className="mx-auto mb-4 size-10 text-muted" />
            <p className="text-xl font-semibold">{m.settings.ownerOnlyTitle}</p>
            <p className="mt-2 text-muted">{m.settings.ownerOnlyBody}</p>
          </div>
        </Card>
      </div>
    );
  }
  return <OwnerSettings api={api} />;
}

function Header() {
  const { m } = useI18n();
  return (
    <header className="stagger mb-6">
      <h1 className="text-[32px] font-bold leading-tight">{m.pages.settings.title}</h1>
      <p className="mt-1 text-base text-muted">{m.pages.settings.subtitle}</p>
    </header>
  );
}

function OwnerSettings({ api }: { api: Api }) {
  const { m } = useI18n();
  const s = m.settings;
  const toast = useToast();
  const [saved, setSaved] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [config, list] = await Promise.all([api.print.getConfig(), api.printers.list()]);
      setPrinters(list);
      setSaved(draftFrom(config));
      setDraft(draftFrom(config));
    } catch (error) {
      setLoadError(error);
    }
  }, [api]);
  useEffect(() => void load(), [load]);

  const request = useMemo(() => (saved && draft ? buildSettingsRequest(saved, draft) : {}), [saved, draft]);
  const changed = Object.keys(request).length > 0;

  const submit = async () => {
    if (!saved || !changed || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const reply = await api.print.setConfig(request);
      setSaved(draftFrom(reply));
      setDraft(draftFrom(reply));
      toast.show({ tone: 'success', title: s.saved });
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<SettingsDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const langOptions = [
    { value: 'en' as const, label: s.english, lang: 'en' },
    { value: 'ur' as const, label: s.urdu, lang: 'ur' },
  ];

  return (
    <form data-page="settings" noValidate onSubmit={(e) => (e.preventDefault(), void submit())}>
      <Header />
      {loadError != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={loadError} className="max-w-xl" />
          <Button variant="secondary" onClick={() => void load()}>
            {s.retry}
          </Button>
        </div>
      )}
      {draft === null && loadError == null && <p className="text-muted">{s.loading}</p>}
      {saveError != null && <ErrorNotice error={saveError} className="mb-4 max-w-3xl" />}

      {draft !== null && (
        <>
          <section className="stagger rounded-lg border border-line bg-card p-6 shadow-card" style={{ '--i': 1 } as React.CSSProperties} aria-labelledby="printing-heading">
            <h2 id="printing-heading" className="text-xl font-bold">
              {s.printing}
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">{s.printingHint}</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field id="printer" label={s.printer} hint={s.printerHint} className="lg:col-span-2">
                <Select id="printer" value={draft.printer} onChange={(e) => update({ printer: e.target.value })}>
                  <option value="">{s.printerDefault}</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.is_default ? s.printerDefaultMark(p.display_name) : p.display_name}
                    </option>
                  ))}
                  {draft.printer !== '' && !printers.some((p) => p.name === draft.printer) && <option value={draft.printer}>{s.printerMissing(draft.printer)}</option>}
                </Select>
              </Field>
              <div className="flex flex-col gap-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted">{s.receiptLanguage}</span>
                <SegmentedToggle label={s.receiptLanguage} value={draft.receiptLanguage} options={langOptions} onChange={(v) => update({ receiptLanguage: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted">{s.invoiceLanguage}</span>
                <SegmentedToggle label={s.invoiceLanguage} value={draft.invoiceLanguage} options={langOptions} onChange={(v) => update({ invoiceLanguage: v })} />
              </div>
            </div>
          </section>

          <section className="stagger mt-6 rounded-lg border border-line bg-card p-6 shadow-card" style={{ '--i': 2 } as React.CSSProperties} aria-labelledby="header-heading">
            <h2 id="header-heading" className="text-xl font-bold">
              {s.header}
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">{s.headerHint}</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field id="shop-name-ur" label={s.shopNameUr} hint={s.shopNameUrHint}>
                <Input id="shop-name-ur" name="shopNameUr" lang="ur" dir="rtl" maxLength={80} value={draft.shopNameUr} onChange={(e) => update({ shopNameUr: e.target.value })} />
              </Field>
              <Field id="phone" label={s.phone}>
                <Input id="phone" name="phone" type="tel" dir="ltr" maxLength={40} value={draft.phone} onChange={(e) => update({ phone: e.target.value })} className="num" />
              </Field>
              <Field id="address" label={s.address} className="lg:col-span-2">
                <Input id="address" name="address" dir="auto" maxLength={200} value={draft.address} onChange={(e) => update({ address: e.target.value })} />
              </Field>
            </div>
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={!changed || saving}>
              {saving ? s.saving : s.save}
            </Button>
            {!changed && <p className="text-sm text-muted">{s.nothingChanged}</p>}
          </div>
        </>
      )}
    </form>
  );
}
