import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesReturns } from '@/features/returns/api';
import { REFUND_METHOD_LABELS } from '@/features/returns/types';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const REFUND_METHOD_STYLES: Record<string, string> = {
  CASH: 'bg-success-soft text-success',
  KHATA_CREDIT: 'bg-info-soft text-info',
};

export const ReturnsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = salesReturns.useList({ search: debouncedSearch || undefined, page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  return (
    <div className="flex flex-col w-full gap-y-space-md erp-animate-page">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">assignment_return</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Returns &amp; Claims</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">{total} Total</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Items a customer brought back, with stock restored and the refund settled in cash or as khata credit.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => navigate('/invoices')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          <span>Find a Sale to Return</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by return number, invoice, or customer..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[100px]">Return</th>
                <th className="py-space-sm px-space-sm min-w-[100px]">Invoice</th>
                <th className="py-space-sm px-space-sm min-w-[160px]">Customer</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm min-w-[200px]">Reason</th>
                <th className="py-space-sm px-space-sm min-w-[130px]">Refund Method</th>
                <th className="py-space-sm pr-space-md pl-space-sm text-right min-w-[110px]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={7}>Loading returns...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={7}>
                    {getErrorMessage(list.error, 'Could not load returns.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={7}>No returns recorded yet.</td></tr>
              )}
              {rows.map((ret) => (
                <tr className="hover:bg-surface-container-low/60 transition-colors" key={ret.id}>
                  <td className="py-3 pl-space-md pr-space-sm font-label-md text-label-md font-semibold text-on-surface">{ret.return_no}</td>
                  <td className="py-3 px-space-sm">
                    <button className="font-label-md text-label-md text-primary hover:underline font-semibold cursor-pointer" onClick={() => navigate(`/invoices/${ret.sale}`)} type="button">
                      {ret.invoice_no}
                    </button>
                  </td>
                  <td className="py-3 px-space-sm">{ret.customer_name || 'Walk-in Customer'}</td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-outline">{formatDate(ret.return_date)}</td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-on-surface-variant">{ret.reason || '—'}</td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${REFUND_METHOD_STYLES[ret.refund_method]}`}>
                      {REFUND_METHOD_LABELS[ret.refund_method]}
                    </span>
                  </td>
                  <td className="py-3 pr-space-md pl-space-sm text-right font-currency-cell text-currency-cell font-semibold">{rs(ret.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="returns" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
};

export default ReturnsPage;
