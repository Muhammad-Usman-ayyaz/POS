import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import { ADJUSTMENT_TYPES } from '../types';
import type { AdjustmentInput, BatchStock, MovementType } from '../types';

interface AdjustmentDialogProps {
  batch: BatchStock;
  saving: boolean;
  error: unknown;
  onSubmit: (input: AdjustmentInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const AdjustmentDialog: React.FC<AdjustmentDialogProps> = ({ batch, saving, error, onSubmit, onClose }) => {
  const [movementType, setMovementType] = useState<MovementType>('ADJUSTMENT_OUT');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {batch.product_name} · Batch {batch.batch_no} · Currently {Number(batch.quantity).toLocaleString()} {batch.stock_unit}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-space-md"
          onSubmit={(e) => { e.preventDefault(); onSubmit({ batch: batch.id, movement_type: movementType, quantity, note }); }}
        >
          <fieldset disabled={saving} className="contents">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Reason</label>
              <select className={`${inputClass} font-label-md text-label-md`} value={movementType} onChange={(e) => setMovementType(e.target.value as MovementType)}>
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Quantity <span className="text-error">*</span></label>
              <input className={inputClass} min="0.01" required step="0.01" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1">Note</label>
              <input className={inputClass} placeholder="Reason for this correction" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
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
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AdjustmentDialog;
