import type { SaleView } from '@pos/api-contract';
import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { formatMoney, ltr, useI18n } from '../../i18n/index.js';

/** Keeps a code, number or time left to right inside Urdu text; English text is left alone. */
const isolate = (text: string, language: string): string => (language === 'ur' ? ltr(text) : text);
import { Actions } from './counter-ui.js';
import type { HeldBill } from './held-bills.js';
import { pickName } from './pos-state.js';

/** Held bills (F6): bills set aside. Resume brings one back to the screen (and prices are checked again), the cross discards it. */
export function HeldBillsDialog({ bills, onResume, onDiscard, onClose }: { bills: readonly HeldBill[]; onResume: (bill: HeldBill) => void; onDiscard: (bill: HeldBill) => void; onClose: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.held;
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <Dialog counter open title={t.title} eyebrow="F6" lead={t.lead} onClose={onClose}>
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {bills.map((b) => (
          <li key={b.id} data-held={b.id} className="flex min-h-16 items-center justify-between gap-2.5 rounded-md border border-row-line px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{b.customer ? pickName(b.customer.nameEn, b.customer.nameUr, language) : t.walkIn}</p>
              <p className="truncate text-[13px] text-muted">
                {t.items(b.lines.length)} · {t.heldBy(b.heldByName, isolate(time(b.heldAt), language))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="border-0 bg-tint text-[15px] font-bold text-accent-dark hover:bg-tint" onClick={() => onResume(b)}>
                {t.resume}
              </Button>
              <button type="button" aria-label={t.discard} title={t.discard} onClick={() => onDiscard(b)} className="lift grid size-11 place-items-center rounded-sm border border-danger-line bg-card text-danger-ink">
                ×
              </button>
            </div>
          </li>
        ))}
        {bills.length === 0 && <li className="px-2 py-3 text-muted">{t.none}</li>}
      </ul>
      <p className="text-[13px] text-muted">{t.localNote}</p>
      <Actions>
        <Button variant="secondary" size="dialog" onClick={onClose}>
          {t.close}
        </Button>
      </Actions>
    </Dialog>
  );
}

export interface ResumeNote {
  kind: 'price' | 'removed' | 'batch';
  name: string;
  from?: number;
  to?: number;
  /** For a changed batch: the batch number it was and the one it is now, and whether the old one is past its expiry date. */
  fromBatch?: string;
  toBatch?: string;
  expired?: boolean;
}

/** What changed when a held bill was priced and checked again: a different price or batch, or a line that can no longer be sold. */
export function ResumedDialog({ notes, onClose }: { notes: readonly ResumeNote[]; onClose: () => void }) {
  const { m, language } = useI18n();
  const t = m.pos.resumed;
  const heading = (n: ResumeNote) => (n.kind === 'price' ? t.priceChanged : n.kind === 'batch' ? t.batchChanged : t.removed);
  const line = (n: ResumeNote) =>
    n.kind === 'price'
      ? t.priceLine(n.name, formatMoney(n.from ?? 0, language), formatMoney(n.to ?? 0, language))
      : n.kind === 'batch'
        ? t.batchLine(n.name, isolate(n.fromBatch ?? '', language), isolate(n.toBatch ?? '', language), n.expired === true)
        : t.removedLine(n.name);
  return (
    <Dialog counter open title={t.title} eyebrow="F6" lead={t.lead} onClose={onClose}>
      <ul className="flex flex-col gap-2">
        {notes.map((n, i) => (
          <li key={i} data-note={n.kind} className={n.kind === 'removed' ? 'rounded-md bg-danger-bg px-3.5 py-3 text-sm text-danger-ink' : 'rounded-md bg-warn-bg px-3.5 py-3 text-sm text-warn-deep'}>
            <p className="font-bold">{heading(n)}</p>
            <p>{line(n)}</p>
          </li>
        ))}
      </ul>
      <Actions>
        <Button size="dialog" onClick={onClose}>
          {t.gotIt}
        </Button>
      </Actions>
    </Dialog>
  );
}

/**
 * After Complete sale: the total, the cash received and the change due (change is only shown here, never saved), and a button for the next sale.
 * `receiptActions` gets the saved sale and the "New sale" button, and puts its own buttons around it (Save PDF, New sale, Print receipt).
 */
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
  /** Where printing plugs in (Save PDF, Print receipt), given the saved sale and the New sale button to place between them. */
  receiptActions?: ((sale: SaleView, newSale: ReactNode) => ReactNode) | undefined;
}) {
  const { m, language } = useI18n();
  const t = m.pos.done;
  const { invoice } = sale;
  const money = (n: number) => formatMoney(n, language);
  const received = tendered ?? invoice.paid_amount;
  const change = tendered !== null ? Math.max(0, tendered - invoice.paid_amount) : 0;
  const onKhata = invoice.total - invoice.paid_amount;
  // Without printing, New sale is the main button; with it, New sale is the quiet one between Save PDF and Print receipt (as in the design).
  const newSale = (
    <Button key="new-sale" variant={receiptActions ? 'secondary' : 'primary'} size="dialog" onClick={onNewSale}>
      {t.newSale}
    </Button>
  );
  return (
    <Dialog counter open title={t.title} eyebrow={t.eyebrow} lead={t.invoice(isolate(invoice.invoice_no, language))} onClose={onNewSale}>
      {sale.replayed && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">{t.replayed}</p>}
      <dl className="flex flex-col gap-2 rounded-md bg-tint-soft p-4">
        <div className="flex justify-between gap-3 font-bold">
          <dt className="text-muted">{t.total}</dt>
          <dd data-done-total className="num">
            {money(invoice.total)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{isCash ? t.received : t.paid}</dt>
          <dd className="num">{money(received)}</dd>
        </div>
        {onKhata > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t.onKhata}</dt>
            <dd className="num">{money(onKhata)}</dd>
          </div>
        )}
        {tendered !== null && (
          <div className="flex items-baseline justify-between gap-3 border-t border-sum-line pt-2.5">
            <dt className="font-bold">{t.changeDue}</dt>
            <dd data-change-due className="num pop-once text-4xl font-bold text-accent">
              {money(change)}
            </dd>
          </div>
        )}
      </dl>
      {tendered !== null && <p className="text-[13px] text-muted">{t.note}</p>}
      <Actions>{receiptActions ? receiptActions(sale, newSale) : newSale}</Actions>
    </Dialog>
  );
}
