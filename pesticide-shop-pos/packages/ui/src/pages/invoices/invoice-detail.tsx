import type { Api, InvoiceDetail, InvoiceListRow } from '@pos/api-contract';
import { useEffect, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { formatDate, formatMoney, useI18n } from '../../i18n/index.js';
import { customerText, formatDateTime, lineName, lineQuantity } from '../../print/format.js';
import { PrintActions } from './print-actions.js';
import { SHOP_TIME_ZONE } from './time-zone.js';

/** One past sale: its lines as they were sold, the totals, and the print buttons. */
export function InvoiceDetailDialog({ api, row, isOwner = false, onClose, onPrinted }: { api: Api; row: InvoiceListRow; isOwner?: boolean; onClose: () => void; onPrinted: () => void }) {
  const { m, language } = useI18n();
  const t = m.invoices.detail;
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setDetail(null);
    setError(null);
    api.invoices.get({ invoice_id: row.id }).then(
      (d) => current && setDetail(d),
      (e: unknown) => current && setError(e),
    );
    return () => {
      current = false;
    };
  }, [api, row.id, attempt]);

  const money = (n: number) => formatMoney(n, language);
  const who = detail ? customerText(detail, language) : null;
  const invoice = detail?.invoice;

  return (
    <Dialog open title={t.title(row.invoice_no)} onClose={onClose} className="max-w-[920px]">
      {error != null && (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={error} className="max-w-xl" />
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            {m.invoices.retry}
          </Button>
        </div>
      )}
      {detail === null && error == null && (
        <p role="status" className="mt-4 text-muted">
          {t.loading}
        </p>
      )}
      {detail && invoice && (
        <div data-invoice-detail className="mt-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base sm:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="text-muted">{t.date}</dt>
            <dd className="num">{formatDateTime(invoice.invoice_date, SHOP_TIME_ZONE)}</dd>
            <dt className="text-muted">{t.customer}</dt>
            <dd>{who ?? m.invoices.walkIn}</dd>
            <dt className="text-muted">{t.soldBy}</dt>
            <dd>{detail.sold_by}</dd>
            <dt className="text-muted">{t.method}</dt>
            <dd>{m.pos.bill.methods[invoice.payment_method]}</dd>
            {invoice.due_date && (
              <>
                <dt className="text-muted">{t.dueDate}</dt>
                <dd>
                  <Num>{formatDate(invoice.due_date, language)}</Num>
                </dd>
              </>
            )}
            {invoice.status === 'voided' && (
              <>
                <dt className="text-muted">{m.invoices.statusLabel}</dt>
                <dd>
                  <Badge tone="danger">{m.invoices.voided}</Badge>
                </dd>
              </>
            )}
          </dl>

          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-start">
              <thead className="bg-thead text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 text-start">{t.colItem}</th>
                  <th className="px-4 py-3 text-end">{t.colQty}</th>
                  <th className="px-4 py-3 text-end">{t.colPrice}</th>
                  <th className="px-4 py-3 text-end">{t.colDiscount}</th>
                  <th className="px-4 py-3 text-end">{t.colTax}</th>
                  <th className="px-4 py-3 text-end">{t.colTotal}</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => {
                  const q = lineQuantity(line, language);
                  return (
                    <tr key={line.position} data-line className="border-t border-row-line">
                      <td className="px-4 py-3">
                        <span>{lineName(line, language)}</span>
                        {q.loose && <span className="ms-2 text-sm text-muted">{t.loose}</span>}
                      </td>
                      <td className="num px-4 py-3 text-end">{q.qtyText}</td>
                      <td className="num px-4 py-3 text-end">{q.rateText}</td>
                      <td className="num px-4 py-3 text-end">{line.line_discount > 0 ? money(line.line_discount) : '—'}</td>
                      <td className="num px-4 py-3 text-end">{money(line.tax_amount)}</td>
                      <td className="num px-4 py-3 text-end font-semibold">{money(line.line_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 ms-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-lg bg-tint-soft p-4">
            <dt className="font-semibold">{t.total}</dt>
            <dd data-detail-total className="num text-end text-xl font-bold">{money(invoice.total)}</dd>
            <dt className="text-sm text-muted">{t.includesTax}</dt>
            <dd className="num text-end text-sm text-muted">{money(invoice.tax_total)}</dd>
            <dt className="text-muted">{t.paid}</dt>
            <dd className="num text-end">{money(invoice.paid_amount)}</dd>
            {invoice.on_khata > 0 && (
              <>
                <dt className="text-muted">{t.onKhata}</dt>
                <dd className="num text-end">{money(invoice.on_khata)}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <p className="mt-4 text-sm text-muted">{m.invoices.printedTimes(row.print_count)}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-3">
        {detail && <PrintActions api={api} invoiceId={row.id} kinds={['receipt', 'invoice']} onDone={onPrinted} />}
        {detail && invoice?.status === 'active' && (
          <Button variant="secondary" asChild>
            <a data-return-link href={`#/returns?invoice=${row.id}`}>{m.returns.fromInvoice.returnItems}</a>
          </Button>
        )}
        {detail && invoice?.status === 'active' && isOwner && (
          <Button variant="danger" asChild>
            <a data-void-link href={`#/returns?invoice=${row.id}`}>{m.returns.fromInvoice.voidInvoice}</a>
          </Button>
        )}
        <Button onClick={onClose}>{t.close}</Button>
      </div>
    </Dialog>
  );
}
