import { ApiError, type Api, type ApprovalAction, type SaleQuoteView, type SaleView, type SessionUser } from '@pos/api-contract';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorNotice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { legacyText, packText, useI18n } from '../../i18n/index.js';
import { ApprovalDialog, OverLimitDialog, type OverLimitFacts } from './approval-dialogs.js';
import { CustomerCard, PaymentPanel } from './bill-panel.js';
import { HeldBillsDialog, ResumedDialog, SaleDoneDialog, type ResumeNote } from './bill-dialogs.js';
import { CartTable } from './cart-table.js';
import { CustomerDialog } from './customer-dialog.js';
import { cartFromResumed, customerOf, forgetSeen, holdRequest, rememberSeen, takeSeen, type HeldBill } from './held-bills.js';
import { LineDialog, type LineChanges } from './line-dialog.js';
import {
  actionsFromParams,
  addDays,
  addSize,
  approvalSubject,
  newRequestId,
  paidFromText,
  pickName,
  quoteKey,
  quoteRequest,
  removeLine,
  rupeesText,
  saleRequest,
  setBatch,
  setDiscount,
  setQty,
  stepQty,
  type BillDraft,
  type CartLine,
  type Customer,
  type PaymentMethod,
  type PriceType,
  type SizePick,
} from './pos-state.js';
import { SearchPanel } from './search-panel.js';

type Dialog =
  | null
  | { kind: 'line'; key: string; focusDiscount: boolean }
  | { kind: 'customer' }
  | { kind: 'held' }
  | { kind: 'over'; facts: OverLimitFacts }
  | { kind: 'approval'; actions: ApprovalAction[] }
  | { kind: 'resumed'; notes: ResumeNote[] }
  | { kind: 'done'; sale: SaleView; tendered: number | null; isCash: boolean };

interface QuoteState {
  key: string;
  data: SaleQuoteView;
  /** Cash handed over beyond the bill, when the typed amount was more than the total. */
  tendered: number | null;
}

const utcToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * The POS billing screen. Prices, tax, totals, the credit check and what needs the owner all come from `sale:quote` (the screen does no
 * money arithmetic). One bill has one `request_id`, kept for every try, so a double click or a retry cannot bill twice.
 *
 * Keys: F2 search, F4 customer, F6 held bills, F8 discount on the selected line, F12 complete sale.
 */
