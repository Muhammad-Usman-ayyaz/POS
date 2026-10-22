import type { Api, InvoiceForReturnView, VoidInvoiceView } from '@pos/api-contract';
import { useState } from 'react';
import { ErrorNotice, Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { formatDate, formatMoney, useI18n } from '../../i18n/index.js';
import { customerText } from '../../print/format.js';

/**
 * "Void a whole invoice (owner only)", as designed. The reason is required and the button stays off until there is one. A confirmed void cannot be taken
 * back; the invoice stays on record marked voided. An invoice that already has returns, or is already voided, cannot be voided: the card says so
 * instead of offering the button (the shell and the database refuse it too).
 */
export function VoidCard({ api, view, onVoided }: { api: Api; view: InvoiceForReturnView; onVoided: (result: VoidInvoiceView) => void }) {
  const { m, language } = useI18n();
  const t = m.returns.void;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<VoidInvoiceView | null>(null);
  const money = (n: number) => formatMoney(n, language);
  const invoice = view.invoice;
  const blocked = invoice.status === 'voided' ? t.alreadyVoided : view.has_returns ? t.hasReturns : null;

  const submit = async () => {
    if (busy || reason.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.invoices.void({ invoice_id: invoice.id, reason: reason.trim() });
      setDone(result);
      onVoided(result);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <section data-void-card id="void" className="rounded-lg border border-line bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.lead}</p>
        </div>
        <Badge tone="danger">{t.ownerOnly}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-tint-soft px-4 py-3">
        <Num className="font-semibold">{invoice.invoice_no}</Num>
        <span>
          {customerText(view, language) ?? m.returns.walkIn} · <Num>{formatDate(invoice.invoice_date.slice(0, 10), language)}</Num>
        </span>
        <Num className="ms-auto font-semibold">{money(invoice.total)}</Num>
      </div>

      {done ? (
        <div className="mt-4" data-void-done>
          <Notice tone="success" title={t.done(done.invoice_no, done.khata_reversed > 0 ? money(done.khata_reversed) : '', done.cash_back > 0 ? money(done.cash_back) : '')} />
        </div>
      ) : blocked ? (
        <div className="mt-4" data-void-blocked>
          <Notice tone="warning" title={blocked} />
        </div>
      ) : (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="void-reason" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
            {t.reasonLabel}
          </label>
          <Input id="void-reason" aria-label={t.reasonAria} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          <p className="mt-3 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger-ink">
            <b>{t.warnTitle}</b> {t.warnBody}
          </p>
          {error != null && <ErrorNotice error={error} className="mt-3" />}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy || reason === ''} onClick={() => setReason('')}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="danger" data-void-confirm disabled={busy || reason.trim() === ''}>
              {busy ? t.working : t.confirm}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
