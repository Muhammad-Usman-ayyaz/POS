import type { Api, SaleQuoteView } from '@pos/api-contract';
import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { SegmentedToggle } from '../../components/ui/segmented.js';
import { formatDate, formatMoney, formatQty, ltr, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { Actions, Chip, DialogInput, FieldLabel } from './counter-ui.js';
import { groupDigits, parseRupees, pickName, stepOf, type BaseUnit, type CartLine } from './pos-state.js';

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
  // A new discount is typed as a percent (the design's default); a discount already on the line is shown in rupees, as it is stored.
  const [mode, setMode] = useState<'percent' | 'rupees'>(line.discount > 0 ? 'rupees' : 'percent');
  const gross = quoteLine?.gross ?? 0;
  const [discountText, setDiscountText] = useState(line.discount > 0 ? String(line.discount / 100) : '');
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

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

  // The cursor goes where the work is: the discount for F8, otherwise the quantity ("Type the quantity or use the steps"), selected so typing replaces it.
  useEffect(() => {
    const target = focusDiscount ? discountRef.current : qtyRef.current;
    target?.focus();
    if (!focusDiscount) target?.select();
  }, [focusDiscount]);

  const qtyNumber = /^\d+$/.test(qtyText.trim()) ? Number(qtyText) : 0;
  const qty = inPacks ? qtyNumber * line.packSize : qtyNumber;
  const discount = discountText.trim() === '' ? 0 : mode === 'percent' ? discountFromPercent(discountText, gross) : parseRupees(discountText);
  const valid = qty > 0 && discount !== null;
  const overLimit = !isOwner && discount !== null && gross > 0 && discount * 100 > gross * staffMaxPercent;

  const bump = (delta: number) => setQtyText(String(Math.max(inPacks ? 1 : step, qtyNumber + delta * (inPacks ? 1 : step))));
  // The size label ("1 L") is a Latin run: left alone at the end of an Urdu title it would flip to "L 1".
  const name = `${pickName(line.nameEn, line.nameUr, language)}${line.label ? ` · ${language === 'ur' ? ltr(line.label) : line.label}` : ''}`;
  const price = quoteLine ? formatMoney(quoteLine.unit_price, language) : '';
  // "Per kg Rs 200": a 1 kg or 1 L pack is priced per kg / L; any other loose pack says its own size.
  const per = line.packSize === 1 ? f.perUnit.piece : line.packSize === 1000 && line.baseUnit !== 'piece' ? f.perUnit[line.baseUnit as BaseUnit] : `${groupDigits(line.packSize)} ${unitName}`;
  // The batches as the design lists them: earliest expiry first, and the first one that can still be sold is the one "Auto" takes.
  const sorted = (batches ?? []).slice().sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  const autoId = sorted.find((b) => !b.expired)?.batch_id ?? null;
  const stockText = (b: BatchRow): string => (line.allowLoose || line.packSize <= 1 ? `${groupDigits(b.stock)} ${line.packSize <= 1 && !line.allowLoose ? '' : unitName}`.trim() : formatQty(b.stock, line.packSize, language));

  return (
    <Dialog counter open title={name} eyebrow={f.eyebrow} lead={inPacks || !line.allowLoose ? f.sealedHint(price) : f.looseHint(price, per)} onClose={onClose}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && discount !== null) onApply({ qty, discount, batchId });
        }}
      >
        <div dir="ltr" className="grid grid-cols-[48px_1fr_48px] items-end gap-2">
          <Button variant="secondary" aria-label={`${t.decrease} ${step}`} className="px-0 text-[13px] font-bold" onClick={() => bump(-1)}>
            <span className="num">−{inPacks ? 1 : step}</span>
          </Button>
          <div>
            <FieldLabel htmlFor="line-qty">{inPacks ? f.quantityPacks : f.quantityUnit(unitName)}</FieldLabel>
            <DialogInput id="line-qty" name="qty" ref={qtyRef} inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} className="num text-center text-xl font-bold" invalid={qty === 0} />
          </div>
          <Button variant="secondary" aria-label={`${t.increase} ${step}`} className="px-0 text-[13px] font-bold" onClick={() => bump(1)}>
            <span className="num">+{inPacks ? 1 : step}</span>
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.05em] text-label">{f.batch}</p>
          {batches === null && error == null && <p className="text-muted">{f.batchesLoading}</p>}
          {error != null && <ErrorNotice error={error} />}
          <div role="radiogroup" aria-label={f.batch} className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
            {batches !== null && sorted.length === 0 && <BatchOption selected onSelect={() => setBatchId(null)} title={f.auto} detail={f.autoHint} />}
            {sorted.map((b) => (
              <BatchOption
                key={b.batch_id}
                selected={batchId === null ? b.batch_id === autoId : batchId === b.batch_id}
                disabled={b.expired}
                onSelect={() => setBatchId(b.batch_id === autoId ? null : b.batch_id)}
                title={b.batch_no}
                detail={`${t.exp} ${language === 'ur' ? ltr(formatDate(b.expiry_date, language)) : formatDate(b.expiry_date, language)} · ${stockText(b)}${b.expired ? ` · ${f.expired}` : ''}`}
                auto={b.batch_id === autoId ? f.auto : undefined}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="line-discount">{f.discount}</FieldLabel>
          <div dir="ltr" className="flex gap-2">
            <DialogInput id="line-discount" name="discount" ref={discountRef} inputMode="decimal" value={discountText} onChange={(e) => setDiscountText(e.target.value)} invalid={discount === null} className="num flex-1" />
            <SegmentedToggle<'percent' | 'rupees'>
              tone="track"
              label={`${f.percent} / ${f.rupees}`}
              value={mode}
              onChange={setMode}
              className="shrink-0 gap-0 rounded-md bg-track p-1"
              options={[
                { value: 'percent', label: f.percent },
                { value: 'rupees', label: f.rupees },
              ]}
            />
          </div>
          {discount === null ? (
            <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger-ink">
              {f.discountInvalid}
            </p>
          ) : overLimit ? (
            <p className="mt-1.5 text-[13px] font-medium text-warn-ink">{f.discountOver}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">{isOwner ? f.ownerLimit : f.staffLimit(staffMaxPercent)}</p>
          )}
        </div>

        <Actions>
          <Button variant="secondary" size="dialog" className="me-auto border-danger-line text-danger-ink" onClick={onRemove}>
            {f.remove}
          </Button>
          <Button variant="secondary" size="dialog" onClick={onClose}>
            {f.cancel}
          </Button>
          <Button type="submit" size="dialog" disabled={!valid}>
            {f.done}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

function BatchOption({ selected, disabled, onSelect, title, detail, auto }: { selected: boolean; disabled?: boolean; onSelect: () => void; title: string; detail: string; auto?: string | undefined }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-[52px] items-center gap-2.5 rounded-md px-3 py-2.5 text-start disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-2 border-accent bg-tint' : 'border border-row-line bg-card hover:bg-row-hover',
      )}
    >
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-accent' : 'border-field-line')}>
        {selected && <span className="size-2.5 rounded-full bg-accent" />}
      </span>
      <span className="num font-semibold">{title}</span>
      <span className="text-[13px] text-ink-mid">{detail}</span>
      {auto && (
        <Chip tone="ok" className="ms-auto">
          {auto}
        </Chip>
      )}
    </button>
  );
}
