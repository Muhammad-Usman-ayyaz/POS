import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { customers as customersApi, useRecordCharge, useRecordCustomerPayment } from '@/features/customers/api';
import { useCustomerLedger } from '@/features/khata/api';
import { ChargeDialog } from '@/features/khata/components/ChargeDialog';
import { CustomerPaymentDialog } from '@/features/khata/components/CustomerPaymentDialog';
import type { ChargeInput, PaymentInput } from '@/features/khata/types';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export const CustomerProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const customerId = Number(id);
  const [dialog, setDialog] = useState<'charge' | 'pay' | null>(null);

  const detail = customersApi.useDetail(customerId);
  const ledger = useCustomerLedger(customerId);

  const recordCharge = useRecordCharge();
  const recordPayment = useRecordCustomerPayment();

  const closeDialog = () => { setDialog(null); recordCharge.reset(); recordPayment.reset(); };

  const handleCharge = (input: ChargeInput) => {
    recordCharge.mutate({ id: customerId, input }, { onSuccess: () => { notify(`Rs. ${Number(input.amount).toLocaleString()} charged`); closeDialog(); } });
  };
  const handlePay = (input: PaymentInput) => {
    recordPayment.mutate({ id: customerId, input }, { onSuccess: () => { notify(`Payment of Rs. ${Number(input.amount).toLocaleString()} recorded`); closeDialog(); } });
  };

  if (detail.isPending) {
    return <div className="py-space-xl text-center text-outline font-body-md">Loading customer...</div>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="py-space-xl text-center text-error font-body-md">
        {getErrorMessage(detail.error, 'Could not load this customer.')}{' '}
        <button className="text-primary underline cursor-pointer" onClick={() => navigate('/customers')} type="button">Back to Customers</button>
      </div>
    );
  }
  const customer = detail.data;

  return (
    <div className="flex flex-col w-full gap-y-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-y-space-sm pb-space-xs">
        <div className="flex items-center gap-space-xs font-label-md text-label-md">
          <button className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/customers')} type="button">
            Customers
          </button>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold">{customer.name}</span>
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-1 erp-card-hover glass-card rounded-xl shadow-sm p-space-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-lg relative z-10">
          <div className="flex items-start gap-space-md min-w-0">
            <div className="w-16 h-16 rounded-xl bg-primary text-on-primary font-headline-lg text-headline-lg flex items-center justify-center shadow-md select-none shrink-0">
              {initialsOf(customer.name)}
            </div>
            <div className="min-w-0">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{customer.name}</h1>
              <p className="font-body-sm text-body-sm text-outline mt-0.5">{customer.village || 'No village on file'}</p>
              <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 mt-2 font-body-sm text-body-sm text-on-surface-variant">
                <span>{customer.phone || 'No phone'}</span>
                <span>{customer.cnic || 'No CNIC'}</span>
              </div>
              {customer.notes && <p className="font-body-sm text-body-sm text-outline mt-2">{customer.notes}</p>}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-space-md">
            <div className="flex flex-col items-start sm:items-end">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Outstanding Balance</span>
              <span className={`font-currency-stat text-currency-stat font-bold ${Number(customer.outstanding_balance) > 0 ? 'text-error' : 'text-success'}`}>
                {rs(customer.outstanding_balance)}
              </span>
              {customer.over_credit_limit && (
                <span className="font-label-sm text-label-sm text-warning mt-0.5">Over credit limit of {rs(customer.credit_limit)}</span>
              )}
            </div>
            <div className="flex gap-space-sm">
              <button className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer erp-btn-press" onClick={() => setDialog('charge')} type="button">
                Record Credit Sale
              </button>
              <button className="h-10 px-space-md rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer erp-btn-press" onClick={() => setDialog('pay')} type="button">
                Record Payment
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <div className="erp-stagger-item erp-stagger-2 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Total Charged</span>
          <div className="font-currency-stat text-currency-stat text-on-surface mt-0.5">{rs(customer.total_charged)}</div>
        </div>
        <div className="erp-stagger-item erp-stagger-3 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Total Paid</span>
          <div className="font-currency-stat text-currency-stat text-success mt-0.5">{rs(customer.total_paid)}</div>
        </div>
        <div className="erp-stagger-item erp-stagger-4 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Credit Limit</span>
          <div className="font-currency-stat text-currency-stat text-on-surface mt-0.5">{rs(customer.credit_limit)}</div>
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-5 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-space-md border-b border-surface-container-low">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Khata Ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Type</th>
                <th className="py-space-sm px-space-sm min-w-[200px]">Details</th>
                <th className="py-space-sm pr-space-md pl-space-sm text-right min-w-[110px]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {ledger.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={4}>Loading ledger...</td></tr>}
              {ledger.isError && <tr><td className="py-space-xl text-center text-error" colSpan={4}>{getErrorMessage(ledger.error, 'Could not load the ledger.')}</td></tr>}
              {ledger.isSuccess && ledger.data.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={4}>No khata activity yet.</td></tr>
              )}
              {ledger.data?.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3 pl-space-md pr-space-sm font-body-sm text-body-sm text-outline">{formatDate(entry.date)}</td>
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
      </div>

      {dialog === 'charge' && (
        <ChargeDialog customerName={customer.name} error={recordCharge.error} onClose={closeDialog} onSubmit={handleCharge} saving={recordCharge.isPending} />
      )}
      {dialog === 'pay' && (
        <CustomerPaymentDialog
          customerName={customer.name}
          error={recordPayment.error}
          onClose={closeDialog}
          onSubmit={handlePay}
          outstandingBalance={customer.outstanding_balance}
          saving={recordPayment.isPending}
        />
      )}
    </div>
  );
};

export default CustomerProfilePage;
