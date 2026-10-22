import { ApiError, type InvoiceForReturnView } from '@pos/api-contract';
import { useEffect, useState } from 'react';
import { Select } from '../../components/ui/select.js';
import { cn } from '../../lib/cn.js';
import { describeError, formatMoney, useI18n } from '../../i18n/index.js';
import { readQuantity, unitName } from '../../i18n/units.js';
import { quantityShown } from './returns-format.js';
import { lineName, lineQuantity } from '../../print/format.js';
import { clampQty, countsPacks, qtyBoxText, stepQty, RETURN_REASONS, type Condition, type Draft, type DraftLine, type ReturnLine, type ReturnReason } from './returns-state.js';

/** One button of the Resellable / Damaged / Expired choice. */
function ConditionButton({ active, disabled, label, hint, onClick, tone }: { active: boolean; disabled?: boolean; label: string; hint: string; onClick: () => void; tone: 'good' | 'bad' }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'lift min-h-11 flex-1 rounded-md border px-3 py-1.5 text-start text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55',
        active ? (tone === 'good' ? 'border-accent bg-tint text-accent-dark' : 'border-warn-edge bg-warn-bg text-warn-deep') : 'border-line bg-card text-ink hover:bg-row-hover',
      )}
    >
      <span className="block">{label}</span>
      <span className="block text-xs font-normal text-muted">{hint}</span>
    </button>
  );
}

