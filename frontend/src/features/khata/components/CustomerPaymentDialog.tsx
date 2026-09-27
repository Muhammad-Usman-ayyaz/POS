import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import { PAYMENT_METHOD_LABELS } from '../types';
import type { PaymentInput, PaymentMethod } from '../types';

interface CustomerPaymentDialogProps {
  customerName: string;
  outstandingBalance: string;
  saving: boolean;
  error: unknown;
  onSubmit: (input: PaymentInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const CustomerPaymentDialog: React.FC<CustomerPaymentDialogProps> = ({
  customerName, outstandingBalance, saving, error, onSubmit, onClose,
}) => {
  const [amount, setAmount] = useState(Number(outstandingBalance) > 0 ? outstandingBalance : '');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Khata Payment</DialogTitle>
          <DialogDescription>
            {customerName} · Outstanding Rs. {Number(outstandingBalance).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-space-md"
          noValidate
          onSubmit={(e) => { e.preventDefault(); onSubmit({ amount, method, paid_on: paidOn, note }); }}
        >
          <fieldset disabled={saving} className="contents">
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custPayAmount">Amount (Rs.) <span className="text-error">*</span></label>
                <input className={inputClass} id="custPayAmount" min="0.01" required step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custPayDate">Date <span className="text-error">*</span></label>
                <input className={inputClass} id="custPayDate" required type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custPayMethod">Method</label>
              <select className={`${inputClass} font-label-md text-label-md`} id="custPayMethod" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custPayNote">Note</label>
              <input className={inputClass} id="custPayNote" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
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
            <button className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60" disabled={saving} type="submit">
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerPaymentDialog;
