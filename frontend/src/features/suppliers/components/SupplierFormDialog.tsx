import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import type { Supplier, SupplierInput } from '../types';

interface SupplierFormDialogProps {
  open: boolean;
  supplier?: Supplier;
  saving: boolean;
  error: unknown;
  onSubmit: (input: SupplierInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const SupplierFormDialog: React.FC<SupplierFormDialogProps> = ({ open, supplier, saving, error, onSubmit, onClose }) => {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_person: supplier?.contact_person ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Edit Supplier' : 'Register New Supplier'}</DialogTitle>
          <DialogDescription>Contact details used for purchase orders and payables.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-space-md">
          <fieldset disabled={saving} className="contents">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="supplierName">
                Supplier Name <span className="text-error">*</span>
              </label>
              <input className={inputClass} id="supplierName" required type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="supplierContact">Contact Person</label>
                <input className={inputClass} id="supplierContact" type="text" value={form.contact_person} onChange={(e) => set({ contact_person: e.target.value })} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="supplierPhone">Phone</label>
                <input className={inputClass} id="supplierPhone" type="text" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="supplierAddress">Address</label>
              <input className={inputClass} id="supplierAddress" type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="supplierNotes">Notes</label>
              <input className={inputClass} id="supplierNotes" type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </fieldset>

          {error != null && (
            <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
              {getErrorMessage(error)}
            </div>
          )}

          <DialogFooter>
            <button
              className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving...' : supplier ? 'Save Changes' : 'Register Supplier'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierFormDialog;
