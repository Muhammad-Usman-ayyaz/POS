import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/apiError';
import type { Customer, CustomerInput } from '../types';

interface CustomerFormDialogProps {
  customer?: Customer;
  saving: boolean;
  error: unknown;
  onSubmit: (input: CustomerInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const CustomerFormDialog: React.FC<CustomerFormDialogProps> = ({ customer, saving, error, onSubmit, onClose }) => {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    cnic: customer?.cnic ?? '',
    village: customer?.village ?? '',
    address: customer?.address ?? '',
    credit_limit: customer?.credit_limit ?? '0',
    notes: customer?.notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Farmer / Customer' : 'Register New Farmer / Customer'}</DialogTitle>
          <DialogDescription>Contact and khata credit details.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-space-md"
          noValidate
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
        >
          <fieldset disabled={saving} className="contents">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custName">
                Name <span className="text-error">*</span>
              </label>
              <input className={inputClass} id="custName" required type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custPhone">Phone</label>
                <input className={inputClass} id="custPhone" type="text" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custCnic">CNIC</label>
                <input className={inputClass} id="custCnic" type="text" value={form.cnic} onChange={(e) => set({ cnic: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custVillage">Village</label>
                <input className={inputClass} id="custVillage" type="text" value={form.village} onChange={(e) => set({ village: e.target.value })} />
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custLimit">Credit Limit (Rs.)</label>
                <input className={inputClass} id="custLimit" min="0" step="0.01" type="number" value={form.credit_limit} onChange={(e) => set({ credit_limit: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custAddress">Address</label>
              <input className={inputClass} id="custAddress" type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="custNotes">Notes</label>
              <input className={inputClass} id="custNotes" type="text" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
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
              {saving ? 'Saving...' : customer ? 'Save Changes' : 'Register Customer'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerFormDialog;
