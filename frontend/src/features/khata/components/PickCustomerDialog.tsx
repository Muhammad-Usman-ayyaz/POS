import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { customers as customersApi } from '@/features/customers/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface PickCustomerDialogProps {
  onPick: (customerId: number) => void;
  onClose: () => void;
}

export const PickCustomerDialog: React.FC<PickCustomerDialogProps> = ({ onPick, onClose }) => {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const list = customersApi.useList({ search: debounced || undefined, page_size: 10 });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Farmer / Customer</DialogTitle>
          <DialogDescription>Choose who this payment is from.</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
          placeholder="Search by name or phone..."
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto flex flex-col divide-y divide-surface-container-low -mx-1">
          {list.isPending && <p className="py-space-md text-center font-body-sm text-body-sm text-outline">Loading...</p>}
          {list.isSuccess && list.data.results.length === 0 && (
            <p className="py-space-md text-center font-body-sm text-body-sm text-outline">No matches.</p>
          )}
          {list.data?.results.map((c) => (
            <button
              className="flex items-center justify-between px-1 py-2 text-left hover:bg-surface-container-low rounded cursor-pointer"
              key={c.id}
              onClick={() => onPick(c.id)}
              type="button"
            >
              <span className="font-label-md text-label-md text-on-surface">{c.name}</span>
              <span className="font-body-sm text-body-sm text-outline">{c.phone || c.village || ''}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PickCustomerDialog;
