import type { InvoiceForReturnView, ReturnPreviewView } from '@pos/api-contract';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { quantityShown } from './returns-format.js';
import { lineName } from '../../print/format.js';
import { refundTarget, type Draft } from './returns-state.js';

/** "Insecticide 1 pack, Fertilizer 0.5 kg": the goods of the lines picked, each in its own unit. */
function goods(view: InvoiceForReturnView, preview: ReturnPreviewView, restock: boolean, m: ReturnType<typeof useI18n>['m'], language: 'en' | 'ur'): string {
  return preview.lines
    .filter((l) => l.restock === restock)
    .map((l) => {
      const line = view.lines.find((x) => x.invoice_item_id === l.invoice_item_id);
      return line ? `${lineName(line, language)} ${quantityShown(m, language, line.base_unit, line.pack_size, l.qty)}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * The right-hand card: the refund as the core worked it out (`returns:preview`), how it is paid, the Khata before and after, what happens to the
 * stock, and the button. Everything shown comes from the preview; this file does no money arithmetic.
 */
export function RefundSummary({
  view,
  draft,
  preview,
  previewError,
  isOwner,
  ready,
  busy,
  error,
  onComplete,
  onAskOwner,
}: {
  view: InvoiceForReturnView;
  draft: Draft;
  preview: ReturnPreviewView | null;
  previewError: unknown;
  isOwner: boolean;
  ready: boolean;
  busy: boolean;
  error: unknown;
  onComplete: () => void;
  onAskOwner: () => void;
}) {
  const { m, language } = useI18n();
  const t = m.returns;
  const money = (n: number) => formatMoney(n, language);
  const customerName = view.customer ? lineName(view.customer, language) || t.walkIn : t.walkIn;
  const chosen = view.lines.filter((l) => (draft[l.invoice_item_id]?.qty ?? 0) > 0);
  const target = preview ? refundTarget(preview) : null;
  const back = preview ? goods(view, preview, true, m, language) : '';
  const off = preview ? goods(view, preview, false, m, language) : '';

  return (
    <aside data-refund-summary className="rounded-lg border border-line bg-card p-6 shadow-card">
      <h2 className="text-xl font-bold">{t.summaryTitle}</h2>
      <p className="mt-1 text-sm text-muted">{chosen.length === 0 ? t.summaryNone : t.itemsBack(chosen.length)}</p>

      {preview && (
        <>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {preview.lines.map((l) => {
              const line = view.lines.find((x) => x.invoice_item_id === l.invoice_item_id);
              if (!line) return null;
              return (
                <li key={l.invoice_item_id} className="flex justify-between gap-3">
                  <span>
                    {lineName(line, language)} <span className="num">{quantityShown(m, language, line.base_unit, line.pack_size, l.qty)}</span>
                  </span>
                  <span className="num">{money(l.refund_amount)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">{t.shared}</p>

          <div className="mt-4 border-t border-row-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold">{t.refund}</span>
              <span data-refund-total className="num text-3xl font-bold text-accent-dark">
                {money(preview.total)}
              </span>
            </div>
            <p data-refund-tax className="num mt-1 text-end text-sm text-muted">
              {t.includesTax(money(preview.tax_total))}
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t.methodLabel}</div>
            <div className="flex flex-col gap-2">
              <label className={`flex items-start gap-3 rounded-md border p-3 ${target === 'cash' || target === 'both' ? 'border-accent bg-tint' : 'border-line opacity-70'}`}>
                <input type="radio" name="method" readOnly disabled checked={target === 'cash' || target === 'both'} className="mt-1" />
                <span>
                  <span className="block font-semibold">{t.cashBack}</span>
                  <span data-cash className="block text-sm text-muted">
                    {preview.cash_amount > 0 ? t.cashBackHint(money(preview.cash_amount)) : money(0)}
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-md border p-3 ${target === 'khata' || target === 'both' ? 'border-accent bg-tint' : 'border-line opacity-70'}`}>
                <input type="radio" name="method" readOnly disabled checked={target === 'khata' || target === 'both'} className="mt-1" />
                <span>
                  <span className="block font-semibold">{t.khataReduce}</span>
                  <span data-khata className="block text-sm text-muted">
                    {preview.khata_amount > 0 ? `${t.khataReduceHint(customerName)} · ${money(preview.khata_amount)}` : money(0)}
                  </span>
                </span>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">{view.refund_paid_part_to_khata ? t.methodRuleKhata : t.methodRule}</p>
          </div>

          {preview.khata_before !== null && preview.khata_after !== null && (
            <dl className="mt-4 flex flex-col gap-1 rounded-md bg-tint-soft p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t.khataBefore}</dt>
                <dd data-khata-before className="num">{money(preview.khata_before)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>{t.khataAfter}</dt>
                <dd data-khata-after className="num">{money(preview.khata_after)}</dd>
              </div>
            </dl>
          )}

          <p className="mt-4 text-sm" data-stock-note>
            <b>{t.stock}: </b>
            {back && <span>{t.stockBack(back)}</span>}
            {back && off && <span>; </span>}
            {off && <span>{t.stockOff(off)}</span>}
          </p>
          {preview.issues.length > 0 && (
            <ul role="alert" className="mt-3 flex flex-col gap-1 text-sm font-medium text-danger-ink">
              {[...new Set(preview.issues.map((i) => i.code))].map((code) => (
                <li key={code}>{t.issues[code]}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {previewError != null && <ErrorNotice error={previewError} className="mt-4" />}

      <p className="mt-4 text-sm font-semibold">{t.needsOwner}</p>
      {error != null && <ErrorNotice error={error} className="mt-3" />}
      <div className="mt-3 flex flex-col gap-2">
        {isOwner ? (
          <Button size="lg" disabled={!ready || busy} data-complete onClick={onComplete}>
            {busy ? t.working : t.complete}
          </Button>
        ) : (
          <Button size="lg" disabled={!ready || busy} data-ask-owner onClick={onAskOwner}>
            {t.ownerApproval}
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{t.unchangedNote}</p>
    </aside>
  );
}
