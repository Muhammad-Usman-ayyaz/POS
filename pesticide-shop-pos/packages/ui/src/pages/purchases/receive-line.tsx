import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.js';
import { DateField } from '../../components/ui/date-field.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/primitives.js';
import { errorText, formatDate, formatMoney, legacyText, ltr, packText, unitName, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { checkLine, lineTotal, type Clash, type LineDraft } from './receive-state.js';

export type LineField = 'batchNo' | 'expiry' | 'packs' | 'cost';

/** The columns of a line: product, batch, expiry, packs, cost, total, remove. The header row uses the same template. */
export const LINE_COLUMNS = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_2.75rem]';

interface Props {
  line: LineDraft;
  clash: Clash | null;
  /** The fields that were left or typed in, so empty ones are not shouted at before the person got to them. */
  touched: ReadonlySet<string>;
  /** A new batch number was filled in for the person: say so until they change it. */
  hinted: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onTouch: (field: LineField) => void;
  onRemove: () => void;
  onUseExpiry: (date: string) => void;
  onNewBatchNumber: () => void;
}

export function ReceiveLine({ line, clash, touched, hinted, onChange, onTouch, onRemove, onUseExpiry, onNewBatchNumber }: Props) {
  const { m, language } = useI18n();
  const f = m.receive;
  const id = (name: string) => `${line.key}-${name}`;
  const problems = checkLine(line);
  const shown = (field: LineField) => (touched.has(`${line.key}.${field}`) ? problems[field] : undefined);
  const name = legacyText(m, (language === 'ur' ? (line.nameUr ?? line.nameEn) : (line.nameEn ?? line.nameUr)) ?? '');
  const sizeText = packText(m, language, line.baseUnit, line.packSize);
  const flagged = clash !== null;
  const [expiryNotADate, setExpiryNotADate] = useState(false); // the box holds text that is not a date: DateField says so itself
  // When a clash appears, bring it into view: the totals bar at the bottom of the screen can cover it.
  const panel = useRef<HTMLDivElement>(null);
  const hasClash = clash !== null;
  useEffect(() => {
    if (hasClash) panel.current?.scrollIntoView?.({ block: 'nearest' });
  }, [hasClash]);
  const date = (iso: string) => (language === 'ur' ? ltr(formatDate(iso, language)) : formatDate(iso, language));

  const field = (key: LineField, label: string, input: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id(key)} className="sr-only">
        {`${label} · ${name} ${sizeText}`.trim()}
      </label>
      {input}
      {shown(key) && !(key === 'expiry' && expiryNotADate) ? (
        <p id={`${id(key)}-error`} role="alert" className="text-sm font-medium text-danger-ink">
          {f.problems[shown(key)!]}
        </p>
      ) : null}
    </div>
  );

  const inputClass = (invalid: boolean) => cn(flagged && 'border-warn-ink/50 bg-warn-bg/40', invalid && 'border-danger-ink');

  return (
    <div data-line={line.key} className={cn('border-t border-row-line px-6 py-4', flagged && 'bg-warn-bg/25')}>
      <div className={cn('grid items-start gap-3', LINE_COLUMNS)}>
        <div className="min-w-0 pt-3">
          <p className="break-words text-lg font-bold">{name}</p>
          {sizeText !== '' && (
            <Badge tone="neutral" dir="auto" className="mt-1 bg-row-line/60 py-0.5 text-xs">
              {sizeText}
            </Badge>
          )}
        </div>

        {field(
          'batchNo',
          f.columns.batch,
          <Input id={id('batchNo')} name="batchNo" dir="auto" value={line.batchNo} invalid={!!shown('batchNo')} onBlur={() => onTouch('batchNo')} onChange={(e) => onChange({ batchNo: e.target.value })} className={inputClass(!!shown('batchNo'))} />,
        )}

        {field(
          'expiry',
          f.columns.expiry,
          <DateField
            id={id('expiry')}
            name="expiry"
            value={line.expiry}
            invalid={!!shown('expiry')}
            aria-describedby={shown('expiry') && !expiryNotADate ? `${id('expiry')}-error` : undefined}
            onBlur={() => onTouch('expiry')}
            onChange={(expiry) => onChange({ expiry })}
            onTextInvalid={setExpiryNotADate}
            wrapperClassName="w-full"
            className={cn('h-14 w-full rounded-lg border-field-line px-4 text-lg font-normal text-ink [@media(max-height:800px)]:h-12', flagged && 'border-warn-ink/50 bg-warn-bg/40')}
          />,
        )}

        {field(
          'packs',
          f.columns.packs,
          <>
            <Input id={id('packs')} name="packs" inputMode={line.by === 'packs' ? 'numeric' : 'decimal'} value={line.packs} invalid={!!shown('packs')} onBlur={() => onTouch('packs')} onChange={(e) => onChange({ packs: e.target.value })} className={cn('num text-end', inputClass(!!shown('packs')))} />
            {line.allowLoose && (
              <select aria-label={`${f.columns.packs} · ${name} ${sizeText}`.trim()} name="by" value={line.by} onChange={(e) => onChange({ by: e.target.value as 'packs' | 'amount' })} className="h-11 rounded-md border border-field-line bg-card px-2 text-sm">
                <option value="packs">{m.units.packs}</option>
                <option value="amount">{unitName(m, line.baseUnit, 2)}</option>
              </select>
            )}
          </>,
        )}

        {field(
          'cost',
          f.columns.cost,
          <div className="relative">
            <span aria-hidden className="num pointer-events-none absolute inset-y-0 start-3 my-auto h-fit text-base text-muted">
              Rs
            </span>
            <Input id={id('cost')} name="cost" inputMode="decimal" value={line.cost} invalid={!!shown('cost')} onBlur={() => onTouch('cost')} onChange={(e) => onChange({ cost: e.target.value })} className={cn('num ps-10 text-end', inputClass(!!shown('cost')))} />
          </div>,
        )}

        <p className="num pt-3 text-end text-lg font-bold" aria-label={f.columns.total}>
          {formatMoney(lineTotal(line), language)}
        </p>

        <Button variant="ghost" className="size-11 min-w-11 px-0 text-danger-ink" aria-label={f.removeLine(`${name} ${sizeText}`.trim())} onClick={onRemove}>
          <X aria-hidden className="size-5" />
        </Button>
      </div>

      {hinted && !clash && (
        <p className="mt-2 text-sm text-muted" role="status">
          {f.clash.newBatchHint}
        </p>
      )}

      {clash && (
        <div ref={panel} role="group" aria-label={`${name} ${sizeText}`.trim()} className="mt-3 flex scroll-mb-44 flex-wrap items-center justify-between gap-4 rounded-lg border border-warn-ink/30 bg-warn-bg px-4 py-3 text-warn-ink">
          <div className="min-w-0 flex-1 basis-80">
            {clash.kind === 'duplicate' ? (
              <>
                <p className="font-bold">{errorText('DUPLICATE_LINE', {}, language).title}</p>
                <p className="mt-1 text-sm">{errorText('DUPLICATE_LINE', {}, language).next}</p>
              </>
            ) : clash.kind === 'expiry' ? (
              <>
                <p className="font-bold">{f.clash.expiryTitle(clash.batchNo)}</p>
                <p className="mt-1 text-sm">{f.clash.expiryBody(clash.batchNo, date(clash.existingExpiry), date(clash.typedExpiry))}</p>
              </>
            ) : (
              <>
                <p className="font-bold">{f.clash.costTitle(clash.batchNo)}</p>
                <p className="mt-1 text-sm">{f.clash.costBody(formatMoney(clash.existingCost, language), formatMoney(clash.typedCost, language))}</p>
              </>
            )}
          </div>
          {clash.kind !== 'duplicate' && (
            <div className="flex flex-wrap gap-3">
              {clash.kind === 'expiry' && (
                <Button variant="secondary" onClick={() => onUseExpiry(clash.existingExpiry)}>
                  {f.clash.useExpiry(date(clash.existingExpiry))}
                </Button>
              )}
              <Button onClick={onNewBatchNumber}>{f.clash.newBatch}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
