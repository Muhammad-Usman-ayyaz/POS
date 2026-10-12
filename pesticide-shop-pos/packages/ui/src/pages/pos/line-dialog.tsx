import type { Api, SaleQuoteView } from '@pos/api-contract';
import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { formatDate, formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { parseRupees, pickName, stepOf, type BaseUnit, type CartLine } from './pos-state.js';

type QuoteLine = SaleQuoteView['lines'][number];
type BatchRow = Awaited<ReturnType<Api['stock']['batchesOf']>>[number];

export interface LineChanges {
  qty: number;
  discount: number;
  batchId: string | null;
}

/** A percentage such as "5" or "2.5" of `gross` paisa, in whole paisa. This only turns what was typed into paisa: the effect on the total comes from the quote. */
export function discountFromPercent(text: string, gross: number): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text.trim())) return null;
  const percent = Number(text);
  if (percent > 100) return null;
  return Math.round((gross * percent) / 100);
}

/**
 * Edit one line (also F8 for the line that is selected): the quantity, the batch (automatic, earliest expiry first, or one chosen by hand),
 * and a discount on this line in percent or rupees. Nothing is applied until Done.
 */
export function LineDialog({
  api,
  line,
  quoteLine,
  staffMaxPercent,
  isOwner,
  focusDiscount,
  onApply,
  onRemove,
  onClose,
}: {
  api: Api;
  line: CartLine;
  quoteLine: QuoteLine | undefined;
  staffMaxPercent: number;
  isOwner: boolean;
  focusDiscount: boolean;
  onApply: (changes: LineChanges) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { m, language } = useI18n();
  const t = m.pos;
  const f = t.line;
  const step = stepOf(line);
  const inPacks = !line.allowLoose && line.packSize > 1;
  const unitName = t.unit[line.baseUnit as BaseUnit];
  const [qtyText, setQtyText] = useState(String(inPacks ? line.qty / line.packSize : line.qty));
  const [batchId, setBatchId] = useState<string | null>(line.batchId);
  const [mode, setMode] = useState<'percent' | 'rupees'>('rupees');
  const gross = quoteLine?.gross ?? 0;
  const [discountText, setDiscountText] = useState(line.discount > 0 ? String(line.discount / 100) : '');
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const discountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    api.stock.batchesOf({ productId: line.productId }).then(
      (rows) => alive && setBatches(rows.filter((b) => b.stock > 0)),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [api, line.productId]);

  useEffect(() => {
    if (focusDiscount) discountRef.current?.focus();
  }, [focusDiscount]);

  const qtyNumber = /^\d+$/.test(qtyText.trim()) ? Number(qtyText) : 0;
  const qty = inPacks ? qtyNumber * line.packSize : qtyNumber;
  const discount = discountText.trim() === '' ? 0 : mode === 'percent' ? discountFromPercent(discountText, gross) : parseRupees(discountText);
  const valid = qty > 0 && discount !== null;
  const overLimit = !isOwner && discount !== null && gross > 0 && discount * 100 > gross * staffMaxPercent;

  const bump = (delta: number) => setQtyText(String(Math.max(inPacks ? 1 : step, qtyNumber + delta * (inPacks ? 1 : step))));
  const name = `${pickName(line.nameEn, line.nameUr, language)}${line.label ? ` · ${line.label}` : ''}`;
  const price = quoteLine ? formatMoney(quoteLine.unit_price, language) : '';

  return (
    <Dialog open title={name} onClose={onClose} className="max-w-[560px]">
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && discount !== null) onApply({ qty, discount, batchId });
        }}
      >
        <p className="text-muted">{inPacks || !line.allowLoose ? f.sealedHint(price) : f.looseHint(price, unitName)}</p>

        <label htmlFor="line-qty" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">
          {inPacks ? f.quantityPacks : f.quantityUnit(unitName)}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="secondary" aria-label={`${t.decrease} ${step}`} onClick={() => bump(-1)}>
            <span className="num">−{inPacks ? 1 : step}</span>
          </Button>
          <Input id="line-qty" name="qty" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} className="num text-center text-xl font-bold" invalid={qty === 0} />
          <Button variant="secondary" aria-label={`${t.increase} ${step}`} onClick={() => bump(1)}>
            <span className="num">+{inPacks ? 1 : step}</span>
          </Button>
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">{f.batch}</p>
        {batches === null && error == null && <p className="mt-2 text-muted">{f.batchesLoading}</p>}
        {error != null && <ErrorNotice error={error} className="mt-2" />}
        <div role="radiogroup" aria-label={f.batch} className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto">
          {batches !== null && (
            <>
              <BatchOption selected={batchId === null} onSelect={() => setBatchId(null)} title={f.auto} detail={f.autoHint} />
              {batches.map((b) => (
                <BatchOption
                  key={b.batch_id}
                  selected={batchId === b.batch_id}
                  disabled={b.expired}
                  onSelect={() => setBatchId(b.batch_id)}
                  title={b.batch_no}
                  detail={`${t.exp} ${formatDate(b.expiry_date, language)} · ${f.inStock(String(b.stock))}${b.expired ? ` · ${f.expired}` : ''}`}
                />
              ))}
            </>
          )}
        </div>

        <label htmlFor="line-discount" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">
          {f.discount}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            id="line-discount"
            name="discount"
            ref={discountRef}
            inputMode="decimal"
            value={discountText}
            onChange={(e) => setDiscountText(e.target.value)}
            invalid={discount === null}
            className="num"
          />
          <div role="radiogroup" aria-label={`${f.percent} / ${f.rupees}`} className="flex shrink-0 rounded-md bg-thead p-1">
            {(['percent', 'rupees'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn('min-h-11 min-w-12 rounded-sm px-3 font-semibold', mode === value ? 'bg-card shadow-button' : 'text-muted')}
              >
                {value === 'percent' ? f.percent : f.rupees}
              </button>
            ))}
          </div>
        </div>
        {discount === null ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-ink">
            {f.discountInvalid}
          </p>
        ) : overLimit ? (
          <p className="mt-2 text-sm font-medium text-warn-ink">{f.discountOver}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">{isOwner ? f.ownerLimit : f.staffLimit(staffMaxPercent)}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="danger" onClick={onRemove}>
            {f.remove}
          </Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            {f.cancel}
          </Button>
          <Button type="submit" disabled={!valid}>
            {f.done}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BatchOption({ selected, disabled, onSelect, title, detail }: { selected: boolean; disabled?: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-md border px-4 text-start disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-2 border-accent bg-tint' : 'border-line bg-card hover:bg-row-hover',
      )}
    >
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-accent' : 'border-field-line')}>
        {selected && <span className="size-2.5 rounded-full bg-accent" />}
      </span>
      <span className="num font-bold">{title}</span>
      <span className="text-sm text-muted">{detail}</span>
    </button>
  );
}
