import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { downloadInvoicePdf, openInvoicePdf, sales as salesApi, useCancelSale } from '@/features/sales/api';
import { PAYMENT_METHOD_LABELS } from '@/features/sales/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const CAN_CANCEL_ROLES = new Set(['OWNER', 'MANAGER']);

export const InvoicePreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const saleId = id ? Number(id) : undefined;
  const role = useAuthStore((s) => s.role);
  const canCancel = role !== null && CAN_CANCEL_ROLES.has(role);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const detail = salesApi.useDetail(saleId);
  const cancelSale = useCancelSale();

  if (saleId === undefined) {
    return (
      <div className="py-space-xl text-center text-outline font-body-md">
        No invoice selected.{' '}
        <Link className="text-primary underline" to="/invoices">Go to Sales &amp; Invoices</Link>
      </div>
    );
  }
  if (detail.isPending) {
    return <div className="py-space-xl text-center text-outline font-body-md">Loading invoice...</div>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="py-space-xl text-center text-error font-body-md">
        {getErrorMessage(detail.error, 'Could not load this invoice.')}{' '}
        <button className="text-primary underline cursor-pointer" onClick={() => navigate('/invoices')} type="button">Back to Invoices</button>
      </div>
    );
  }
  const sale = detail.data;

  const handleCancel = () => {
    cancelSale.mutate(sale.id, {
      onSuccess: () => { notify(`${sale.invoice_no} cancelled`); setConfirmCancel(false); },
      onError: (err) => notifyError(getErrorMessage(err, 'Could not cancel this sale.')),
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-lg erp-animate-page">
      <div className="flex flex-wrap items-center justify-between gap-y-space-sm pb-space-xs">
        <div className="flex items-center gap-space-xs font-label-md text-label-md">
          <Link className="text-on-surface-variant hover:text-primary transition-colors" to="/invoices">Sales &amp; Invoices</Link>
          <span className="text-outline-variant">/</span>
          <span className="text-primary font-semibold">{sale.invoice_no}</span>
        </div>
        <div className="flex flex-wrap items-center gap-space-xs">
          <button
            className="h-9 px-space-sm rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md flex items-center gap-1 transition-colors cursor-pointer erp-btn-press"
            onClick={() => openInvoicePdf(sale.id)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            <span>View PDF</span>
          </button>
          <button
            className="h-9 px-space-sm rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md flex items-center gap-1 transition-colors cursor-pointer erp-btn-press"
            onClick={() => downloadInvoicePdf(sale.id, sale.invoice_no)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span>Download PDF</span>
          </button>
          {canCancel && sale.status === 'COMPLETED' && (
            <button
              className="h-9 px-space-sm rounded-lg bg-error-container/30 text-error hover:bg-error-container/50 font-label-md text-label-md flex items-center gap-1 transition-colors cursor-pointer erp-btn-press"
              onClick={() => setConfirmCancel(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
              <span>Cancel Sale</span>
            </button>
          )}
        </div>
      </div>

      <div className="erp-stagger-item erp-stagger-1 glass-card rounded-xl shadow-sm p-space-lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-lg">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Pesticide Club</h1>
            <p className="font-body-sm text-body-sm text-outline">Agri Retail &amp; Khata ERP</p>
          </div>
          <div className="text-left md:text-right">
            <div className="flex items-center gap-space-xs md:justify-end">
              <span className="font-headline-md text-headline-md text-on-surface font-semibold">{sale.invoice_no}</span>
              <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${sale.status === 'COMPLETED' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                {sale.status}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">{formatDate(sale.sale_date)} · {PAYMENT_METHOD_LABELS[sale.payment_method]}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-space-md mt-space-lg pt-space-lg border-t border-surface-container-low">
          <div>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Billed To</span>
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-0.5">{sale.customer_name || 'Walk-in Customer'}</p>
          </div>
          <div className="sm:text-right">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Served By</span>
            <p className="font-body-md text-body-md text-on-surface mt-0.5">{sale.created_by_name || 'System'}</p>
          </div>
        </div>

        <div className="mt-space-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-sm pr-space-sm">Product</th>
                <th className="py-space-sm px-space-sm">Batch</th>
                <th className="py-space-sm px-space-sm text-right">Qty</th>
                <th className="py-space-sm px-space-sm text-right">Unit Price</th>
                <th className="py-space-sm pr-space-sm pl-space-sm text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pl-space-sm pr-space-sm font-semibold">{item.product_name}<div className="font-body-sm text-body-sm text-outline font-normal">{item.sku}</div></td>
                  <td className="py-3 px-space-sm font-mono text-body-sm text-on-surface-variant">{item.batch_no}</td>
                  <td className="py-3 px-space-sm text-right">{item.quantity}</td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell">{rs(item.unit_price)}</td>
                  <td className="py-3 pr-space-sm pl-space-sm text-right font-currency-cell text-currency-cell font-semibold">{rs(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-space-lg">
          <div className="w-full sm:w-64 flex flex-col gap-space-xs">
            <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>Subtotal</span>
              <span>{rs(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between font-body-sm text-body-sm text-on-surface-variant">
              <span>Discount</span>
              <span>{rs(sale.discount_amount)}</span>
            </div>
            <div className="flex justify-between font-headline-sm text-headline-sm text-on-surface font-bold pt-space-xs border-t border-surface-container-low">
              <span>Total</span>
              <span className="text-primary">{rs(sale.total_amount)}</span>
            </div>
          </div>
        </div>

        {sale.notes && (
          <p className="mt-space-md font-body-sm text-body-sm text-outline">
            <strong className="text-on-surface-variant">Note:</strong> {sale.notes}
          </p>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Cancel sale"
        description={`${sale.invoice_no} will be reversed: stock returns to the batch it was sold from, and any khata charge it posted is removed.`}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        open={confirmCancel}
        pending={cancelSale.isPending}
        title="Cancel this sale?"
      />
    </div>
  );
};

export default InvoicePreviewPage;
