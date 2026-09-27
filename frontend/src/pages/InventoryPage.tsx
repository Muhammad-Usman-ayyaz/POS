import React, { useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { batches as batchesApi, useCreateAdjustment } from '@/features/inventory/api';
import { AdjustmentDialog } from '@/features/inventory/components/AdjustmentDialog';
import type { AdjustmentInput, BatchStock } from '@/features/inventory/types';
import { useCategories } from '@/features/catalog/api';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number | null) => (value === null ? '—' : `Rs. ${Number(value).toLocaleString()}`);
const formatExpiry = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const rowStatus = (batch: BatchStock): { label: string; className: string } => {
  const qty = Number(batch.quantity);
  const min = Number(batch.min_stock_level);
  if (qty <= 0) return { label: 'Out of Stock', className: 'bg-danger-soft text-danger' };
  const daysToExpiry = batch.expiry_date ? (new Date(batch.expiry_date).getTime() - Date.now()) / 86_400_000 : Infinity;
  if (daysToExpiry < 0) return { label: 'Expired', className: 'bg-danger-soft text-danger' };
  if (daysToExpiry <= 90) return { label: 'Near Expiry', className: 'bg-warning-soft text-warning' };
  if (qty <= min) return { label: 'Low Stock', className: 'bg-warning-soft text-warning' };
  return { label: 'In Stock', className: 'bg-success-soft text-success' };
};

export const InventoryPage: React.FC = () => {
  const role = useAuthStore((state) => state.role);
  const canAdjust = role === 'OWNER' || role === 'MANAGER' || role === 'ACCOUNTANT';

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [adjustTarget, setAdjustTarget] = useState<BatchStock | null>(null);

  const { data: categories = [] } = useCategories();
  const list = batchesApi.useList({
    search: debouncedSearch || undefined, status: statusFilter || undefined, category: categoryFilter || undefined,
    page, page_size: pageSize,
  });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  const createAdjustment = useCreateAdjustment();

  const handleAdjust = (input: AdjustmentInput) => {
    createAdjustment.mutate(input, {
      onSuccess: () => { notify('Stock adjustment recorded'); setAdjustTarget(null); },
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">inventory_2</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Inventory</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                {total} Batches
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Batch-level stock, expiry tracking, and manual corrections.</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col md:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by product, SKU, or batch number..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">Stock: All</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
          <option value="near_expiry">Near Expiry (&lt; 90 days)</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[220px]">Product</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Batch</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Expiry</th>
                <th className="py-space-sm px-space-sm text-right min-w-[130px]">Quantity</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Purchase</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Selling</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Status</th>
                {canAdjust && <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[90px]">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={8}>Loading inventory...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={8}>
                    {getErrorMessage(list.error, 'Could not load inventory.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={8}>No stock batches match these filters.</td></tr>
              )}
              {rows.map((b) => {
                const status = rowStatus(b);
                return (
                  <tr key={b.id} className="hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 pl-space-md pr-space-sm">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{b.product_name}</span>
                      <span className="block font-body-sm text-body-sm text-outline">{b.sku} · {b.brand_name} · {b.packaging}</span>
                    </td>
                    <td className="py-3 px-space-sm font-mono font-label-md text-label-md text-on-surface-variant">{b.batch_no}</td>
                    <td className="py-3 px-space-sm font-body-sm text-body-sm text-on-surface">{formatExpiry(b.expiry_date)}</td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell font-semibold">
                      {Number(b.quantity).toLocaleString()} {b.stock_unit}
                    </td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell text-outline">{rs(b.purchase_price)}</td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell">{rs(b.selling_price)}</td>
                    <td className="py-3 px-space-sm">
                      <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${status.className}`}>{status.label}</span>
                    </td>
                    {canAdjust && (
                      <td className="py-3 pr-space-md pl-space-xs text-center">
                        <button
                          className="h-8 px-2.5 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary text-label-sm font-label-sm cursor-pointer"
                          onClick={() => setAdjustTarget(b)}
                          type="button"
                        >
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination noun="batches" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>

      {adjustTarget && (
        <AdjustmentDialog
          batch={adjustTarget}
          error={createAdjustment.error}
          onClose={() => { setAdjustTarget(null); createAdjustment.reset(); }}
          onSubmit={handleAdjust}
          saving={createAdjustment.isPending}
        />
      )}
    </div>
  );
};

export default InventoryPage;