export function PosPage({ api, user, receiptActions }: { api: Api; user: SessionUser; receiptActions?: (sale: SaleView, newSale: ReactNode) => ReactNode }) {
  const { m, language } = useI18n();
  const toast = useToast();
  const t = m.pos;
  const isOwner = user.role === 'owner';

  const [query, setQuery] = useState('');
  const [priceType, setPriceType] = useState<PriceType>('retail');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paidText, setPaidText] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const heldCount = heldBills.length;

  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(newRequestId());
  const sending = useRef(false);

  // ---- the bill as one value ----
  const today = quote?.data.today ?? utcToday();
  const bill: BillDraft = useMemo(
    () => ({ customerId: customer?.id ?? null, priceType, method, reference, dueDate: customer ? dueDate || addDays(today, 30) : '' }),
    [customer, priceType, method, reference, dueDate, today],
  );
  const paid = paidFromText(paidText);
  const paidInvalid = paid === 'invalid';
  const key = quoteKey(cart, bill, paidText);
  const fresh = quote !== null && quote.key === key && quoteError == null;

  // ---- price the bill (debounced; only the latest answer is kept) ----
  const latestQuote = useRef(0);
  useEffect(() => {
    if (cart.length === 0 || paidInvalid) {
      latestQuote.current += 1;
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const mine = ++latestQuote.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const asked = paid as number | null;
          let data = await api.sale.quote(quoteRequest(cart, bill, asked));
          let tendered: number | null = null;
          // Cash handed over beyond the bill is change, not an overpayment: price the bill as paid in full.
          if (method === 'cash' && asked !== null && data.issues.some((i) => i.code === 'OVERPAID')) {
            tendered = asked;
            data = await api.sale.quote(quoteRequest(cart, bill, null));
          }
          if (latestQuote.current === mine) {
            setQuote({ key, data, tendered });
            setQuoteError(null);
          }
        } catch (e) {
          if (latestQuote.current === mine) setQuoteError(e);
        }
      })();
    }, 120);
    return () => clearTimeout(timer);
    // `key` already says everything the quote depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);

  const q = quote?.data ?? null;
  const quoteLines = q?.lines ?? [];
  const issues = fresh && q ? q.issues : [];
  const hardIssues = issues.filter((i) => i.scope === 'line' || i.scope === 'customer' || i.scope === 'payment' || i.scope === 'due_date');
  const blocker: string | null =
    cart.length === 0 ? t.bill.emptyCart : paidInvalid ? t.bill.paidInvalid : !fresh ? t.bill.checking : hardIssues.length > 0 ? t.bill.blockedBy : null;
  const effectivePaid = q?.paid_amount ?? 0;
  const change = quote?.tendered != null ? Math.max(0, quote.tendered - (q?.total ?? 0)) : 0;

  // ---- editing the bill ----
  const newBillIds = () => {
    requestId.current = newRequestId();
  };
  const resetBill = () => {
    setCart([]);
    setCustomer(null);
    setPriceType('retail');
    setPaidText(null);
    setMethod('cash');
    setReference('');
    setDueDate('');
    setSelectedKey(null);
    setQuery('');
    newBillIds();
  };

  const add = (size: SizePick) => {
    const next = addSize(cart, size);
    setCart(next);
    setSelectedKey(next.find((l) => l.productId === size.productId)?.key ?? null);
  };

  const applyLine = (lineKey: string, changes: LineChanges) => {
    setCart((c) => setBatch(setDiscount(setQty(c, lineKey, changes.qty), lineKey, changes.discount), lineKey, changes.batchId));
    setDialog(null);
  };
  const remove = (lineKey: string) => {
    setCart((c) => removeLine(c, lineKey));
    setDialog(null);
  };

  const pickCustomer = (c: Customer | null) => {
    setCustomer(c);
    if (c) setPriceType(c.defaultPriceType);
    setDialog(null);
  };

  // ---- completing the sale ----
  const send = async (token: string | undefined, creditOverride: boolean) => {
    if (sending.current || !q) return;
    sending.current = true;
    setBusy(true);
    const snapshot = { cart, bill, tendered: quote?.tendered ?? null, isCash: method === 'cash', needs: q.requires_approval, paid: q.paid_amount };
    try {
      const sale = await api.sale.create(saleRequest(snapshot.cart, snapshot.bill, snapshot.paid, { requestId: requestId.current, approvalToken: token, creditOverride }));
      resetBill();
      setDialog({ kind: 'done', sale, tendered: snapshot.tendered, isCash: snapshot.isCash });
    } catch (e) {
      // Any try with an approval spends it, so it is gone either way: the owner approves again if it is needed again.
      if (e instanceof ApiError && e.code === 'APPROVAL_REQUIRED') {
        const actions = actionsFromParams(e.params['actions']);
        setDialog({ kind: 'approval', actions: actions.length > 0 ? actions : snapshot.needs.length > 0 ? [...snapshot.needs] : ['credit_override'] });
      } else if (e instanceof ApiError && e.code === 'CREDIT_LIMIT_EXCEEDED') {
        setDialog({ kind: 'over', facts: overFacts({ limit: num(e.params['limit']), owed: num(e.params['owed']), adds: num(e.params['adds']) }) });
      } else if (e instanceof ApiError && e.code === 'APPROVAL_INVALID') {
        toast.showError(e);
        setDialog({ kind: 'approval', actions: snapshot.needs.length > 0 ? [...snapshot.needs] : ['credit_override'] });
      } else {
        toast.showError(e);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const customerName = customer ? pickName(customer.nameEn, customer.nameUr, language) : '';
  const overFacts = (p: { limit: number; owed: number; adds: number }): OverLimitFacts => ({ name: customerName, ...p });

  const complete = () => {
    if (sending.current || blocker !== null || !q) return;
    // Ask first when the shell is going to ask: no point sending a sale that must be refused. (An approval works once, so it is
    // always asked for and used at once, in `onGranted`; it is never kept for a later press.)
    if (!isOwner && q.requires_approval.length > 0) {
      if (q.requires_approval.includes('credit_override') && q.customer) {
        setDialog({ kind: 'over', facts: overFacts({ limit: q.customer.credit_limit, owed: q.customer.balance, adds: q.customer.unpaid }) });
      } else {
        setDialog({ kind: 'approval', actions: [...q.requires_approval] });
      }
      return;
    }
    if (isOwner && q.customer?.over_limit) {
      setDialog({ kind: 'over', facts: overFacts({ limit: q.customer.credit_limit, owed: q.customer.balance, adds: q.customer.unpaid }) });
      return;
    }
    void send(undefined, false);
  };

  // ---- held bills (kept in the database; every call is a channel) ----
  const refreshHeld = useCallback(async (): Promise<void> => {
    try {
      setHeldBills(await api.bills.list());
    } catch {
      // the F6 count stays as it was; opening the dialog tries again
    }
  }, [api]);
  useEffect(() => {
    void refreshHeld();
  }, [refreshHeld]);
  const openHeld = () => {
    setDialog({ kind: 'held' });
    void refreshHeld();
  };

  const holding = useRef(false);
  const hold = async () => {
    if (cart.length === 0) {
      toast.show({ tone: 'warning', title: t.held.holdFirst });
      return;
    }
    if (holding.current) return;
    holding.current = true;
    try {
      const saved = await api.bills.hold(holdRequest(cart, customer, priceType));
      // The price the cashier saw is not stored: it is kept in memory for this run, so resuming can say "price changed".
      rememberSeen(saved.id, cart, q);
      resetBill();
      toast.show({ tone: 'success', title: t.held.held });
      void refreshHeld();
    } catch (e) {
      toast.showError(e); // the bill stays on the screen
    } finally {
      holding.current = false;
    }
  };

  const resume = async (held: HeldBill) => {
    if (cart.length > 0) {
      toast.show({ tone: 'warning', title: t.held.replaceTitle, next: t.held.replaceBody });
      return;
    }
    let bill;
    try {
      // Takes the bill off hold, once: if someone else got there first this says HELD_BILL_GONE and nothing comes to the screen.
      bill = await api.bills.resume({ id: held.id });
    } catch (e) {
      toast.showError(e);
      void refreshHeld();
      return;
    }
    // From here the bill is on the screen, whatever happens next: it has left the list, so it must not be lost.
    const lines = cartFromResumed(bill, takeSeen(bill.id));
    const resumedCustomer = customerOf(bill.customer);
    setCart(lines);
    setCustomer(resumedCustomer);
    setPriceType(bill.price_type);
    setSelectedKey(lines.at(-1)?.key ?? null);
    newBillIds();
    setDialog(null);
    void refreshHeld();
    try {
      // Prices and stock are checked again: the held bill keeps the choices, not the prices.
      const repriced = await api.sale.quote(
        quoteRequest(lines, { customerId: resumedCustomer?.id ?? null, priceType: bill.price_type, method: 'cash', reference: '', dueDate: '' }, null),
      );
      const gone = new Set(repriced.issues.filter((i) => i.scope === 'line' && i.line_index !== undefined).map((i) => i.line_index as number));
      const notes: ResumeNote[] = [];
      const price = new Map(repriced.lines.map((l) => [l.product_id, l.unit_price]));
      const batchNow = new Map(repriced.lines.map((l) => [l.product_id, l.batches[0] ? { no: l.batches[0].batch_no, expiry: l.batches[0].expiry_date } : null]));
      const kept: CartLine[] = [];
      lines.forEach((line, index) => {
        const name = `${legacyText(m, pickName(line.nameEn, line.nameUr, language))}${packText(m, language, line.baseUnit, line.packSize) ? ` ${packText(m, language, line.baseUnit, line.packSize)}` : ''}`;
        if (gone.has(index)) {
          notes.push({ kind: 'removed', name });
          return;
        }
        const now = price.get(line.productId) ?? null;
        // Only when this run remembers what the cashier saw (a bill held before a restart has no remembered price, and says nothing about it).
        if (now !== null && line.seenPrice !== null && line.seenPrice !== now) notes.push({ kind: 'price', name, from: line.seenPrice, to: now });
        // The batch the bill would take now is not the one it was holding (it ran out or went past its date): say so. A batch picked by hand that is gone is a removed line, above.
        const batch = batchNow.get(line.productId) ?? null;
        if (batch && line.seenBatch && !line.batchId && line.seenBatch.no !== batch.no) {
          notes.push({ kind: 'batch', name, fromBatch: line.seenBatch.no, toBatch: batch.no, expired: line.seenBatch.expiry < repriced.today });
        }
        kept.push({ ...line, seenPrice: now, seenBatch: batch });
      });
      setCart(kept);
      setSelectedKey(kept.at(-1)?.key ?? null);
      if (notes.length > 0) setDialog({ kind: 'resumed', notes });
    } catch {
      // The quote is not available right now. The bill is on the screen, and the screen's own quote shows the problem and blocks the sale.
    }
  };

  const discardHeld = async (held: HeldBill) => {
    try {
      await api.bills.discard({ id: held.id });
      forgetSeen(held.id);
    } catch (e) {
      toast.showError(e);
    }
    void refreshHeld();
  };

  // ---- the keyboard ----
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const openHeldRef = useRef(openHeld);
  openHeldRef.current = openHeld;
  const selected = cart.find((l) => l.key === selectedKey) ?? cart.at(-1);
  const keyState = useRef({ selected, open: dialog !== null });
  keyState.current = { selected, open: dialog !== null };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (keyState.current.open) return;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };
      switch (event.key) {
        case 'F2':
          return run(() => searchRef.current?.focus());
        case 'F4':
          return run(() => setDialog({ kind: 'customer' }));
        case 'F6':
          return run(() => openHeldRef.current());
        case 'F8':
          return run(() => {
            const line = keyState.current.selected;
            if (line) setDialog({ kind: 'line', key: line.key, focusDiscount: true });
          });
        case 'F12':
          return run(() => completeRef.current());
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const editing = dialog?.kind === 'line' ? cart.find((l) => l.key === dialog.key) : undefined;
  const inCart = useMemo(() => new Set(cart.map((l) => l.productId)), [cart]);
  const otherIssues = issues.filter((i) => i.scope === 'customer' || i.scope === 'due_date');
  const closeDialog = useCallback(() => setDialog(null), []);
  const heldTitle = heldCount > 0 ? [...new Set(heldBills.map((b) => b.held_by_name))].join(', ') : undefined;

  return (
    <div data-page="pos" className="flex h-full min-h-0 gap-4 text-[15px] max-[1100px]:flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <SearchPanel api={api} inputRef={searchRef} query={query} onQuery={setQuery} priceType={priceType} onPriceType={setPriceType} inCart={inCart} onAdd={add} />
        {quoteError != null && <ErrorNotice error={quoteError} />}
        {otherIssues.map((i, n) => (
          <ErrorNotice key={n} error={new ApiError(i.code, i.message, i.params)} />
        ))}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-card shadow-card" aria-label={t.cols.product}>
          <CartTable
            cart={cart}
            quoteLines={quoteLines}
            issues={issues}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
            onStep={(k, d) => setCart((c) => stepQty(c, k, d))}
            onEdit={(k) => setDialog({ kind: 'line', key: k, focusDiscount: false })}
            onRemove={(k) => remove(k)}
            staffLimit={!isOwner}
            needsOwner={q?.requires_approval.includes('discount_override') ?? false}
          />
          <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-row-line bg-foot px-4 py-2 text-xs text-label">
            <Shortcut k="F2" label={t.shortcuts.search} />
            <Shortcut k="F4" label={t.shortcuts.customer} />
            <Shortcut k="F8" label={t.shortcuts.discount} />
            <Shortcut k="F12" label={t.shortcuts.complete} />
            {/* 44px to press, drawn over the strip's own padding so the strip keeps the design's height */}
            <Button variant="ghost" className="-my-[13px] ms-auto min-h-11 px-3 text-xs" onClick={openHeld} title={heldTitle}>
              <span className="num font-bold">F6</span> {t.shortcuts.held}
              {heldCount > 0 && <span className="num rounded-full bg-tint px-2 text-accent">{heldCount}</span>}
            </Button>
          </footer>
        </section>
      </div>

      <aside className="flex min-h-0 w-[340px] shrink-0 flex-col gap-3 max-[1100px]:w-full">
        <CustomerCard customer={customer} priceType={priceType} quote={q} onChange={() => setDialog({ kind: 'customer' })} />
        <PaymentPanel
          quote={q}
          fresh={fresh}
          lines={cart.length}
          hasCustomer={customer !== null}
          paidText={paidText}
          onPaidText={setPaidText}
          paidInvalid={paidInvalid}
          method={method}
          onMethod={setMethod}
          reference={reference}
          onReference={setReference}
          dueDate={bill.dueDate}
          onDueDate={setDueDate}
          today={today}
          change={change}
          blocker={blocker}
          busy={busy}
          onComplete={complete}
          onHold={() => void hold()}
          onClear={resetBill}
        />
      </aside>

      {dialog?.kind === 'line' && editing && (
        <LineDialog
          api={api}
          line={editing}
          quoteLine={quoteLines.find((l) => l.product_id === editing.productId)}
          staffMaxPercent={q?.staff_max_discount_percent ?? 0}
          isOwner={isOwner}
          focusDiscount={dialog.focusDiscount}
          onApply={(changes) => applyLine(editing.key, changes)}
          onRemove={() => remove(editing.key)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'customer' && <CustomerDialog api={api} current={customer} onPick={pickCustomer} onClose={closeDialog} />}
      {dialog?.kind === 'held' && (
        <HeldBillsDialog
          bills={heldBills}
          onResume={(b) => void resume(b)}
          onDiscard={(b) => void discardHeld(b)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'over' && (
        <OverLimitDialog
          facts={dialog.facts}
          isOwner={isOwner}
          onTakeMore={(amount) => {
            setPaidText(rupeesText(effectivePaid + amount));
            setDialog(null);
          }}
          onAsk={() => setDialog({ kind: 'approval', actions: q && q.requires_approval.length > 0 ? [...q.requires_approval] : ['credit_override'] })}
          onAllow={() => {
            setDialog(null);
            void send(undefined, true);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'approval' && (
        <ApprovalDialog
          api={api}
          actions={dialog.actions}
          subject={approvalSubject(cart, bill, effectivePaid)}
          overLimit={q?.customer && q.requires_approval.includes('credit_override') ? { after: q.customer.after_sale, limit: q.customer.credit_limit } : undefined}
          onGranted={(token) => {
            setDialog(null);
            // The approval is for exactly this bill: send it now, with the approval, once.
            void send(token, false);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'resumed' && <ResumedDialog notes={dialog.notes} onClose={closeDialog} />}
      {dialog?.kind === 'done' && (
        <SaleDoneDialog
          sale={dialog.sale}
          tendered={dialog.tendered}
          isCash={dialog.isCash}
          receiptActions={receiptActions}
          onNewSale={() => {
            setDialog(null);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
        />
      )}
    </div>
  );
}

function Shortcut({ k, label }: { k: string; label: string }) {
  return (
    <span>
      <b className="num">{k}</b> {label}
    </span>
  );
}

