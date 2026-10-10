import type { CatalogueList, ListedCategory } from '@pos/api-contract';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button.js';
import { Badge, Num } from '../../components/ui/primitives.js';
import { formatDate, formatMoney, formatQty, useI18n, type Messages } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { dash, formatRange, withoutIsolates, formatTaxRate, formatTotal, minInPacks } from './catalogue-format.js';

type Group = CatalogueList['hits'][number];
type Size = Group['sizes'][number];

interface Props {
  groups: Group[];
  isOwner: boolean;
  expanded: ReadonlySet<string>;
  onToggle: (groupId: string) => void;
  categories: ReadonlyMap<string, ListedCategory>;
}

const th = 'px-2 py-3 text-start text-xs font-bold uppercase tracking-wider text-muted';
/** A badge in a narrow column may need two lines; a pill that wraps looks like a blob, so it gets a softer shape. */
const WRAPPING_BADGE = 'rounded-xl leading-snug';
const td = 'px-2 py-3.5 align-middle';

/** The product table. Staff get the same table without the Cost and Actions columns. */
export function CatalogueTable({ groups, isOwner, expanded, onToggle, categories }: Props) {
  const { m } = useI18n();
  const c = m.products.columns;
  // The cost, retail, wholesale and tax columns: a product row says its retail range across all of them.
  const priceColumns = isOwner ? 4 : 3;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
      <table className="w-full table-fixed border-collapse text-base">
        <colgroup>
          {(isOwner ? [5, 18, 9, 11, 10, 10, 9, 5, 14, 9] : [5, 25, 12, 14, 11, 11, 6, 16]).map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead className="bg-thead">
          <tr>
            <th className={th} aria-label="" />
            <th className={th}>{c.product}</th>
            <th className={th}>{c.category}</th>
            <th className={th}>{c.stock}</th>
            {isOwner && <th className={cn(th, 'text-end')}>{c.cost}</th>}
            <PriceHead label={c.retail} note={m.products.inclTax} />
            <PriceHead label={c.wholesale} note={m.products.inclTax} />
            <th className={cn(th, 'text-end')}>{c.tax}</th>
            <th className={th}>{c.nextExpiry}</th>
            {isOwner && <th className={th}>{c.actions}</th>}
          </tr>
        </thead>
        {groups.map((entry, index) => {
          const open = expanded.has(entry.group.id);
          return (
            <tbody key={entry.group.id} data-group={entry.group.id} className="stagger border-t border-row-line" style={{ '--i': Math.min(index, 12) } as React.CSSProperties}>
              <GroupRow entry={entry} open={open} onToggle={onToggle} isOwner={isOwner} priceColumns={priceColumns} category={entry.group.category_id ? categories.get(entry.group.category_id) : undefined} />
              {open && entry.sizes.map((size) => <SizeRow key={size.id} size={size} isOwner={isOwner} />)}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function PriceHead({ label, note }: { label: string; note: string }) {
  return (
    <th className={cn(th, 'text-end')}>
      {label}
      <span className="block text-[11px] font-medium normal-case tracking-normal">{note}</span>
    </th>
  );
}

/**
 * A number with a unit or a month NAME in it ("14 packs", "15 Aug 2028"). In English it is kept left to right like every
 * number; in Urdu it has Urdu words in it, so it follows the right-to-left order. (Forcing it left to right scrambles it.)
 */
function Words({ children }: { children: string }) {
  const { language } = useI18n();
  return language === 'ur' ? <span>{children}</span> : <Num>{children}</Num>;
}

/** The name in the current language first, the other language small underneath. */
function pick(language: 'en' | 'ur', en: string | null, ur: string | null): { main: string; other: string | null } {
  const main = language === 'ur' ? (ur ?? en) : (en ?? ur);
  const other = language === 'ur' ? (ur ? en : null) : en ? ur : null;
  return { main: main ?? dash, other };
}

function GroupRow({ entry, open, onToggle, isOwner, priceColumns, category }: { entry: Group; open: boolean; onToggle: (id: string) => void; isOwner: boolean; priceColumns: number; category: ListedCategory | undefined }) {
  const { m, language } = useI18n();
  const { group, summary } = entry;
  const name = pick(language, group.name_en, group.name_ur);
  const categoryName = category ? pick(language, category.name_en, category.name_ur).main : dash;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <tr className="bg-card hover:bg-row-hover">
      <td className="px-0 py-3.5 text-center align-middle">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? m.products.hideSizes(name.main) : m.products.showSizes(name.main)}
          onClick={() => onToggle(group.id)}
          className="lift inline-grid size-11 place-items-center rounded-md text-ink hover:bg-tint"
        >
          <Chevron aria-hidden className={cn('size-5', !open && 'rtl:-scale-x-100')} />
        </button>
      </td>
      <td className={cn(td, 'min-w-0')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words text-lg font-bold">{name.main}</span>
          <Badge tone="neutral" className="bg-row-line/60 py-0.5 text-xs">
            {m.products.sizes(summary.size_count)}
          </Badge>
        </div>
        {name.other && <p className="break-words text-sm text-muted">{name.other}</p>}
      </td>
      <td className={cn(td, 'break-words')}>{categoryName}</td>
      <td className={cn(td, 'font-bold')}>
        <Words>{formatTotal(summary.stock_total, summary.base_unit, m.products)}</Words>
      </td>
      <td className={cn(td, 'text-end')} colSpan={priceColumns}>
        <span className="block text-xs font-medium text-muted">{m.products.retailRange}</span>
        <Num>{formatRange(summary.retail_min, summary.retail_max, language)}</Num>
      </td>
      <td className={td}>
        <div className="flex flex-wrap gap-1.5">
          {summary.expired_sizes > 0 && <Badge tone="danger" className={WRAPPING_BADGE}>{m.products.groupExpired(summary.expired_sizes)}</Badge>}
          {summary.low_sizes > 0 && <Badge tone="warning" className={WRAPPING_BADGE}>{m.products.groupLow(summary.low_sizes)}</Badge>}
          {summary.near_expiry_sizes > 0 && <Badge tone="warning" className={WRAPPING_BADGE}>{m.products.groupNear(summary.near_expiry_sizes)}</Badge>}
        </div>
      </td>
      {isOwner && (
        <td className={td}>
          <Button asChild variant="secondary" className="h-11 px-4">
            <Link to={`/products/${group.id}/edit`} aria-label={m.products.editLabel(name.main)}>
              {m.products.edit}
            </Link>
          </Button>
        </td>
      )}
    </tr>
  );
}

function SizeRow({ size, isOwner }: { size: Size; isOwner: boolean }) {
  const { m, language } = useI18n();
  const money = (paisa: number) => <Num className="whitespace-nowrap">{formatMoney(paisa, language)}</Num>;
  return (
    <tr data-size={size.id} className="bg-page/60">
      <td className={td} />
      <td className={cn(td, 'min-w-0')}>
        <span dir="auto" className="block break-words border-s-[3px] border-tint ps-3 text-lg font-semibold">{size.pack_label === '' ? m.products.singleSize : size.pack_label}</span>
      </td>
      <td className={td} />
      <td className={cn(td, 'font-semibold')}>
        <Words>{withoutIsolates(formatQty(size.stock_total, size.pack_size, language))}</Words>
      </td>
      {isOwner && <td className={cn(td, 'text-end')}>{size.cost_price == null ? dash : money(size.cost_price)}</td>}
      <td className={cn(td, 'text-end')}>{money(size.retail_price)}</td>
      <td className={cn(td, 'text-end')}>{money(size.wholesale_price)}</td>
      <td className={cn(td, 'text-end')}>
        <Num>{formatTaxRate(size.tax_rate_bp)}</Num>
      </td>
      <td className={td}>
        <p>{size.next_expiry ? <Num>{formatDate(size.next_expiry, language)}</Num> : dash}</p>
        <SizeBadges size={size} m={m} />
      </td>
      {isOwner && <td className={td} />}
    </tr>
  );
}

function SizeBadges({ size, m }: { size: Size; m: Messages }) {
  const { flags } = size;
  if (!flags.low && !flags.near_expiry && !flags.expired) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {flags.expired && <Badge tone="danger">{m.products.badgeExpired}</Badge>}
      {flags.low && (
        <Badge tone="warning" pulse>
          {m.products.badgeLow(minInPacks(size.min_stock, size.pack_size))}
        </Badge>
      )}
      {flags.near_expiry && <Badge tone="warning">{m.products.badgeNearExpiry}</Badge>}
    </div>
  );
}
