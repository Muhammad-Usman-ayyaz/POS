import React, { useState } from 'react';
import { getErrorMessage } from '@/lib/apiError';
import type { NamedRef, Product, ProductInput } from '../types';

export type DrawerMode = 'create' | 'edit' | 'view';

interface ProductFormDrawerProps {
  mode: DrawerMode;
  product?: Product;
  categories: NamedRef[];
  brands: NamedRef[];
  saving: boolean;
  error: unknown;
  onSubmit: (input: ProductInput) => void;
  onClose: () => void;
}

const PACK_UNITS = ['ml', 'Litre', 'gm', 'kg'];

/** "100ml" -> {100, ml}; anything else ("50kg Bag") stays free text with no unit. */
const splitPackaging = (packaging: string) => {
  const match = packaging.match(/^(\d+(?:\.\d+)?)(ml|Litre|gm|kg)$/);
  return match ? { size: match[1], unit: match[2] } : { size: packaging, unit: '' };
};

const inputBase =
  'w-full px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container disabled:opacity-70';
const priceInput =
  'w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-currency-cell text-currency-cell focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70';
const smallInput =
  'w-full h-[36px] px-3 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none disabled:opacity-70';

const TITLES: Record<DrawerMode, { title: string; subtitle: string }> = {
  create: {
    title: 'Add New Product Master',
    subtitle: 'Register formulation, SKU code, tax structure, and retail rates',
  },
  edit: { title: 'Edit Product Master', subtitle: 'Update formulation details, packaging and retail rates' },
  view: { title: 'Product Details', subtitle: 'Read-only view of this product master entry' },
};

