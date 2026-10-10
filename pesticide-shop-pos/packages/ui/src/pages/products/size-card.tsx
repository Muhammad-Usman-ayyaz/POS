import { taxIncludedIn } from '@pos/core';
import { Lock } from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/primitives.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { isLocked, parseRupees, parseTaxPercent, type DraftProblems, type SizeDraft, type Unit } from './product-form-state.js';

interface Props {
  size: SizeDraft;
  /** 1-based position on the form. */
  number: number;
  unit: Unit;
  problems: DraftProblems['sizes'][string] | undefined;
  onChange: (patch: Partial<SizeDraft>) => void;
  onRemove: () => void;
  /** Open the "this pack size can no longer be changed" message. */
  onLockedPackSize: () => void;
}

const labelClass = 'block text-xs font-bold uppercase tracking-wider text-muted';

function FieldBox({ id, label, error, children, className }: { id: string; label: string; error?: string | undefined; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One size of a product: its label, pack size (locked once it has batches), codes, prices (tax included), tax, low-stock alert, loose sale. */
export function SizeCard({ size, number, unit, problems, onChange, onRemove, onLockedPackSize }: Props) {
  const { m, language } = useI18n();
  const f = m.productForm;
  const id = (name: string) => `${size.key}-${name}`;
  const locked = isLocked(size);
  const isNew = size.id === null;
  const unitText = f.unitShort[unit];
  const err = (key: keyof NonNullable<typeof problems>) => {
    const problem = problems?.[key];
    return problem ? (problem === 'labelRequired' ? f.problems.labelRequired : f.problems[problem]) : undefined;
  };

  // "Rs 118 includes Rs 18 tax": the price the customer pays already holds the tax. Nothing is added to it.
  const retail = parseRupees(size.retail);
  const bp = parseTaxPercent(size.taxPct);
  const taxLine = retail === null || bp === null ? null : bp === 0 ? f.noTax : f.taxInfo(formatMoney(retail, language), formatMoney(taxIncludedIn(retail, bp), language));

  return (
    <section data-size-key={size.key} aria-label={f.sizeN(number)} className={cn('rounded-lg border border-line bg-card p-6 shadow-card', !size.active && 'opacity-80')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" className="bg-row-line/60 py-0.5 text-xs">
            {f.sizeN(number)}
          </Badge>
          {isNew ? (
            <Badge tone="success" className="py-0.5 text-xs">
              {f.chipNew}
            </Badge>
          ) : size.batchCount > 0 ? (
            <Badge tone="warning" className="py-0.5 text-xs">
              {f.chipHasStock(size.batchCount)}
            </Badge>
          ) : null}
          {!size.active && (
            <Badge tone="danger" className="py-0.5 text-xs">
              {f.chipOff}
            </Badge>
          )}
        </div>
        {isNew ? (
          <Button variant="ghost" className="h-11 px-4 text-danger-ink" aria-label={f.removeLabel(number)} onClick={onRemove}>
            {f.remove}
          </Button>
        ) : (
          <Button variant="ghost" className="h-11 px-4" onClick={() => onChange({ active: !size.active })}>
            {size.active ? f.switchOff : f.switchOn}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FieldBox id={id('label')} label={f.sizeLabel} error={err('label')}>
          <Input id={id('label')} name="label" value={size.label} invalid={!!problems?.label} aria-describedby={problems?.label ? `${id('label')}-error` : undefined} onChange={(e) => onChange({ label: e.target.value })} />
        </FieldBox>

        <FieldBox id={id('pack')} label={f.packSize} error={err('packSize')}>
          {locked ? (
            <button
              type="button"
              id={id('pack')}
              aria-label={`${f.packSize}: ${size.packSize} ${unitText}. ${f.lockedHint}`}
              onClick={onLockedPackSize}
              className="lift flex h-14 w-full items-center justify-between gap-2 rounded-lg border border-warn-ink/30 bg-warn-bg px-4 text-lg text-warn-ink [@media(max-height:800px)]:h-12"
            >
              <span className="num">
                {size.packSize} {unitText}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                <Lock aria-hidden className="size-4" />
                {f.locked}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Input id={id('pack')} name="packSize" inputMode="numeric" value={size.packSize} invalid={!!problems?.packSize} aria-describedby={problems?.packSize ? `${id('pack')}-error` : undefined} onChange={(e) => onChange({ packSize: e.target.value })} className="num min-w-0" />
              <span className="shrink-0 text-base text-muted">{unitText}</span>
            </div>
          )}
        </FieldBox>

        <FieldBox id={id('sku')} label={f.sku}>
          <Input id={id('sku')} name="sku" value={size.sku} onChange={(e) => onChange({ sku: e.target.value })} className="num" />
        </FieldBox>

        <FieldBox id={id('barcode')} label={f.barcode}>
          <Input id={id('barcode')} name="barcode" value={size.barcode} placeholder={f.barcodePlaceholder} onChange={(e) => onChange({ barcode: e.target.value })} className="num" />
        </FieldBox>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FieldBox id={id('retail')} label={f.retail} error={err('retail')}>
          <PriceInput id={id('retail')} name="retail" value={size.retail} invalid={!!problems?.retail} onChange={(retailValue) => onChange({ retail: retailValue })} />
          {taxLine && !problems?.retail && <p className="num text-sm text-muted">{taxLine}</p>}
        </FieldBox>
        <FieldBox id={id('wholesale')} label={f.wholesale} error={err('wholesale')}>
          <PriceInput id={id('wholesale')} name="wholesale" value={size.wholesale} invalid={!!problems?.wholesale} onChange={(value) => onChange({ wholesale: value })} />
        </FieldBox>
        <FieldBox id={id('tax')} label={f.taxRate} error={err('tax')}>
          <Input id={id('tax')} name="tax" inputMode="decimal" value={size.taxPct} invalid={!!problems?.tax} aria-describedby={problems?.tax ? `${id('tax')}-error` : undefined} onChange={(e) => onChange({ taxPct: e.target.value })} className="num" />
        </FieldBox>
        <FieldBox id={id('min')} label={f.lowStock} error={err('minPacks')}>
          <div className="flex items-center gap-2">
            <Input id={id('min')} name="minPacks" inputMode="decimal" value={size.minPacks} placeholder="0" invalid={!!problems?.minPacks} aria-describedby={problems?.minPacks ? `${id('min')}-error` : undefined} onChange={(e) => onChange({ minPacks: e.target.value })} className="num min-w-0" />
            <span className="shrink-0 text-base text-muted">{f.packsWord}</span>
          </div>
        </FieldBox>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={labelClass}>{f.looseSale}</span>
          <label htmlFor={id('loose')} className={cn('flex min-h-14 items-center gap-3 text-lg', unit === 'piece' && 'opacity-55')}>
            <input id={id('loose')} name="loose" type="checkbox" checked={unit !== 'piece' && size.allowLoose} disabled={unit === 'piece'} onChange={(e) => onChange({ allowLoose: e.target.checked })} className="size-6 shrink-0 accent-accent" />
            <span>{f.sellBy(unitText)}</span>
          </label>
        </div>
      </div>
    </section>
  );
}

/** An amount in rupees, with "Rs" in front. The text typed is kept as typed. */
function PriceInput({ id, name, value, invalid, onChange }: { id: string; name: string; value: string; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <span aria-hidden className="num pointer-events-none absolute inset-y-0 start-4 my-auto h-fit text-lg text-muted">
        Rs
      </span>
      <Input id={id} name={name} inputMode="decimal" value={value} invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={(e) => onChange(e.target.value)} className="num ps-11" />
    </div>
  );
}
