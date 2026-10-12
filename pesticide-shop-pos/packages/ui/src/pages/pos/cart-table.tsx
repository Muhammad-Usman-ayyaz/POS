import type { SaleQuoteView } from '@pos/api-contract';
import { Notice } from '../../components/feedback.js';
import { describeError, formatDate, formatMoney, useI18n, type Messages } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { ApiError } from '@pos/api-contract';
import { Chip, TrashIcon } from './counter-ui.js';
import { pickName, stepOf, type BaseUnit, type CartLine } from './pos-state.js';

/** Product, Qty (132), Price (92), Total (104) and the bin: the widths of docs/design/Main.dc.html (the bin column is 44, the touch size, not 40). */
const COLS = 'grid-cols-[minmax(0,1fr)_132px_92px_104px_44px]';

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
      <div role="row" className={cn('sticky top-0 z-10 grid items-center gap-x-4 bg-thead px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-label', COLS)}>
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
              'stagger grid min-h-[76px] items-center gap-x-4 border-t border-row-line px-4 py-2.5 hover:bg-row-hover',
              COLS,
              selectedKey === line.key && 'bg-tint-soft hover:bg-tint-soft',
              problem && 'bg-danger-bg/40',
            )}
          >
            <div role="cell" className="min-w-0">
              <button type="button" onClick={() => onEdit(line.key)} title={t.editLine} className="flex max-w-full flex-wrap items-baseline gap-2 rounded-sm text-start">
                <span className="text-base font-semibold leading-[1.35]">{name}</span>
                {line.label !== '' && (
                  <Chip dir="auto">{line.label}</Chip>
                )}
                {line.allowLoose && <Chip>{t.looseBadge(line.baseUnit)}</Chip>}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {batch && (
                  <span className="text-[12.5px] text-muted">
                    <span className="num">{batch.batch_no}</span> · {t.exp} <span className="num">{formatDate(batch.expiry_date, language)}</span>
                  </span>
                )}
                {line.batchId && <Chip>{t.batchPicked}</Chip>}
                {q && q.line_discount > 0 && <Chip tone="ok">{t.discBadge(formatMoney(q.line_discount, language))}</Chip>}
                {q && q.discount_over_limit && staffLimit && needsOwner && <Chip tone="warn">{t.needsOwner}</Chip>}
                {nearest && <Chip tone="warn" className="pulse-soft">{t.nearExpiry(nearest.days_to_expiry)}</Chip>}
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
            <div role="cell" dir="ltr" className="flex w-[132px] items-center justify-between">
              <button type="button" aria-label={`${t.decrease}: ${name}`} onClick={() => onStep(line.key, -1)} disabled={line.qty <= stepOf(line)} className="lift grid size-11 shrink-0 place-items-center rounded-[9px] border border-field-line bg-card text-xl disabled:opacity-50">
                −
              </button>
              <div className="-mx-1 min-w-0 flex-1 whitespace-nowrap text-center">
                <p data-qty className="num text-[17px] font-bold leading-[1.15]">
                  {value}
                </p>
                <p className="text-[11.5px] leading-[1.2] text-muted">{unit}</p>
              </div>
              <button type="button" aria-label={`${t.increase}: ${name}`} onClick={() => onStep(line.key, 1)} className="lift grid size-11 shrink-0 place-items-center rounded-[9px] border border-field-line bg-card text-xl">
                +
              </button>
            </div>
            <p role="cell" className="num text-end text-ink-mid">
              {q ? formatMoney(q.unit_price, language) : '—'}
            </p>
            <p role="cell" data-line-total className="num text-end text-[17px] font-bold">
              {q ? formatMoney(q.line_total, language) : '—'}
            </p>
            <button type="button" aria-label={`${t.removeLine}: ${name}`} onClick={() => onRemove(line.key)} className="lift grid size-11 place-items-center rounded-[9px] text-danger-ink">
              <TrashIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}
