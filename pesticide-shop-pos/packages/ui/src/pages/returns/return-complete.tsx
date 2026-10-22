import type { Api, ReturnDetailView } from '@pos/api-contract';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Num } from '../../components/ui/primitives.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { quantityShown } from './returns-format.js';
import { customerText, lineName } from '../../print/format.js';
import { ReturnPrintActions } from './return-print-actions.js';

/** The facts of a made return, from `returns:get`: what was refunded, how it was paid, and where the customer stands now. */
export function ReturnFacts({ detail }: { detail: ReturnDetailView }) {
  const { m, language } = useI18n();
  const t = m.returns.done;
  const money = (n: number) => formatMoney(n, language);
  const r = detail.return;
  const to = r.cash_amount > 0 && r.khata_amount > 0 ? t.toBoth : r.khata_amount > 0 ? t.toKhata : t.toCash;
  const who = detail.customer ? lineName(detail.customer, language) : '';
  return (
    <dl className="mt-4 flex flex-col gap-2 text-base">
      <div className="flex justify-between gap-3">
        <dt className="text-muted">{t.refundTotal}</dt>
        <dd data-done-total className="num font-semibold">{money(r.total)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted">{t.includedTax}</dt>
        <dd data-done-tax className="num">{money(r.tax_total)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted">{t.refundedTo}</dt>
        <dd data-done-to className="font-semibold">{to}</dd>
      </div>
      {r.cash_amount > 0 && r.khata_amount > 0 && (
        <div className="flex justify-between gap-3 text-sm text-muted">
          <dt>{`${m.returns.list.cash} / ${m.returns.list.khata}`}</dt>
          <dd className="num">{`${money(r.cash_amount)} / ${money(r.khata_amount)}`}</dd>
        </div>
      )}
      {detail.balance_after !== null && (
        <div className="mt-1 flex justify-between gap-3 rounded-md bg-tint-soft px-4 py-3 font-semibold">
          <dt>{detail.balance_after < 0 ? t.advanceNow(who) : detail.balance_after === 0 ? t.clearNow(who) : t.owesNow(who)}</dt>
          <dd data-done-balance className="num">{detail.balance_after === 0 ? '' : money(Math.abs(detail.balance_after))}</dd>
        </div>
      )}
    </dl>
  );
}

/** "Return complete": the credit note number, the facts, and the print buttons. The original invoice is unchanged. */
export function ReturnComplete({ api, returnId, onAnother }: { api: Api; returnId: string; onAnother: () => void }) {
  const { m } = useI18n();
  const t = m.returns.done;
  const [detail, setDetail] = useState<ReturnDetailView | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    api.returns.get({ return_id: returnId }).then(
      (d) => alive && setDetail(d),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [api, returnId]);

  return (
    <section data-return-complete className="rounded-lg border border-line bg-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="pop grid size-12 shrink-0 place-items-center rounded-full bg-tint text-accent">
          <CheckCircle2 aria-hidden className="size-7" />
        </span>
        <div>
          <h2 className="text-xl font-bold">{t.title}</h2>
          {detail && (
            <p className="text-muted">
              {t.creditNote(detail.return.return_no, detail.invoice.invoice_no)}
            </p>
          )}
        </div>
      </div>
      {error != null && <ErrorNotice error={error} className="mt-4" />}
      {detail && <ReturnFacts detail={detail} />}
      {detail && <p className="mt-4 text-sm text-muted">{t.unchanged(detail.invoice.invoice_no)}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <ReturnPrintActions api={api} returnId={returnId} />
        <Button variant="secondary" onClick={onAnother}>
          {t.another}
        </Button>
      </div>
    </section>
  );
}

/** One past return: its lines as they came back (with the unit), the money, and the print buttons. */
export function ReturnDetailBody({ api, detail }: { api: Api; detail: ReturnDetailView }) {
  const { m, language } = useI18n();
  const t = m.returns;
  const money = (n: number) => formatMoney(n, language);
  return (
    <div data-return-detail>
      <p className="text-muted">
        <Num>{detail.invoice.invoice_no}</Num>
        {detail.customer && <> · {customerText(detail, language)}</>}
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-start">
          <thead className="bg-thead text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 text-start">{t.colItem}</th>
              <th className="px-4 py-3 text-end">{t.colQty}</th>
              <th className="px-4 py-3 text-start">{t.reasonLabel}</th>
              <th className="px-4 py-3 text-start">{t.stock}</th>
              <th className="px-4 py-3 text-end">{t.colRefund}</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l) => (
              <tr key={l.position} className="border-t border-row-line">
                <td className="px-4 py-3">{lineName(l, language)}</td>
                <td className="num px-4 py-3 text-end">{quantityShown(m, language, l.base_unit, l.pack_size, l.qty)}</td>
                <td className="px-4 py-3">{l.reason && l.reason in t.reasons ? t.reasons[l.reason as keyof typeof t.reasons] : (l.reason ?? '—')}</td>
                <td className="px-4 py-3">{l.condition === 'resellable' ? t.backToStock : t.writtenOff}</td>
                <td className="num px-4 py-3 text-end font-semibold">{money(l.refund_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReturnFacts detail={detail} />
      <p className="mt-2 text-sm text-muted">
        {t.list.approvedBy}: {detail.return.approved_by}
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-3">
        <ReturnPrintActions api={api} returnId={detail.return.id} />
      </div>
    </div>
  );
}
