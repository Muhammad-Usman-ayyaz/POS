import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import type { Sale } from '@/features/sales/types';
import { REFUND_METHOD_LABELS } from '../types';
import type { RefundMethod, SalesReturnInput } from '../types';

interface NewReturnDialogProps {
  sale: Sale;
  saving: boolean;
  error: unknown;
  onSubmit: (input: SalesReturnInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const NewReturnDialog: React.FC<NewReturnDialogProps> = ({ sale, saving, error, onSubmit, onClose }) => {
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');

  const hasCustomer = sale.customer !== null;
  const total = sale.items.reduce((sum, item) => {
    const qty = Number(quantities[item.id] || 0);
    return sum + qty * Number(item.unit_price);
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = sale.items
      .map((item) => ({ sale_item: item.id, quantity: Number(quantities[item.id] || 0) }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) return;
    onSubmit({ sale: sale.id, return_date: returnDate, reason, refund_method: refundMethod, lines });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Return Items — {sale.invoice_no}</DialogTitle>
          <DialogDescription>{sale.customer_name || 'Walk-in Customer'} · Enter how many units of each item are being returned.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-space-md" noValidate onSubmit={handleSubmit}>
          <fieldset disabled={saving} className="contents">
            <div className="rounded-lg border border-surface-container-high overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3 text-right">Sold Qty</th>
                    <th className="py-2 px-3 text-right w-28">Return Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">
                  {sale.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3">{item.product_name}</td>
                      <td className="py-2 px-3 text-right text-outline">{item.quantity}</td>
                      <td className="py-2 px-3">
                        <input
                          className={inputClass}
                          max={item.quantity}
                          min="0"
                          step="0.01"
                          type="number"
                          value={quantities[item.id] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="retDate">Return Date <span className="text-error">*</span></label>
                <input className={inputClass} id="retDate" required type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="retMethod">Refund Method</label>
                <select
                  className={`${inputClass} font-label-md text-label-md`}
                  id="retMethod"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
                >
                  <option value="CASH">{REFUND_METHOD_LABELS.CASH}</option>
                  <option disabled={!hasCustomer} value="KHATA_CREDIT">
                    {REFUND_METHOD_LABELS.KHATA_CREDIT}{!hasCustomer ? ' (needs a customer)' : ''}
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="retReason">Reason</label>
              <input className={inputClass} id="retReason" placeholder="e.g. Damaged, wrong item" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2 font-label-md text-label-md">
              <span className="text-outline">Refund Total</span>
              <span className="font-semibold text-on-surface">Rs. {total.toLocaleString()}</span>
            </div>
          </fieldset>

          {error != null && (
            <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
              {getErrorMessage(error)}
            </div>
          )}

          <DialogFooter>
            <button className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60" disabled={saving || total <= 0} type="submit">
              {saving ? 'Processing...' : 'Process Return'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewReturnDialog;
