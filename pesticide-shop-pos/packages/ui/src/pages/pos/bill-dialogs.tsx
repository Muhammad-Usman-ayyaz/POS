import type { SaleView } from '@pos/api-contract';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import type { HeldBill } from './held-bills.js';
import { pickName } from './pos-state.js';

/** Held bills (F6): bills set aside. Resume brings one back to the screen (and prices are checked again), the cross discards it. */
export function HeldBillsDialog({ bills, onResume, onDiscard, onClose }: { bills: readonly HeldBill[]; onResume: (bill: HeldBill) => void; onDiscard: (bill: HeldBill) => void; onClose: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.held;
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <Dialog open title={t.title} onClose={onClose}>
      <p className="mt-1 text-muted">{t.lead}</p>
      <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
        {bills.map((b) => (
          <li key={b.id} data-held={b.id} className="flex items-center gap-3 rounded-md border border-line px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{b.customer ? pickName(b.customer.nameEn, b.customer.nameUr, language) : t.walkIn}</p>
              <p className="truncate text-sm text-muted">
                {t.items(b.lines.length)} · {t.heldBy(b.heldByName, time(b.heldAt))}
              </p>
            </div>
            <Button variant="secondary" className="bg-tint text-accent" onClick={() => onResume(b)}>
              {t.resume}
            </Button>
            <button type="button" aria-label={t.discard} title={t.discard} onClick={() => onDiscard(b)} className="lift grid size-11 place-items-center rounded-md border border-danger-ink/30 text-danger-ink">
              ×
            </button>
          </li>
        ))}
        {bills.length === 0 && <li className="px-2 py-3 text-muted">{t.none}</li>}
      </ul>
      <p className="mt-3 text-sm text-muted">{t.localNote}</p>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t.close}
        </Button>
      </div>
    </Dialog>
  );
}

export interface ResumeNote {
  kind: 'price' | 'removed';
  name: string;
  from?: number;
  to?: number;
}

/** What changed when a held bill was priced and checked again: a different price, or a line that can no longer be sold. */
export function ResumedDialog({ notes, onClose }: { notes: readonly ResumeNote[]; onClose: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.resumed;
  return (
    <Dialog open title={t.title} onClose={onClose}>
      <p className="mt-1 text-muted">{t.lead}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {notes.map((n, i) => (
          <li key={i} data-note={n.kind} className={n.kind === 'price' ? 'rounded-md bg-warn-bg px-4 py-3 text-warn-ink' : 'rounded-md bg-danger-bg px-4 py-3 text-danger-ink'}>
            <p className="font-bold">{n.kind === 'price' ? t.priceChanged : t.removed}</p>
            <p>{n.kind === 'price' ? t.priceLine(n.name, formatMoney(n.from ?? 0, language), formatMoney(n.to ?? 0, language)) : t.removedLine(n.name)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>{t.gotIt}</Button>
      </div>
    </Dialog>
  );
}

/** After Complete sale: the total, the cash received and the change due (change is only shown here, never saved), and a button for the next sale. */
export function SaleDoneDialog({
  sale,
  tendered,
  isCash,
  onNewSale,
  receiptActions,
}: {
  sale: SaleView;
  /** The cash the customer handed over, when it was more than the bill. Only ever set for a cash sale (the screen prices change for cash alone). */
  tendered: number | null;
  isCash: boolean;
  onNewSale: () => void;
  /** Where printing plugs in (Print receipt, Save PDF), given the saved sale. */
  receiptActions?: ((sale: SaleView) => ReactNode) | undefined;
}) {
  const { m, language } = useI18n();
  const t = m.pos.done;
  const { invoice } = sale;
  const money = (n: number) => formatMoney(n, language);
  const received = tendered ?? invoice.paid_amount;
  const change = tendered !== null ? Math.max(0, tendered - invoice.paid_amount) : 0;
  const onKhata = invoice.total - invoice.paid_amount;
  return (
    <Dialog open title={t.title} onClose={onNewSale}>
      <p className="-mt-1 text-sm font-semibold text-muted">{t.eyebrow}</p>
      <p className="mt-1 text-muted">{t.invoice(invoice.invoice_no)}</p>
      {sale.replayed && <p className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">{t.replayed}</p>}
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg bg-tint-soft p-5">
        <dt className="font-semibold text-muted">{t.total}</dt>
        <dd data-done-total className="num text-end font-bold">{money(invoice.total)}</dd>
        <dt className="text-muted">{isCash ? t.received : t.paid}</dt>
        <dd className="num text-end">{money(received)}</dd>
        {onKhata > 0 && (
          <>
            <dt className="text-muted">{t.onKhata}</dt>
            <dd className="num text-end">{money(onKhata)}</dd>
          </>
        )}
        {tendered !== null && (
          <>
            <dt className="mt-3 self-end font-semibold">{t.changeDue}</dt>
            <dd data-change-due className="num mt-3 text-end text-4xl font-bold text-accent">
              {money(change)}
            </dd>
          </>
        )}
      </dl>
      {tendered !== null && <p className="mt-3 text-sm text-muted">{t.note}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        {receiptActions?.(sale)}
        <Button onClick={onNewSale}>{t.newSale}</Button>
      </div>
    </Dialog>
  );
}