export const ProductFormDrawer: React.FC<ProductFormDrawerProps> = ({
  mode,
  product,
  categories,
  brands,
  saving,
  error,
  onSubmit,
  onClose,
}) => {
  const pack = splitPackaging(product?.packaging ?? '100ml');
  const [form, setForm] = useState({
    name: product?.name ?? '',
    chemical: product?.chemical ?? '',
    category: String(product?.category ?? categories[0]?.id ?? ''),
    brand: String(product?.brand ?? brands[0]?.id ?? ''),
    sku: product?.sku ?? '',
    packSize: pack.size,
    packUnit: product ? pack.unit : 'ml',
    purchasePrice: product?.purchase_price ?? '',
    sellingPrice: product?.selling_price ?? '',
    minStock: product?.min_stock_level ?? '20',
    initialStock: '',
    batchNo: '',
    expiryDate: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const isCreate = mode === 'create';
  const readOnly = mode === 'view';
  const canSeeCost = !product || product.purchase_price !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const input: ProductInput = {
      name: form.name,
      chemical: form.chemical,
      sku: form.sku,
      category: Number(form.category),
      brand: Number(form.brand),
      packaging: form.packUnit ? `${form.packSize}${form.packUnit}` : form.packSize,
      purchase_price: form.purchasePrice || '0',
      selling_price: form.sellingPrice || '0',
      min_stock_level: form.minStock || '0',
    };
    if (isCreate) {
      input.opening_quantity = form.initialStock || '0';
      input.opening_batch_no = form.batchNo;
      input.opening_expiry_date = form.expiryDate || null;
    }
    onSubmit(input);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop Scrim */}
      <div
        className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm animate-fade-in-up"
        style={{ animationDuration: '200ms' }}
        onClick={onClose}
      ></div>

      {/* Slide-Over Drawer Container */}
      <div className="relative w-screen max-w-xl glass-modal shadow-2xl flex flex-col justify-between overflow-y-auto z-10 erp-animate-drawer">
        <div>
          {/* Header */}
          <div className="p-space-lg bg-surface-container-low flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">{isCreate ? 'add_box' : readOnly ? 'visibility' : 'edit'}</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{TITLES[mode].title}</h2>
                <span className="font-body-sm text-body-sm text-outline">{TITLES[mode].subtitle}</span>
              </div>
            </div>
            <button
              className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-md" id="newProductForm">
            <fieldset disabled={readOnly || saving} className="contents">
              <div className="grid grid-cols-2 gap-space-md">
                <div className="col-span-2">
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Commercial Trade Name <span className="text-error">*</span>
                  </label>
                  <input
                    className={`${inputBase} h-[38px]`}
                    placeholder="e.g. Belt Expert 480 SC"
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Active Chemical Formulation / Ingredients
                  </label>
                  <input
                    className={`${inputBase} h-[38px]`}
                    placeholder="e.g. Flubendiamide + Thiacloprid 480 SC"
                    type="text"
                    value={form.chemical}
                    onChange={(e) => set({ chemical: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Category <span className="text-error">*</span>
                  </label>
                  <select
                    className={`${inputBase} h-[38px] font-label-md text-label-md`}
                    required
                    value={form.category}
                    onChange={(e) => set({ category: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    Manufacturer / Brand <span className="text-error">*</span>
                  </label>
                  <select
                    className={`${inputBase} h-[38px] font-label-md text-label-md`}
                    required
                    value={form.brand}
                    onChange={(e) => set({ brand: e.target.value })}
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">
                    SKU / Master Code <span className="text-error">*</span>
                  </label>
                  <input
                    className={`${inputBase} h-[38px]`}
                    placeholder="e.g. SKU-BAY-2024-X"
                    required
                    type="text"
                    value={form.sku}
                    onChange={(e) => set({ sku: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md text-on-surface mb-1">Packaging / Unit Size</label>
                  <div className="flex gap-1">
                    <input
                      className={`${inputBase} w-2/3 h-[38px]`}
                      placeholder="100"
                      type="text"
                      value={form.packSize}
                      onChange={(e) => set({ packSize: e.target.value })}
                    />
                    <select
                      className={`${inputBase} w-1/3 h-[38px] px-2 font-label-md text-label-md`}
                      value={form.packUnit}
                      onChange={(e) => set({ packUnit: e.target.value })}
                    >
                      <option value="">—</option>
                      {PACK_UNITS.map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Financial Pricing Block */}
              <div className="mt-2 p-space-md bg-surface-container-low/60 rounded-xl flex flex-col gap-space-sm border border-outline-variant/30">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                  Pricing &amp; Initial Inventory
                </span>
                <div className="grid grid-cols-2 gap-space-sm">
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">Purchase Cost Rate (Rs.)</label>
                    <input
                      className={priceInput}
                      min="0"
                      placeholder={canSeeCost ? 'e.g. 1500' : 'Restricted'}
                      step="0.01"
                      type="number"
                      disabled={!canSeeCost}
                      value={form.purchasePrice}
                      onChange={(e) => set({ purchasePrice: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">Retail MRP Rate (Rs.)</label>
                    <input
                      className={priceInput}
                      min="0"
                      placeholder="e.g. 1950"
                      step="0.01"
                      type="number"
                      value={form.sellingPrice}
                      onChange={(e) => set({ sellingPrice: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">
                      {isCreate ? 'Opening Quantity' : 'Current Stock'}
                    </label>
                    <input
                      className={smallInput}
                      disabled={!isCreate}
                      min="0"
                      placeholder="e.g. 50"
                      step="0.01"
                      type="number"
                      value={isCreate ? form.initialStock : product?.current_stock ?? ''}
                      onChange={(e) => set({ initialStock: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">Batch / Lot Number</label>
                    <input
                      className={smallInput}
                      disabled={!isCreate}
                      placeholder="e.g. B24-889"
                      type="text"
                      value={isCreate ? form.batchNo : product?.batch_no ?? ''}
                      onChange={(e) => set({ batchNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">Expiry Date</label>
                    <input
                      className={smallInput}
                      disabled={!isCreate}
                      type="date"
                      value={isCreate ? form.expiryDate : product?.expiry_date ?? ''}
                      onChange={(e) => set({ expiryDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-on-surface mb-1">Minimum Stock Level</label>
                    <input
                      className={smallInput}
                      min="0"
                      step="0.01"
                      type="number"
                      value={form.minStock}
                      onChange={(e) => set({ minStock: e.target.value })}
                    />
                  </div>
                </div>
                {!isCreate && (
                  <span className="font-body-sm text-body-sm text-outline">
                    Stock, batch and expiry change through purchases and stock adjustments, not from this form.
                  </span>
                )}
              </div>
            </fieldset>

            {error != null && (
              <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
                {getErrorMessage(error)}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="pt-4 flex items-center justify-end gap-space-sm border-t border-surface-container-low mt-2">
              <button
                className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer"
                onClick={onClose}
                type="button"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {!readOnly && (
                <button
                  className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? 'Saving...' : isCreate ? 'Save Product Master' : 'Save Changes'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProductFormDrawer;
