import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { useCategories } from '@/features/catalog/api';
import { customers as customersApi } from '@/features/customers/api';
import { batches as batchesApi } from '@/features/inventory/api';
import { PickCustomerDialog } from '@/features/khata/components/PickCustomerDialog';
import { openInvoicePdf, sales as salesApi } from '@/features/sales/api';
import { PAYMENT_METHOD_LABELS, type SalePaymentMethod } from '@/features/sales/types';
import { useBump } from '@/components/ui/animation';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

interface CartLine {
  batchId: number;
  productId: number;
  name: string;
  batchNo: string;
  unitPrice: number;
  qty: number;
  available: number;
}

const PAYMENT_METHODS: { value: SalePaymentMethod; icon: string }[] = [
  { value: 'CASH', icon: 'payments' },
  { value: 'BANK_TRANSFER', icon: 'account_balance' },
  { value: 'EASYPAISA', icon: 'phone_android' },
  { value: 'JAZZCASH', icon: 'contactless' },
  { value: 'KHATA', icon: 'menu_book' },
];

const rs = (value: number) => `Rs. ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const POSPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('CASH');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const { data: categories = [] } = useCategories();
  const productList = batchesApi.useList({
    search: debouncedSearch || undefined, category: categoryFilter || undefined, page_size: 12,
  });
  const products = (productList.data?.results ?? []).filter((b) => Number(b.quantity) > 0);

  const customer = customersApi.useDetail(customerId ?? undefined);
  const createSale = salesApi.useCreate({ silent: true });

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const totalItemCount = cart.reduce((sum, l) => sum + l.qty, 0);
  const total = Math.max(0, subtotal - (discount || 0));

  const cartCountBump = useBump(cart.length);
  const totalBump = useBump(total);

  const addToCart = (batch: (typeof products)[number]) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.batchId === batch.id);
      const available = Number(batch.quantity);
      if (existing) {
        if (existing.qty >= available) {
          notifyError(`Only ${available} ${batch.stock_unit} of ${batch.product_name} left in this batch.`);
          return prev;
        }
        return prev.map((l) => (l.batchId === batch.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          batchId: batch.id, productId: batch.product, name: batch.product_name, batchNo: batch.batch_no,
          unitPrice: Number(batch.selling_price), qty: 1, available,
        },
      ];
    });
    notify(`Added 1x ${batch.product_name}`, 1500);
  };

  const updateQty = (batchId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.batchId !== batchId) return l;
          const nextQty = l.qty + delta;
          if (nextQty > l.available) {
            notifyError(`Only ${l.available} left in stock for this batch.`);
            return l;
          }
          return nextQty > 0 ? { ...l, qty: nextQty } : null;
        })
        .filter((l): l is CartLine => l !== null)
    );
  };

  const removeItem = (batchId: number) => setCart((prev) => prev.filter((l) => l.batchId !== batchId));

  const resetSale = () => {
    setCart([]);
    setDiscount(0);
    setPaymentMethod('CASH');
    setCustomerId(null);
  };

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      notifyError('Cannot complete an empty sale. Add items first.');
      return;
    }
    if (paymentMethod === 'KHATA' && !customerId) {
      notifyError('Select a farmer to charge this sale to their khata.');
      return;
    }
    createSale.mutate(
      {
        sale_date: new Date().toISOString().slice(0, 10),
        payment_method: paymentMethod,
        discount_amount: discount || 0,
        customer: customerId ?? undefined,
        lines: cart.map((l) => ({ product: l.productId, batch: l.batchId, quantity: l.qty, unit_price: l.unitPrice })),
      },
      {
        onSuccess: (sale) => {
          notify(`${sale.invoice_no} completed — ${rs(Number(sale.total_amount))}`);
          openInvoicePdf(sale.id);
          resetSale();
        },
        onError: (err) => notifyError(getErrorMessage(err, 'Could not complete this sale.')),
      }
    );
  };

  const activeCustomerName = customer.data?.name;

  return (
    <div className="flex flex-col w-full erp-animate-page">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
          </div>
          <div>
            <span className="font-headline-sm text-headline-sm text-on-surface">Point of Sale</span>
            <p className="font-label-sm text-label-sm text-outline">Cashier: {user?.name ?? '—'}</p>
          </div>
        </div>
        <button
          className="h-9 px-space-md rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-1.5 hover:bg-surface-container transition-colors shadow-sm cursor-pointer erp-btn-press"
          onClick={() => navigate('/invoices')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">history</span>
          <span>Sales History</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
        {/* LEFT: product search */}
        <section className="lg:col-span-7 flex flex-col gap-space-md">
          <div className="erp-stagger-item erp-stagger-1 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-primary text-[20px]">search</span>
              <input
                autoFocus
                className="w-full h-11 pl-11 pr-3 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner"
                placeholder="Search product, SKU, or batch..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none">
              <button
                className={`px-space-md py-1.5 rounded-full font-label-sm text-label-sm shrink-0 erp-btn-press cursor-pointer ${
                  categoryFilter === '' ? 'bg-primary text-on-primary font-semibold shadow-xs' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
                onClick={() => setCategoryFilter('')}
                type="button"
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`px-space-md py-1.5 rounded-full font-label-sm text-label-sm shrink-0 erp-btn-press cursor-pointer ${
                    categoryFilter === String(c.id) ? 'bg-primary text-on-primary font-semibold shadow-xs' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                  onClick={() => setCategoryFilter(String(c.id))}
                  type="button"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            {productList.isPending && <p className="col-span-2 text-center py-space-lg text-outline font-body-sm">Loading products...</p>}
            {productList.isSuccess && products.length === 0 && (
              <p className="col-span-2 text-center py-space-lg text-outline font-body-sm">No in-stock products match this search.</p>
            )}
            {products.map((batch, idx) => (
              <div
                key={batch.id}
                className={`erp-stagger-item erp-stagger-${Math.min(idx + 1, 8)} erp-card-hover bg-surface-container-lowest p-space-md rounded-xl shadow-xs flex flex-col justify-between group relative overflow-hidden border border-transparent hover:border-primary/20`}
              >
                <div>
                  <div className="flex items-start justify-between gap-space-xs mb-1.5">
                    <span className="px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold bg-surface-container-high text-on-surface-variant">
                      {batch.brand_name}
                    </span>
                    <span className="px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold bg-secondary/10 text-secondary">
                      {batch.quantity} {batch.stock_unit}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold group-hover:text-primary transition-colors">
                    {batch.product_name}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">{batch.sku} · {batch.category_name}</p>
                  <div className="flex items-center gap-space-xs text-outline font-label-sm text-label-sm mt-2">
                    <span className="bg-surface-container-low px-1.5 py-0.5 rounded">{batch.batch_no}</span>
                    {batch.expiry_date && <span>Exp: {batch.expiry_date}</span>}
                  </div>
                </div>
                <div className="mt-4 pt-3 flex items-center justify-between bg-surface-container-low/50 -mx-space-md -mb-space-md px-space-md py-space-sm rounded-b-xl">
                  <div>
                    <span className="font-label-sm text-label-sm text-outline block leading-none">Selling Price</span>
                    <span className="font-currency-stat text-currency-stat text-primary font-bold">{rs(Number(batch.selling_price))}</span>
                  </div>
                  <button
                    className="h-9 px-space-md rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1.5 shadow-sm erp-btn-press cursor-pointer"
                    onClick={() => addToCart(batch)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                    <span>Add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT: cart + checkout */}
        <aside className="lg:col-span-5 flex flex-col gap-space-sm">
          <div className="erp-stagger-item erp-stagger-2 glass-card p-space-md rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-space-xs">
              <label className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">Farmer / Buyer</label>
              <button
                className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-1 font-semibold cursor-pointer"
                onClick={() => setPickerOpen(true)}
                type="button"
              >
                <span className="material-symbols-outlined text-[14px]">person_search</span>
                {customerId ? 'Change' : 'Select Farmer'}
              </button>
            </div>
            {customerId && activeCustomerName ? (
              <div className="bg-primary/5 rounded-lg p-space-sm flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">{activeCustomerName}</span>
                  <button className="text-outline hover:text-error cursor-pointer" onClick={() => setCustomerId(null)} type="button">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
                {customer.data && (
                  <div className="grid grid-cols-2 gap-2 text-left pt-1">
                    <div className="bg-surface-container-lowest/80 p-1.5 rounded">
                      <span className="text-[11px] text-outline block leading-none">Outstanding</span>
                      <span className={`font-currency-cell text-currency-cell font-bold ${Number(customer.data.outstanding_balance) > 0 ? 'text-error' : 'text-success'}`}>
                        {rs(Number(customer.data.outstanding_balance))}
                      </span>
                    </div>
                    <div className="bg-surface-container-lowest/80 p-1.5 rounded">
                      <span className="text-[11px] text-outline block leading-none">Credit Limit</span>
                      <span className="font-currency-cell text-currency-cell text-primary font-bold">{rs(Number(customer.data.credit_limit))}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="font-body-sm text-body-sm text-outline">Walk-in customer — no khata attached.</p>
            )}
          </div>

          <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="px-space-md py-2.5 bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Current Bill Items</span>
                <span className={`w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center ${cartCountBump ? 'erp-animate-bump' : ''}`}>
                  {cart.length}
                </span>
              </div>
              <button
                className="text-outline hover:text-error font-label-sm text-label-sm flex items-center gap-1 transition-colors cursor-pointer erp-btn-press"
                onClick={() => cart.length > 0 && setConfirmClear(true)}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                <span>Clear</span>
              </button>
            </div>

            <div className="flex flex-col max-h-[260px] overflow-y-auto px-space-md py-space-xs">
              {cart.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-outline">
                  <span className="material-symbols-outlined text-[40px] mb-2 opacity-40">remove_shopping_cart</span>
                  <p className="font-label-md text-label-md">Cart is currently empty</p>
                  <span className="font-body-sm text-body-sm">Search and add items from the left</span>
                </div>
              ) : (
                cart.map((line, idx) => (
                  <div
                    key={line.batchId}
                    className={`erp-cart-item-enter py-space-sm flex items-center justify-between gap-space-sm ${idx % 2 === 1 ? 'bg-surface-container-low/40 rounded-lg px-2 -mx-2' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-label-md text-label-md text-on-surface font-semibold truncate">{line.name}</h4>
                      <span className="text-outline font-label-sm text-label-sm">Batch {line.batchNo}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-surface-container-low rounded-lg p-0.5 shrink-0">
                      <button
                        className="w-7 h-7 rounded bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container erp-btn-press cursor-pointer"
                        onClick={() => updateQty(line.batchId, -1)}
                        type="button"
                      >
                        -
                      </button>
                      <span className="w-7 text-center font-currency-cell text-currency-cell font-bold text-on-surface select-none">{line.qty}</span>
                      <button
                        className="w-7 h-7 rounded bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container erp-btn-press cursor-pointer"
                        onClick={() => updateQty(line.batchId, 1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right shrink-0 min-w-[80px]">
                      <span className="font-currency-cell text-currency-cell text-on-surface font-bold block">{rs(line.unitPrice * line.qty)}</span>
                      <button className="text-outline hover:text-error text-label-sm ml-auto pt-0.5 cursor-pointer erp-btn-press" onClick={() => removeItem(line.batchId)} type="button">
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-surface-container-low p-space-md flex flex-col gap-space-xs">
              <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
                <span>Subtotal ({totalItemCount} items)</span>
                <span className="font-currency-cell text-currency-cell text-on-surface font-semibold">{rs(subtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-on-surface-variant font-body-sm text-body-sm">
                <span>Discount</span>
                <div className="flex items-center gap-1">
                  <span className="text-error font-currency-cell text-currency-cell font-semibold">- Rs.</span>
                  <input
                    className="w-20 h-7 text-right px-1.5 rounded bg-surface-container-lowest text-error font-currency-cell text-currency-cell font-bold focus:outline-none"
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="mt-2 pt-2 bg-surface-container-lowest p-space-sm rounded-xl flex items-center justify-between shadow-sm">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">Net Payable</span>
                <span className={`font-display text-display text-primary font-bold tracking-tight inline-block ${totalBump ? 'erp-animate-bump' : ''}`}>{rs(total)}</span>
              </div>

              <div className="mt-2">
                <label className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold block mb-1.5">Payment Method</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm.value}
                      className={`px-2 py-2 rounded-lg font-label-sm text-label-sm font-semibold flex flex-col items-center justify-center gap-1 erp-btn-press cursor-pointer ${
                        paymentMethod === pm.value ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => setPaymentMethod(pm.value)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">{pm.icon}</span>
                      <span>{PAYMENT_METHOD_LABELS[pm.value]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="w-full h-12 mt-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 shadow-md erp-btn-press cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={createSale.isPending}
                onClick={handleCompleteSale}
                type="button"
              >
                <span className="material-symbols-outlined text-[22px]">print</span>
                <span>{createSale.isPending ? 'Completing…' : 'Complete Sale & Print Invoice'}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {pickerOpen && (
        <PickCustomerDialog
          description="Choose who this sale is for."
          onClose={() => setPickerOpen(false)}
          onPick={(id) => { setCustomerId(id); setPickerOpen(false); }}
        />
      )}

      <ConfirmDialog
        confirmLabel="Clear cart"
        description="All items currently in the cart will be removed."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setCart([]); setConfirmClear(false); }}
        open={confirmClear}
        title="Clear the active cart?"
      />
    </div>
  );
};

export default POSPage;
