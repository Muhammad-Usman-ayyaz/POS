import React, { useState } from 'react';
import { useStockMovements } from '@/features/inventory/api';
import { MOVEMENT_TYPE_LABELS } from '@/features/inventory/types';
import type { MovementType } from '@/features/inventory/types';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';

const INBOUND = new Set<MovementType>(['PURCHASE_IN', 'ADJUSTMENT_IN']);

const TYPE_STYLES: Record<MovementType, string> = {
  PURCHASE_IN: 'bg-success-soft text-success',
  ADJUSTMENT_IN: 'bg-success-soft text-success',
  SALE_OUT: 'bg-info-soft text-info',
  ADJUSTMENT_OUT: 'bg-warning-soft text-warning',
  DAMAGED: 'bg-danger-soft text-danger',
  EXPIRED: 'bg-danger-soft text-danger',
  PURCHASE_REVERSED: 'bg-danger-soft text-danger',
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const StockMovementPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [movementType, setMovementType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = useStockMovements({ search: debouncedSearch || undefined, movement_type: movementType || undefined, page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">swap_horiz</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Stock Movement</h1>
            <p className="font-body-sm text-body-sm text-outline">Complete audit trail of every stock change — purchases, sales, adjustments, and write-offs.</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col md:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by product, SKU, or reference..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={movementType}
          onChange={(e) => { setMovementType(e.target.value); setPage(1); }}
        >
          <option value="">All Movement Types</option>
          {Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[150px]">Date &amp; Time</th>
                <th className="py-space-sm px-space-sm min-w-[200px]">Product / Batch</th>
                <th className="py-space-sm px-space-sm min-w-[150px]">Type</th>
                <th className="py-space-sm px-space-sm text-right min-w-[90px]">Qty</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Balance After</th>
                <th className="py-space-sm px-space-sm min-w-[130px]">Reference / Note</th>
                <th className="py-space-sm pr-space-md pl-space-xs min-w-[110px]">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={7}>Loading movement history...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={7}>
                    {getErrorMessage(list.error, 'Could not load stock movements.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={7}>No movements match these filters.</td></tr>
              )}
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3 pl-space-md pr-space-sm font-body-sm text-body-sm text-outline whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                  <td className="py-3 px-space-sm">
                    <span className="font-label-md text-label-md text-on-surface">{m.product_name}</span>
                    <span className="block font-body-sm text-body-sm text-outline">{m.sku} · Batch {m.batch_no}</span>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${TYPE_STYLES[m.movement_type]}`}>
                      {MOVEMENT_TYPE_LABELS[m.movement_type]}
                    </span>
                  </td>
                  <td className={`py-3 px-space-sm text-right font-currency-cell text-currency-cell font-semibold ${INBOUND.has(m.movement_type) ? 'text-success' : 'text-error'}`}>
                    {INBOUND.has(m.movement_type) ? '+' : '-'}{Number(m.quantity).toLocaleString()}
                  </td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell">{Number(m.balance_after).toLocaleString()}</td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-outline">
                    {m.reference && <span className="font-mono">{m.reference}</span>}
                    {m.reference && m.note && ' · '}
                    {m.note}
                    {!m.reference && !m.note && '—'}
                  </td>
                  <td className="py-3 pr-space-md pl-space-xs font-body-sm text-body-sm text-outline">{m.created_by_name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="movements" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
};

export default StockMovementPage;