/** The number box with Less and More: whole packs for a sealed size (no typing), else kg or L typed or stepped. */
function QtyStepper({ line, qty, disabled, onChange }: { line: ReturnLine; qty: number; disabled: boolean; onChange: (qty: number) => void }) {
  const { m, language } = useI18n();
  const t = m.returns;
  const packs = countsPacks(line);
  const [text, setText] = useState(qtyBoxText(line, qty));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setText(qtyBoxText(line, qty));
    setProblem(null);
  }, [line, qty]);

  const unit = packs ? (line.pack_size <= 1 ? unitName(m, line.base_unit, 2) : m.units.packs) : unitName(m, line.base_unit, 2);
  const name = lineName(line, language);

  const typed = (value: string) => {
    setText(value);
    const read = readQuantity(m, line.base_unit, value, true);
    if (!read.ok) return setProblem(read.message);
    if (read.value > line.qty_returnable) return setProblem(describeError(new ApiError('RETURN_EXCEEDS_SOLD', 'too much', { returnable: line.qty_returnable, requested: read.value, packSize: line.pack_size, unit: line.base_unit }), language).title);
    setProblem(null);
    onChange(clampQty(line, read.value));
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={t.less} disabled={disabled || qty <= 0} onClick={() => onChange(stepQty(line, qty, -1))} className="lift grid size-11 place-items-center rounded-md border border-field-line bg-card text-xl font-semibold hover:bg-row-hover disabled:opacity-55">
          −
        </button>
        <div className="w-20 text-center">
          {packs ? (
            <div data-qty className="num text-lg font-semibold">
              {qtyBoxText(line, qty)}
            </div>
          ) : (
            <input
              data-qty
              aria-label={t.qtyInput(name)}
              inputMode="decimal"
              dir="ltr"
              disabled={disabled}
              value={text}
              onChange={(e) => typed(e.target.value)}
              className={cn('num h-11 w-full rounded-md border bg-card px-1 text-center text-lg font-semibold', problem ? 'border-danger-ink' : 'border-field-line')}
            />
          )}
          <div className="text-xs text-muted">{unit}</div>
        </div>
        <button type="button" aria-label={t.more} disabled={disabled || qty >= line.qty_returnable} onClick={() => onChange(stepQty(line, qty, 1))} className="lift grid size-11 place-items-center rounded-md border border-field-line bg-card text-xl font-semibold hover:bg-row-hover disabled:opacity-55">
          +
        </button>
      </div>
      {problem && (
        <p role="alert" className="max-w-40 text-center text-xs font-medium text-danger-ink">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The lines of the sale: what was sold, what already came back, how much to return now (in the line's own unit), its condition and its reason.
 * The refund of each line is what `returns:preview` says (no arithmetic here); until then the cell is empty.
 */
export function ReturnLines({
  view,
  draft,
  refunds,
  canChooseCondition,
  onChange,
}: {
  view: InvoiceForReturnView;
  draft: Draft;
  /** Refund per invoice_item_id from the preview. */
  refunds: ReadonlyMap<string, number>;
  /** The owner decides resellable or written off; for staff it is a proposal the owner confirms in the approval box. */
  canChooseCondition: boolean;
  onChange: (id: string, patch: Partial<DraftLine>) => void;
}) {
  const { m, language } = useI18n();
  const t = m.returns;
  const money = (n: number) => formatMoney(n, language);
  const voided = view.invoice.status === 'voided';

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card shadow-card" data-return-lines>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_0.7fr_0.8fr_1.3fr_0.8fr] gap-3 bg-thead px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
        <span>{t.colItem}</span>
        <span className="text-end">{t.colSold}</span>
        <span className="text-end">{t.colReturned}</span>
        <span className="text-center">{t.colQty}</span>
        <span className="text-end">{t.colRefund}</span>
      </div>
      {view.lines.map((line) => {
        const item = draft[line.invoice_item_id] ?? { qty: 0, condition: 'resellable' as Condition, reason: '' as const };
        const q = lineQuantity(line, language);
        const name = lineName(line, language);
        const spent = line.qty_returnable === 0;
        const refund = refunds.get(line.invoice_item_id);
        const writeOff: Condition = line.batch_expired ? 'expired' : 'damaged';
        return (
          <div key={line.invoice_item_id} data-return-line={line.invoice_item_id} className="border-t border-row-line px-5 py-4">
            <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(0,1.6fr)_0.7fr_0.8fr_1.3fr_0.8fr]">
              <div>
                <div className="font-semibold">
                  {name}
                  {q.loose && <span className="ms-2 text-sm font-normal text-muted">{t.loose}</span>}
                </div>
                <div className="text-sm text-muted">
                  <span className="num">{countsPacks(line) ? t.each(money(line.unit_price)) : t.perUnit(q.rateText)}</span>
                  {line.line_discount > 0 && <span className="num"> · {t.discountShared(money(line.line_discount))}</span>}
                </div>
              </div>
              <div data-sold className="num text-end">{quantityShown(m, language, line.base_unit, line.pack_size, line.qty)}</div>
              <div data-returned className="num text-end">{line.qty_returned === 0 ? '0' : quantityShown(m, language, line.base_unit, line.pack_size, line.qty_returned)}</div>
              <div className="flex justify-center">
                {spent || voided ? (
                  <span className="text-sm text-muted">{t.fullyReturned}</span>
                ) : (
                  <QtyStepper line={line} qty={item.qty} disabled={false} onChange={(qty) => onChange(line.invoice_item_id, { qty })} />
                )}
              </div>
              <div data-refund className="num text-end font-semibold">
                {item.qty > 0 && refund !== undefined ? money(refund) : money(0)}
              </div>
            </div>

            {item.qty > 0 && (
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <div role="group" aria-label={t.conditionLabel} className="flex min-w-[16rem] flex-1 gap-2">
                  <ConditionButton
                    tone="good"
                    active={item.condition === 'resellable'}
                    disabled={!canChooseCondition || line.batch_expired}
                    label={t.resellable}
                    hint={line.batch_expired ? t.expiredBatch : t.backToStock}
                    onClick={() => onChange(line.invoice_item_id, { condition: 'resellable' })}
                  />
                  <ConditionButton
                    tone="bad"
                    active={item.condition !== 'resellable'}
                    disabled={!canChooseCondition}
                    label={item.condition === 'expired' || line.batch_expired ? t.expired : t.damaged}
                    hint={t.writtenOff}
                    onClick={() => onChange(line.invoice_item_id, { condition: writeOff })}
                  />
                </div>
                <div className="min-w-[14rem] flex-1">
                  <Select aria-label={t.reasonLabel} data-reason value={item.reason} onChange={(e) => onChange(line.invoice_item_id, { reason: e.target.value as ReturnReason | '' })} className="h-12 text-base">
                    <option value="">{t.chooseReason}</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t.reasons[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                {!canChooseCondition && <p className="w-full text-xs text-muted">{t.ownerDecides}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
