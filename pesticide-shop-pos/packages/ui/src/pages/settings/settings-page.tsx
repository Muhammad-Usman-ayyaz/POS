import type { Api, PrinterInfo, SessionUser } from '@pos/api-contract';
import { Lock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorNotice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Card } from '../../components/ui/primitives.js';
import { Select } from '../../components/ui/select.js';
import { useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { Seg } from './seg.js';
import { buildSettingsRequest, draftFrom, type SettingsDraft } from './settings-state.js';

/**
 * Settings: the printer, the language of receipts and A4 invoices, and the shop header that is printed on them (`print:getConfig`,
 * `print:setConfig`). Owner only: staff get a calm message and no form, and nothing is asked of the shell for them.
 * Built from `docs/design/Settings.dc.html` (header, section list, the Shop details panels). Backup, staff and About are other phases and are not drawn.
 */
export function SettingsPage({ api, user }: { api: Api; user: SessionUser }) {
  const { m } = useI18n();
  if (user.role !== 'owner') {
    return (
      <div data-page="settings" className="flex flex-col gap-[18px]">
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
    <header className="stagger flex items-end justify-between gap-6">
      <div>
        <h1 className="text-[30px] font-bold leading-tight">{m.pages.settings.title}</h1>
        <p className="mt-1 text-sm text-muted">{m.pages.settings.subtitle}</p>
      </div>
      <span className="rounded-[8px] bg-warn-bg px-3 py-1 text-[13px] font-semibold leading-[1.4] text-warn-ink">{m.settings.ownerOnlyChip}</span>
    </header>
  );
}

/** Label of a field as designed: 12px, bold, capitals, letter-spaced. */
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-[.05em] text-[#4A564E]';
const PANEL = 'rounded-lg border border-[#E1DED3] bg-card px-5 py-[18px]';
const INPUT = 'h-12 rounded-sm text-[15px]';

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
    <form data-page="settings" noValidate onSubmit={(e) => (e.preventDefault(), void submit())} className="flex flex-col gap-[18px]">
      <Header />
      <div className="flex items-start gap-6">
        <nav aria-label={s.sectionsLabel} className="flex w-[216px] shrink-0 flex-col gap-1">
          <span aria-current="page" className="flex min-h-12 items-center rounded-sm bg-tint px-3.5 text-[15px] font-bold text-accent-dark shadow-[inset_3px_0_0_var(--color-accent)] rtl:shadow-[inset_-3px_0_0_var(--color-accent)]">
            {s.sectionShop}
          </span>
        </nav>
        <div className="min-w-0 grow">
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
            <div className="stagger flex flex-col gap-4" style={{ '--i': 1 } as React.CSSProperties}>
              <div>
                <h2 className="text-[20px] font-bold leading-[1.3]">{s.shopDetails}</h2>
                <p className="mt-0.5 text-sm text-muted">{s.shopDetailsHint}</p>
              </div>

              <section className={cn(PANEL, 'grid grid-cols-1 gap-4 sm:grid-cols-2')}>
                <div>
                  <label htmlFor="shop-name-ur" className={LABEL}>
                    {s.shopNameUr}
                  </label>
                  <Input id="shop-name-ur" name="shopNameUr" lang="ur" dir="rtl" maxLength={80} value={draft.shopNameUr} onChange={(e) => update({ shopNameUr: e.target.value })} className={INPUT} />
                  <p className="mt-1.5 text-sm text-muted">{s.shopNameUrHint}</p>
                </div>
                <div>
                  <label htmlFor="phone" className={LABEL}>
                    {s.phone}
                  </label>
                  <Input id="phone" name="phone" type="tel" dir="ltr" maxLength={40} value={draft.phone} onChange={(e) => update({ phone: e.target.value })} className={cn(INPUT, 'num')} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="address" className={LABEL}>
                    {s.address}
                  </label>
                  <Input id="address" name="address" dir="auto" maxLength={200} value={draft.address} onChange={(e) => update({ address: e.target.value })} className={INPUT} />
                  <p className="mt-1.5 text-sm text-muted">{s.addressHint}</p>
                </div>
              </section>

              <section className={cn(PANEL, 'grid grid-cols-1 items-end gap-4 sm:grid-cols-2')}>
                <div>
                  <span className={LABEL}>{s.receiptLanguage}</span>
                  <Seg label={s.receiptLanguage} value={draft.receiptLanguage} options={langOptions} onChange={(v) => update({ receiptLanguage: v })} />
                </div>
                <div>
                  <span className={LABEL}>{s.invoiceLanguage}</span>
                  <Seg label={s.invoiceLanguage} value={draft.invoiceLanguage} options={langOptions} onChange={(v) => update({ invoiceLanguage: v })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="printer" className={LABEL}>
                    {s.printer}
                  </label>
                  <Select id="printer" value={draft.printer} onChange={(e) => update({ printer: e.target.value })} className={INPUT}>
                    <option value="">{s.printerDefault}</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.is_default ? s.printerDefaultMark(p.display_name) : p.display_name}
                      </option>
                    ))}
                    {draft.printer !== '' && !printers.some((p) => p.name === draft.printer) && <option value={draft.printer}>{s.printerMissing(draft.printer)}</option>}
                  </Select>
                  <p className="mt-1.5 text-sm text-muted">{s.printerHint}</p>
                </div>
              </section>

              <div className="flex items-center justify-end gap-4">
                {!changed && <p className="text-sm text-muted">{s.nothingChanged}</p>}
                <Button type="submit" className="rounded-md px-[18px] text-[15px] font-bold shadow-none" disabled={!changed || saving}>
                  {saving ? s.saving : s.save}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
