import { ApiError, type Api, type ListedSupplier, type SessionUser } from '@pos/api-contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ErrorNotice, useToast } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { DateField } from '../../components/ui/date-field.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { cn } from '../../lib/cn.js';
import { PickWithQuickAdd } from '../products/product-form-page.js';
import { ProductPicker, type PickedSize } from './product-picker.js';
import { LINE_COLUMNS, ReceiveLine, type LineField } from './receive-line.js';
import {
  blockerOf,
  buildReceiveRequest,
  checkHeader,
  findClashes,
  newLineKey,
  nextFreeBatchNo,
  takenBatchNumbers,
  todayText,
  totalsOf,
  type ExistingBatch,
  type LineDraft,
} from './receive-state.js';

/**
 * Receive stock: what arrived from a supplier. Owner only (staff are sent to Purchases, and the shell refuses their call anyway).
 * Each line becomes a batch. A batch number that already exists for the size with another expiry or cost is a clash, shown on the
 * line and settled there; the Receive button stays off until none is left. It is always paid in full, and there is no draft.
 */
export function ReceiveStockPage({ api, user }: { api: Api; user: SessionUser }) {
  if (user.role !== 'owner') return <Navigate to="/purchases" replace />;
  return <OwnerReceive api={api} />;
}

function OwnerReceive({ api }: { api: Api }) {
  const { m, language, dir } = useI18n();
  const f = m.receive;
  const toast = useToast();
  const navigate = useNavigate();
  const today = useMemo(() => todayText(), []);

  const [suppliers, setSuppliers] = useState<ListedSupplier[] | null>(null);
  const [supplierError, setSupplierError] = useState<unknown>(null);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(today);
  const [dateNotADate, setDateNotADate] = useState(false); // the box holds text that is not a date: DateField says so itself
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [batches, setBatches] = useState<Record<string, ExistingBatch[]>>({});
  const [batchError, setBatchError] = useState<unknown>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [hinted, setHinted] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [oldDays, setOldDays] = useState<number | null>(null);
  const requested = useRef(new Set<string>());
  const dateRef = useRef<HTMLInputElement>(null);

  const loadSuppliers = useCallback(async () => {
    try {
      setSuppliers(await api.suppliers.list());
      setSupplierError(null);
    } catch (error) {
      setSupplierError(error);
    }
  }, [api]);
  useEffect(() => void loadSuppliers(), [loadSuppliers]);

  // The batches each product already has, asked once per product, so a clash is seen as soon as a number is typed.
  const loadBatches = useCallback(
    async (productId: string) => {
      try {
        const rows = await api.stock.batchesOf({ productId, includeCost: true });
        setBatches((b) => ({ ...b, [productId]: rows.map((r) => ({ batch_no: r.batch_no, expiry_date: r.expiry_date, cost_price: r.cost_price ?? 0 })) }));
        setBatchError(null);
      } catch (error) {
        requested.current.delete(productId);
        setBatchError(error);
      }
    },
    [api],
  );
  useEffect(() => {
    for (const line of lines) {
      if (requested.current.has(line.productId)) continue;
      requested.current.add(line.productId);
      void loadBatches(line.productId);
    }
  }, [lines, loadBatches]);

  const clashes = useMemo(() => findClashes(lines, batches), [lines, batches]);
  const loaded = useMemo(() => new Set(Object.keys(batches)), [batches]);
  const header = { supplierId, invoiceNo, date };
  const headerProblem = checkHeader(header, today);
  const blocker = blockerOf({ lines, header: headerProblem, clashes, loadedProducts: loaded });
  const totals = totalsOf(lines);

  const updateLine = (key: string, patch: Partial<LineDraft>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const touch = (key: string, field: LineField) => setTouched((t) => new Set(t).add(`${key}.${field}`));
  const addLine = (size: PickedSize) => {
    setLines((all) => [...all, { key: newLineKey(), productId: size.productId, nameEn: size.nameEn, nameUr: size.nameUr, label: size.label, packSize: size.packSize, batchNo: '', expiry: '', packs: '', cost: '' }]);
    setPicking(false);
    setSaveError(null);
  };
  const removeLine = (key: string) => setLines((all) => all.filter((l) => l.key !== key));

  const newBatchNumber = (line: LineDraft) => {
    const next = nextFreeBatchNo(line.batchNo, takenBatchNumbers(line, lines, batches));
    updateLine(line.key, { batchNo: next });
    setHinted((h) => new Set(h).add(line.key));
    requestAnimationFrame(() => {
      const box = document.getElementById(`${line.key}-batchNo`) as HTMLInputElement | null;
      box?.focus();
      box?.select();
    });
  };

  const submit = async (confirmedOldDate: boolean) => {
    if (blocker !== null || saving) return;
    setSaving(true);
    setSaveError(null);
    setOldDays(null);
    try {
      const result = await api.stock.receive(buildReceiveRequest(header, lines, confirmedOldDate));
      toast.show({ tone: 'success', title: f.received(formatMoney(result.total, language)) });
      navigate('/products');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RECEIPT_DATE_OLD') {
        setOldDays(typeof error.params['days'] === 'number' ? error.params['days'] : 0);
      } else {
        setSaveError(error);
        if (error instanceof ApiError && error.code === 'BATCH_CONFLICT') {
          // What this screen knew about the batches was out of date: ask again, so the clash is shown on its line.
          for (const productId of new Set(lines.map((l) => l.productId))) void loadBatches(productId);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const supplierName = (row: { name_en: string | null; name_ur: string | null }) => (language === 'ur' ? (row.name_ur ?? row.name_en) : (row.name_en ?? row.name_ur)) ?? '';
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const dateProblem = headerProblem === 'dateInvalid' || headerProblem === 'dateFuture' ? headerProblem : null;

  return (
    <form data-page="receive-stock" noValidate onSubmit={(e) => (e.preventDefault(), void submit(false))}>
      <Link to="/products" className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-accent">
        <Back aria-hidden className="size-4" />
        {f.back}
      </Link>
      <header className="stagger mb-6">
        <h1 className="text-[32px] font-bold leading-tight">{f.title}</h1>
        <p className="mt-1 text-base text-muted">{f.subtitle}</p>
      </header>

      {supplierError != null && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <ErrorNotice error={supplierError} className="max-w-xl" />
          <Button variant="secondary" onClick={() => void loadSuppliers()}>
            {m.products.retry}
          </Button>
        </div>
      )}
      {saveError != null && <ErrorNotice error={saveError} className="mb-4 max-w-3xl" />}
      {batchError != null && <ErrorNotice error={batchError} className="mb-4 max-w-3xl" />}

      <div className="stagger rounded-lg border border-line bg-card p-6 shadow-card" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <PickWithQuickAdd
            id="supplier"
            label={f.supplier}
            value={supplierId}
            rows={suppliers ?? []}
            name={supplierName}
            noneLabel={suppliers === null && supplierError == null ? f.loading : f.supplierPick}
            onPick={setSupplierId}
            addLabel={f.newSupplier}
            onAdd={async (names) => {
              const created = await api.suppliers.create(names);
              await loadSuppliers();
              setSupplierId(created.id);
            }}
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="invoice-no" className="block text-xs font-bold uppercase tracking-wider text-muted">
              {f.invoiceNo}
            </label>
            <Input id="invoice-no" dir="auto" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="date-received" className="block text-xs font-bold uppercase tracking-wider text-muted">
              {f.dateReceived}
            </label>
            <DateField
              id="date-received"
              name="date_received"
              ref={dateRef}
              max={today}
              value={date}
              onChange={setDate}
              onTextInvalid={setDateNotADate}
              invalid={dateProblem !== null}
              aria-describedby={dateProblem && !dateNotADate ? 'date-received-error' : undefined}
              wrapperClassName="w-full"
              className="h-14 w-full rounded-lg border-field-line px-4 text-lg font-normal text-ink [@media(max-height:800px)]:h-12"
            />
            {dateProblem && !dateNotADate && (
              <p id="date-received-error" role="alert" className="text-sm font-medium text-danger-ink">
                {f.problems[dateProblem]}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="stagger mt-6 overflow-hidden rounded-lg border border-line bg-card shadow-card" style={{ '--i': 2 } as React.CSSProperties}>
        <div className={cn('grid gap-3 bg-thead px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted', LINE_COLUMNS)} aria-hidden>
          <span>{f.columns.product}</span>
          <span>{f.columns.batch}</span>
          <span>{f.columns.expiry}</span>
          <span className="text-end">{f.columns.packs}</span>
          <span className="text-end">{f.columns.cost}</span>
          <span className="text-end">{f.columns.total}</span>
          <span />
        </div>

        {lines.length === 0 && !picking && <p className="border-t border-row-line px-6 py-8 text-center text-muted">{f.emptyLines}</p>}

        {lines.map((line) => (
          <ReceiveLine
            key={line.key}
            line={line}
            clash={clashes[line.key] ?? null}
            touched={touched}
            hinted={hinted.has(line.key)}
            onChange={(patch) => {
              updateLine(line.key, patch);
              if ('batchNo' in patch) setHinted((h) => (h.has(line.key) ? new Set([...h].filter((k) => k !== line.key)) : h));
            }}
            onTouch={(field) => touch(line.key, field)}
            onRemove={() => removeLine(line.key)}
            onUseExpiry={(expiry) => updateLine(line.key, { expiry })}
            onNewBatchNumber={() => newBatchNumber(line)}
          />
        ))}

        <div className="border-t border-row-line px-6 py-4">
          {picking ? (
            <ProductPicker api={api} onPick={addLine} onClose={() => setPicking(false)} />
          ) : (
            <Button variant="secondary" className="border-dashed text-accent" onClick={() => setPicking(true)}>
              {f.addLine}
            </Button>
          )}
        </div>
      </div>

      <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-card p-5 shadow-card">
        <div>
          <p className="text-sm text-muted">{f.summary(totals.lines, totals.packs)}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-lg font-semibold">{f.totalCost}</span>
            <span className="num text-[32px] font-bold leading-none text-accent" data-testid="total-cost">
              {formatMoney(totals.cost, language)}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted">{f.paidInFull}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {blocker !== null && (
            <p id="receive-why" className="text-sm text-muted" role="status">
              {f.why[blocker]}
            </p>
          )}
          <Button type="submit" size="lg" disabled={blocker !== null || saving} aria-describedby={blocker !== null ? 'receive-why' : undefined}>
            {saving ? f.receiving : f.receive}
          </Button>
        </div>
      </div>

      <Dialog open={oldDays !== null} title={f.oldDate.title(oldDays ?? 0)} onClose={() => setOldDays(null)}>
        <p className="mt-3 text-base">{f.oldDate.body}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setOldDays(null);
              requestAnimationFrame(() => dateRef.current?.focus());
            }}
          >
            {f.oldDate.changeDate}
          </Button>
          <Button onClick={() => void submit(true)}>{f.oldDate.saveAnyway}</Button>
        </div>
      </Dialog>
    </form>
  );
}
