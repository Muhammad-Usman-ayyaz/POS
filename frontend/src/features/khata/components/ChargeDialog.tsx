import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import type { ChargeInput } from '../types';

interface ChargeDialogProps {
  customerName: string;
  saving: boolean;
  error: unknown;
  onSubmit: (input: ChargeInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const ChargeDialog: React.FC<ChargeDialogProps> = ({ customerName, saving, error, onSubmit, onClose }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [chargeDate, setChargeDate] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Credit Sale (Khata Charge)</DialogTitle>
          <DialogDescription>Adds to {customerName}'s outstanding balance.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-space-md"
          noValidate
          onSubmit={(e) => { e.preventDefault(); onSubmit({ amount, description, charge_date: chargeDate }); }}
        >
          <fieldset disabled={saving} className="contents">
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="chargeAmount">Amount (Rs.) <span className="text-error">*</span></label>
                <input className={inputClass} id="chargeAmount" min="0.01" required step="0.01" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="chargeDate">Date <span className="text-error">*</span></label>
                <input className={inputClass} id="chargeDate" required type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="chargeDesc">Description</label>
              <input className={inputClass} id="chargeDesc" placeholder="e.g. Fertilizer & seed on credit" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
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
              {saving ? 'Saving...' : 'Record Charge'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChargeDialog;
