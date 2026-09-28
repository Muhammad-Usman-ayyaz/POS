import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { downloadInvoicePdf, sales as salesApi, useCancelSale } from '@/features/sales/api';
import { PAYMENT_METHOD_LABELS, type Sale } from '@/features/sales/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_STYLES: Record<Sale['status'], string> = {
  COMPLETED: 'bg-success-soft text-success',
  CANCELLED: 'bg-danger-soft text-danger',
};

const CAN_CANCEL_ROLES = new Set(['OWNER', 'MANAGER']);

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const canCancel = role !== null && CAN_CANCEL_ROLES.has(role);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);

  const list = salesApi.useList({
    search: debouncedSearch || undefined, status: statusFilter || undefined, payment_method: methodFilter || undefined,
    page, page_size: pageSize,
  });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  const cancelSale = useCancelSale();

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelSale.mutate(cancelTarget.id, {
      onSuccess: () => { notify(`${cancelTarget.invoice_no} cancelled`); setCancelTarget(null); },
      onError: (err) => notifyError(getErrorMessage(err, 'Could not cancel this sale.')),
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Sales &amp; Invoices</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">{total} Total</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Every till transaction, with a printable invoice for each.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => navigate('/pos')}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
          <span>New Sale</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by invoice number or customer..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          className="h-[40px] px-3 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-primary-container"
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Payment Methods</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[100px]">Invoice</th>
                <th className="py-space-sm px-space-sm min-w-[160px]">Customer</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm min-w-[130px]">Payment</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Total</th>
                <th className="py-space-sm px-space-sm min-w-[100px]">Status</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={7}>Loading sales...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={7}>
                    {getErrorMessage(list.error, 'Could not load sales.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={7}>No sales match these filters.</td></tr>
              )}
              {rows.map((sale) => (
                <tr className="hover:bg-surface-container-low/60 transition-colors" key={sale.id}>
                  <td className="py-3 pl-space-md pr-space-sm">
                    <button className="font-label-md text-label-md text-primary hover:underline font-semibold cursor-pointer" onClick={() => navigate(`/invoices/${sale.id}`)} type="button">
                      {sale.invoice_no}
                    </button>
                  </td>
                  <td className="py-3 px-space-sm">{sale.customer_name || 'Walk-in Customer'}</td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-outline">{formatDate(sale.sale_date)}</td>
                  <td className="py-3 px-space-sm">{PAYMENT_METHOD_LABELS[sale.payment_method]}</td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell font-semibold">{rs(sale.total_amount)}</td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${STATUS_STYLES[sale.status]}`}>{sale.status}</span>
                  </td>
                  <td className="py-3 pr-space-md pl-space-xs text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="h-8 px-2.5 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary text-label-sm font-label-sm cursor-pointer erp-btn-press"
                        onClick={() => downloadInvoicePdf(sale.id, sale.invoice_no)}
                        type="button"
                      >
                        Print
                      </button>
                      {canCancel && sale.status === 'COMPLETED' && (
                        <button
                          className="h-8 px-2.5 rounded-lg hover:bg-error-container/40 text-outline hover:text-error text-label-sm font-label-sm cursor-pointer erp-btn-press"
                          onClick={() => setCancelTarget(sale)}
                          type="button"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="sales" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>

      <ConfirmDialog
        confirmLabel="Cancel sale"
        description={`${cancelTarget?.invoice_no ?? ''} will be reversed: stock returns to the batch it was sold from, and any khata charge it posted is removed.`}
        onCancel={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        open={cancelTarget !== null}
        pending={cancelSale.isPending}
        title="Cancel this sale?"
      />
    </div>
  );
};

export default InvoicesPage;
