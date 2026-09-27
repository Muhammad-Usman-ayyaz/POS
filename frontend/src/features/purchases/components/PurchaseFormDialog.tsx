import React, { useState } from 'react';
import { useBrands, useCategories } from '@/features/catalog/api';
import { products as productsApi } from '@/features/catalog/api';
import type { Supplier } from '@/features/suppliers/types';
import { getErrorMessage } from '@/lib/apiError';
import type { PurchaseInput, PurchaseItemInput } from '../types';

interface PurchaseFormDialogProps {
  suppliers: Supplier[];
  saving: boolean;
  error: unknown;
  onSubmit: (input: PurchaseInput) => void;
  onClose: () => void;
}

const emptyLine: PurchaseItemInput = { product: 0, batch_no: '', expiry_date: '', quantity: '', unit_cost: '' };

const inputClass =
  'w-full h-[36px] px-2 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary';

export const PurchaseFormDialog: React.FC<PurchaseFormDialogProps> = ({ suppliers, saving, error, onSubmit, onClose }) => {
  // A search-backed product picker keeps this usable with a large catalog instead of one giant <select>.
  const [productQuery, setProductQuery] = useState('');
  const productList = productsApi.useList({ search: productQuery || undefined, page_size: 20 });
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  void categories;
  void brands;

  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? 0);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseItemInput[]>([{ ...emptyLine }]);
  const [productNames, setProductNames] = useState<Record<number, string>>({});

  const updateLine = (index: number, patch: Partial<PurchaseItemInput>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      supplier,
      invoice_no: invoiceNo,
      purchase_date: purchaseDate,
      notes,
      items_input: lines
        .filter((l) => l.product && l.quantity && l.unit_cost)
        .map((l) => ({ ...l, expiry_date: l.expiry_date || null })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm animate-fade-in-up" style={{ animationDuration: '200ms' }} onClick={onClose} />
      <div className="relative w-screen max-w-2xl glass-modal shadow-2xl flex flex-col justify-between overflow-y-auto z-10 erp-animate-drawer">
        <div>
          <div className="p-space-lg bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">Receive New Purchase</h2>
                <span className="font-body-sm text-body-sm text-outline">Adds stock to the batches listed below</span>
              </div>
            </div>
            <button className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center cursor-pointer" onClick={onClose} type="button">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-md">
            <fieldset disabled={saving} className="contents">
              <div className="grid grid-cols-3 gap-space-sm">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Supplier <span className="text-error">*</span></label>
                  <select className={`${inputClass} h-[38px]`} required value={supplier} onChange={(e) => setSupplier(Number(e.target.value))}>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Invoice / Reference No.</label>
                  <input className={`${inputClass} h-[38px]`} type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Purchase Date <span className="text-error">*</span></label>
                  <input className={`${inputClass} h-[38px]`} required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </div>
              </div>

              <div className="mt-2 p-space-md bg-surface-container-low/60 rounded-xl flex flex-col gap-space-sm border border-outline-variant/30">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Line Items</span>
                  <input
                    className={`${inputClass} w-48`}
                    placeholder="Search product to add..."
                    type="text"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                  />
                </div>

                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <select
                      className={`${inputClass} col-span-4`}
                      required
                      value={line.product || ''}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const found = productList.data?.results.find((p) => p.id === id);
                        setProductNames((prev) => ({ ...prev, [id]: found?.name ?? prev[id] ?? '' }));
                        updateLine(i, { product: id });
                      }}
                    >
                      <option value="">
                        {productList.isPending ? 'Loading...' : 'Select product'}
                      </option>
                      {line.product && !productList.data?.results.some((p) => p.id === line.product) && (
                        <option value={line.product}>{productNames[line.product] ?? `#${line.product}`}</option>
                      )}
                      {productList.data?.results.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                      ))}
                    </select>
                    <input className={`${inputClass} col-span-2`} placeholder="Batch #" required type="text" value={line.batch_no} onChange={(e) => updateLine(i, { batch_no: e.target.value })} />
                    <input className={`${inputClass} col-span-2`} type="date" value={line.expiry_date ?? ''} onChange={(e) => updateLine(i, { expiry_date: e.target.value })} />
                    <input className={`${inputClass} col-span-1`} min="0.01" placeholder="Qty" required step="0.01" type="number" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                    <input className={`${inputClass} col-span-2`} min="0" placeholder="Cost" required step="0.01" type="number" value={line.unit_cost} onChange={(e) => updateLine(i, { unit_cost: e.target.value })} />
                    <button
                      className="col-span-1 h-8 w-8 rounded-lg hover:bg-error-container/40 text-outline hover:text-error flex items-center justify-center cursor-pointer disabled:opacity-30"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(i)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
                <button
                  className="self-start font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  onClick={addLine}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span> Add another line
                </button>

                <div className="flex justify-end pt-1 border-t border-outline-variant/30">
                  <span className="font-label-md text-label-md text-on-surface">
                    Total: <span className="font-currency-cell text-currency-cell font-bold">Rs. {total.toLocaleString()}</span>
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">Notes</label>
                <input className={`${inputClass} h-[38px]`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </fieldset>

            {error != null && (
              <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
                {getErrorMessage(error)}
              </div>
            )}

            <div className="pt-4 flex items-center justify-end gap-space-sm border-t border-surface-container-low mt-2">
              <button className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60" disabled={saving || !suppliers.length} type="submit">
                {saving ? 'Saving...' : 'Receive Purchase'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PurchaseFormDialog;
