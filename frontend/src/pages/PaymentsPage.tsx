import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customers as customersApi, useRecordCustomerPayment } from '@/features/customers/api';
import { useKhataLedger } from '@/features/khata/api';
import { CustomerPaymentDialog } from '@/features/khata/components/CustomerPaymentDialog';
import { PickCustomerDialog } from '@/features/khata/components/PickCustomerDialog';
import type { PaymentInput } from '@/features/khata/types';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payingCustomerId, setPayingCustomerId] = useState<number | null>(null);

  const list = useKhataLedger({ search: debouncedSearch || undefined, type: 'PAYMENT', page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;
  const totalReceived = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  const payingCustomer = customersApi.useDetail(payingCustomerId ?? undefined);
  const recordPayment = useRecordCustomerPayment();

  const handlePick = (customerId: number) => {
    setPickerOpen(false);
    setPayingCustomerId(customerId);
  };

  const closePaymentDialog = () => {
    setPayingCustomerId(null);
    recordPayment.reset();
  };

  const handlePay = (input: PaymentInput) => {
    if (payingCustomerId === null) return;
    recordPayment.mutate(
      { id: payingCustomerId, input },
      { onSuccess: () => { notify(`Payment of Rs. ${Number(input.amount).toLocaleString()} recorded`); closePaymentDialog(); } }
    );
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">payments</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Payments</h1>
            <p className="font-body-sm text-body-sm text-outline">Cash, bank transfer, Easypaisa, and JazzCash payments received from farmers.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Record Payment</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <div className="erp-stagger-item erp-stagger-2 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Received (This Page)</span>
          <div className="font-currency-stat text-currency-stat text-success mt-0.5">{rs(totalReceived)}</div>
        </div>
        <div className="erp-stagger-item erp-stagger-3 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Payment Records</span>
          <div className="font-currency-stat text-currency-stat text-on-surface mt-0.5">{total}</div>
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-4 glass-toolbar p-space-md rounded-xl shadow-sm relative flex items-center">
        <span className="material-symbols-outlined absolute left-6 text-outline text-[20px]">search</span>
        <input
          className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          placeholder="Search by farmer name..."
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
        />
      </div>

      <div className="erp-stagger-item erp-stagger-5 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm min-w-[180px]">Farmer</th>
                <th className="py-space-sm px-space-sm min-w-[140px]">Method</th>
                <th className="py-space-sm px-space-sm min-w-[180px]">Note</th>
                <th className="py-space-sm pr-space-md pl-space-sm text-right min-w-[110px]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={5}>Loading payments...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={5}>
                    {getErrorMessage(list.error, 'Could not load payments.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={5}>No payments recorded yet.</td></tr>
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
                    <span className="px-2 py-0.5 rounded-full bg-info-soft text-info font-label-sm text-label-sm font-semibold inline-block">{entry.method_label}</span>
                  </td>
                  <td className="py-3 px-space-sm font-body-sm text-body-sm text-on-surface-variant">{entry.note || '—'}</td>
                  <td className="py-3 pr-space-md pl-space-sm text-right font-currency-cell text-currency-cell font-semibold text-success">{rs(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="payments" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>

      {pickerOpen && <PickCustomerDialog onClose={() => setPickerOpen(false)} onPick={handlePick} />}

      {payingCustomerId !== null && payingCustomer.data && (
        <CustomerPaymentDialog
          customerName={payingCustomer.data.name}
          error={recordPayment.error}
          onClose={closePaymentDialog}
          onSubmit={handlePay}
          outstandingBalance={payingCustomer.data.outstanding_balance}
          saving={recordPayment.isPending}
        />
      )}
    </div>
  );
};

export default PaymentsPage;
