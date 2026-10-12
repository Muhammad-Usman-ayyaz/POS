import type { SaleQuoteView } from '@pos/api-contract';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Notice } from '../../components/feedback.js';
import { describeError, formatDate, formatMoney, useI18n, type Messages } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { ApiError } from '@pos/api-contract';
import { pickName, stepOf, type BaseUnit, type CartLine } from './pos-state.js';

type QuoteLine = SaleQuoteView['lines'][number];
type Issue = SaleQuoteView['issues'][number];

/** The quantity as the shopkeeper says it: whole packs for a sealed size ("2 packs"), the unit for a loose one ("250 g"). */
export function qtyParts(line: Pick<CartLine, 'qty' | 'packSize' | 'allowLoose' | 'baseUnit'>, t: Messages['pos']): { value: string; unit: string } {
  if (line.allowLoose || line.packSize <= 1) return { value: String(line.qty), unit: line.allowLoose ? t.unit[line.baseUnit as BaseUnit] : t.packs };
  const packs = line.qty / line.packSize;
  return { value: Number.isInteger(packs) ? String(packs) : String(line.qty), unit: Number.isInteger(packs) ? (packs === 1 ? t.pack : t.packs) : t.unit[line.baseUnit as BaseUnit] };
}

/** The bill's lines, as a table: name and size, batch and expiry, the quantity with - and +, the price, the line total and a bin. */
export function CartTable({
  cart,
  quoteLines,
  issues,
  selectedKey,
  onSelect,
  onStep,
  onEdit,
  onRemove,
  staffLimit,
  needsOwner,
}: {
  cart: readonly CartLine[];
  quoteLines: readonly QuoteLine[];
  issues: readonly Issue[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onStep: (key: string, delta: 1 | -1) => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
  /** True for staff: a discount over the limit shows "needs the owner". */
  staffLimit: boolean;
  needsOwner: boolean;
}) {
  const { m, language } = useI18n();
  const t = m.pos;
  const byProduct = new Map(quoteLines.map((q) => [q.product_id, q]));

  if (cart.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-xl font-semibold">{t.cartEmptyTitle}</p>
          <p className="mt-2 text-muted">{t.cartEmptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" role="table" aria-label={t.cols.product}>
      <div role="row" className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_190px_96px_112px_44px] items-center gap-x-4 bg-thead px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
        <span role="columnheader">{t.cols.product}</span>
        <span role="columnheader" className="text-center">
          {t.cols.qty}
        </span>
        <span role="columnheader" className="text-end">
          {t.cols.price}
        </span>
        <span role="columnheader" className="text-end">
          {t.cols.total}
        </span>
        <span aria-hidden />
      </div>
      {cart.map((line, index) => {
        const q = byProduct.get(line.productId);
        const problem = issues.find((i) => i.scope === 'line' && i.line_index === index);
        const batch = q?.batches[0];
        const nearest = q?.batches.find((b) => b.near_expiry);
        const { value, unit } = qtyParts(line, t);
        const name = pickName(line.nameEn, line.nameUr, language);
        return (
          <div
            key={line.key}
            role="row"
            data-line={line.productId}
            data-problem={problem ? problem.code : undefined}
            aria-selected={selectedKey === line.key}
            onClick={() => onSelect(line.key)}
            className={cn(
              'stagger grid grid-cols-[minmax(0,1fr)_190px_96px_112px_44px] items-center gap-x-4 border-t border-row-line px-5 py-3',
              selectedKey === line.key && 'bg-tint-soft',
              problem && 'bg-danger-bg/40',
            )}
          >
            <div role="cell" className="min-w-0">
              <button type="button" onClick={() => onEdit(line.key)} title={t.editLine} className="max-w-full rounded-sm text-start">
                <span className="text-lg font-bold">{name}</span>
                {line.label !== '' && (
                  <span dir="auto" className="ms-2 rounded-full bg-row-line px-2 py-0.5 text-sm font-medium">
                    {line.label}
                  </span>
                )}
                {line.allowLoose && <span className="ms-2 rounded-full bg-row-line px-2 py-0.5 text-sm font-medium">{t.looseBadge(line.baseUnit)}</span>}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                {batch && (
                  <span>
                    <span className="num">{batch.batch_no}</span> · {t.exp} <span className="num">{formatDate(batch.expiry_date, language)}</span>
                  </span>
                )}
                {line.batchId && <span className="rounded-full bg-row-line px-2 py-0.5 text-xs">{t.batchPicked}</span>}
                {q && q.line_discount > 0 && <span className="rounded-full bg-tint px-2 py-0.5 text-xs font-semibold text-accent">{t.discBadge(formatMoney(q.line_discount, language))}</span>}
                {q && q.discount_over_limit && staffLimit && needsOwner && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">{t.needsOwner}</span>}
                {nearest && <span className="pulse-soft rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-ink">{t.nearExpiry(nearest.days_to_expiry)}</span>}
              </div>
              {problem && (
                <Notice
                  tone="danger"
                  className="mt-2 py-2"
                  title={describeError(new ApiError(problem.code, problem.message, problem.params), language).title}
                  next={describeError(new ApiError(problem.code, problem.message, problem.params), language).next}
                  code={problem.code}
                />
              )}
            </div>
            <div role="cell" className="flex items-center justify-center gap-2">
              <button type="button" aria-label={`${t.decrease}: ${name}`} onClick={() => onStep(line.key, -1)} disabled={line.qty <= stepOf(line)} className="lift grid size-11 place-items-center rounded-md border border-field-line bg-card disabled:opacity-50">
                <Minus aria-hidden className="size-5" />
              </button>
              <div className="min-w-[56px] text-center leading-tight">
                <p data-qty className="num text-xl font-bold">
                  {value}
                </p>
                <p className="text-xs text-muted">{unit}</p>
              </div>
              <button type="button" aria-label={`${t.increase}: ${name}`} onClick={() => onStep(line.key, 1)} className="lift grid size-11 place-items-center rounded-md border border-field-line bg-card">
                <Plus aria-hidden className="size-5" />
              </button>
            </div>
            <p role="cell" className="num text-end text-muted">
              {q ? formatMoney(q.unit_price, language) : '—'}
            </p>
            <p role="cell" data-line-total className="num text-end text-lg font-bold">
              {q ? formatMoney(q.line_total, language) : '—'}
            </p>
            <button type="button" aria-label={`${t.removeLine}: ${name}`} onClick={() => onRemove(line.key)} className="lift grid size-11 place-items-center rounded-md text-danger-ink hover:bg-danger-bg/50">
              <Trash2 aria-hidden className="size-5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
