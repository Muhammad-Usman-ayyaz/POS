import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKhataLedger } from '@/features/khata/api';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const KhataPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [entryType, setEntryType] = useState<'' | 'CHARGE' | 'PAYMENT'>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = useKhataLedger({ search: debouncedSearch || undefined, type: entryType || undefined, page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">menu_book</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Farmer Khata</h1>
            <p className="font-body-sm text-body-sm text-outline">Shop-wide credit ledger — every charge and payment, across all farmers.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => navigate('/customers')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">groups</span>
          <span>Farmers Directory</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col md:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by farmer name..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={entryType}
          onChange={(e) => { setEntryType(e.target.value as typeof entryType); setPage(1); }}
        >
          <option value="">All Entries</option>
          <option value="CHARGE">Credit Sales Only</option>
          <option value="PAYMENT">Payments Only</option>
        </select>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm min-w-[180px]">Farmer</th>
                <th className="py-space-sm px-space-sm min-w-[150px]">Type</th>
                <th className="py-space-sm px-space-sm min-w-[200px]">Details</th>
                <th className="py-space-sm pr-space-md pl-space-sm text-right min-w-[110px]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={5}>Loading khata ledger...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={5}>
                    {getErrorMessage(list.error, 'Could not load the khata ledger.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={5}>No khata activity matches these filters.</td></tr>
              )}
              {rows.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3 pl-space-md pr-space-sm font-body-sm text-body-sm text-outline whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="py-3 px-space-sm">
                    <button className="font-label-md text-label-md text-on-surface hover:text-primary transition-colors cursor-pointer" onClick={() => navigate(`/customers/${entry.customer}`)} type="button">
                      {entry.customer_name}
                    </button>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${entry.type === 'CHARGE' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                      {entry.type === 'CHARGE' ? 'Credit Sale' : `Payment · ${entry.method_label}`}
                    </span>
                  </td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-on-surface-variant">{entry.description || entry.note || '—'}</td>
                  <td className={`py-3 pr-space-md pl-space-sm text-right font-currency-cell text-currency-cell font-semibold ${entry.type === 'CHARGE' ? 'text-error' : 'text-success'}`}>
                    {entry.type === 'CHARGE' ? '+' : '-'}{rs(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="entries" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
};

export default KhataPage;
