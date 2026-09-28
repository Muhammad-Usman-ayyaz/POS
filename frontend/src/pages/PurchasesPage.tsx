import React, { useState } from 'react';
import { purchases as purchasesApi, useCancelPurchase, useRecordSupplierPayment } from '@/features/purchases/api';
import { PurchaseFormDialog } from '@/features/purchases/components/PurchaseFormDialog';
import { RecordPaymentDialog } from '@/features/purchases/components/RecordPaymentDialog';
import type { PaymentInput, Purchase, PurchaseInput } from '@/features/purchases/types';
import { suppliers as suppliersApi } from '@/features/suppliers/api';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: 'bg-success-soft text-success',
  CANCELLED: 'bg-danger-soft text-danger',
};

export const PurchasesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null);

  const { data: suppliers = [] } = suppliersApi.useList();
  const list = purchasesApi.useList({
    search: debouncedSearch || undefined, status: statusFilter || undefined, page, page_size: pageSize,
  });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  const createPurchase = purchasesApi.useCreate();
  const recordPayment = useRecordSupplierPayment();
  const cancelPurchase = useCancelPurchase();

  const handleCreate = (input: PurchaseInput) => {
    createPurchase.mutate(input, {
      onSuccess: () => { notify(`Purchase from ${suppliers.find((s) => s.id === input.supplier)?.name ?? 'supplier'} received`); setShowForm(false); },
    });
  };

  const handlePay = (input: PaymentInput) => {
    if (!payTarget) return;
    recordPayment.mutate(
      { id: payTarget.id, input },
      { onSuccess: () => { notify(`Payment of ${rs(input.amount)} recorded`); setPayTarget(null); } }
    );
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelPurchase.mutate(cancelTarget.id, {
      onSuccess: () => { notify(`PUR-${cancelTarget.id} cancelled`); setCancelTarget(null); },
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">shopping_cart</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Purchases</h1>
            <p className="font-body-sm text-body-sm text-outline">Goods received from suppliers. Each receipt adds stock automatically.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => setShowForm(true)}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Receive Purchase</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by invoice number or supplier..."
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
          <option value="RECEIVED">Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm w-8"></th>
                <th className="py-space-sm px-space-sm min-w-[100px]">Purchase</th>
                <th className="py-space-sm px-space-sm min-w-[180px]">Supplier</th>
                <th className="py-space-sm px-space-sm min-w-[110px]">Date</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Total</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Paid</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Balance</th>
                <th className="py-space-sm px-space-sm min-w-[100px]">Status</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[160px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={9}>Loading purchases...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={9}>
                    {getErrorMessage(list.error, 'Could not load purchases.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={9}>No purchases match these filters.</td></tr>
              )}
              {rows.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 pl-space-md">
                      <button
                        className="w-7 h-7 rounded-lg hover:bg-surface-container-high text-outline flex items-center justify-center cursor-pointer"
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">{expanded === p.id ? 'expand_less' : 'expand_more'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">PUR-{p.id}</span>
                      <span className="block font-body-sm text-body-sm text-outline">{p.invoice_no || '—'}</span>
                    </td>
                    <td className="py-3 px-space-sm">{p.supplier_name}</td>
                    <td className="py-3 px-space-sm font-body-sm text-body-sm text-outline">{formatDate(p.purchase_date)}</td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell">{rs(p.total_amount)}</td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell text-success">{rs(p.paid_amount)}</td>
                    <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell font-bold">
                      <span className={Number(p.balance) > 0 ? 'text-error' : 'text-success'}>{rs(p.balance)}</span>
                    </td>
                    <td className="py-3 px-space-sm">
                      <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="py-3 pr-space-md pl-space-xs text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.status === 'RECEIVED' && Number(p.balance) > 0 && (
                          <button
                            className="h-8 px-2.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary text-label-sm font-label-sm cursor-pointer erp-btn-press"
                            onClick={() => setPayTarget(p)}
                            type="button"
                          >
                            Pay
                          </button>
                        )}
                        {p.status === 'RECEIVED' && (
                          <button
                            className="h-8 px-2.5 rounded-lg hover:bg-error-container/40 text-outline hover:text-error text-label-sm font-label-sm cursor-pointer erp-btn-press"
                            onClick={() => setCancelTarget(p)}
                            type="button"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr>
                      <td colSpan={9} className="bg-surface-container-low/50 px-space-lg py-space-md">
                        <div className="erp-animate-pop grid md:grid-cols-2 gap-space-md">
                          <div>
                            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Line Items</span>
                            <table className="w-full mt-1 text-body-sm font-body-sm">
                              <tbody>
                                {p.items.map((item) => (
                                  <tr key={item.id} className="border-b border-surface-container last:border-0">
                                    <td className="py-1 pr-2">{item.product_name} <span className="text-outline">({item.batch_no})</span></td>
                                    <td className="py-1 text-right">{item.quantity} × {rs(item.unit_cost)}</td>
                                    <td className="py-1 pl-2 text-right font-semibold">{rs(item.line_total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Payments</span>
                            {p.payments.length === 0 ? (
                              <p className="font-body-sm text-body-sm text-outline mt-1">No payments recorded yet.</p>
                            ) : (
                              <table className="w-full mt-1 text-body-sm font-body-sm">
                                <tbody>
                                  {p.payments.map((pay) => (
                                    <tr key={pay.id} className="border-b border-surface-container last:border-0">
                                      <td className="py-1 pr-2">{formatDate(pay.paid_on)} · {pay.method}</td>
                                      <td className="py-1 text-right font-semibold text-success">{rs(pay.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {p.notes && <p className="font-body-sm text-body-sm text-outline mt-2">Note: {p.notes}</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="purchases" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>

      {showForm && (
        <PurchaseFormDialog
          error={createPurchase.error}
          onClose={() => { setShowForm(false); createPurchase.reset(); }}
          onSubmit={handleCreate}
          saving={createPurchase.isPending}
          suppliers={suppliers}
        />
      )}

      {payTarget && (
        <RecordPaymentDialog
          error={recordPayment.error}
          onClose={() => { setPayTarget(null); recordPayment.reset(); }}
          onSubmit={handlePay}
          purchase={payTarget}
          saving={recordPayment.isPending}
        />
      )}

      <ConfirmDialog
        confirmLabel="Cancel purchase"
        description={`PUR-${cancelTarget?.id ?? ''} will be reversed and its stock removed. This is blocked if the stock has already moved or a payment was recorded.`}
        onCancel={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        open={cancelTarget !== null}
        pending={cancelPurchase.isPending}
        title="Cancel this purchase?"
      />
    </div>
  );
};

export default PurchasesPage;
