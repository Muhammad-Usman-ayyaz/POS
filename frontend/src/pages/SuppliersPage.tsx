import React, { useMemo, useState } from 'react';
import { suppliers as suppliersApi } from '@/features/suppliers/api';
import { SupplierFormDialog } from '@/features/suppliers/components/SupplierFormDialog';
import type { Supplier, SupplierInput } from '@/features/suppliers/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

type DialogState = { mode: 'create' | 'edit'; supplier?: Supplier } | null;

export const SuppliersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);

  const list = suppliersApi.useList({ search: debouncedSearch || undefined });
  const rows = list.data ?? [];

  const totals = useMemo(
    () => ({
      count: rows.length,
      outstanding: rows.reduce((sum, s) => sum + Number(s.outstanding_balance), 0),
      purchased: rows.reduce((sum, s) => sum + Number(s.total_purchased), 0),
      overdue: rows.filter((s) => Number(s.outstanding_balance) > 0).length,
    }),
    [rows]
  );

  const createSupplier = suppliersApi.useCreate();
  const updateSupplier = suppliersApi.useUpdate();
  const removeSupplier = suppliersApi.useRemove();
  const saving = createSupplier.isPending || updateSupplier.isPending;

  const closeDialog = () => {
    setDialog(null);
    createSupplier.reset();
    updateSupplier.reset();
  };

  const handleSave = (input: SupplierInput) => {
    if (dialog?.mode === 'edit' && dialog.supplier) {
      updateSupplier.mutate(
        { id: dialog.supplier.id, input },
        { onSuccess: () => { notify(`${input.name} updated`); closeDialog(); } }
      );
    } else {
      createSupplier.mutate(input, {
        onSuccess: () => { notify(`${input.name} registered`); closeDialog(); },
      });
    }
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    removeSupplier.mutate(pendingDelete.id, {
      onSuccess: () => { notify(`${pendingDelete.name} deleted`); setPendingDelete(null); },
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      {/* Header */}
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">local_shipping</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Suppliers</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">
                {totals.count} Registered
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">
              Manage supplier contacts and track outstanding payables from received purchases.
            </p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => setDialog({ mode: 'create' })}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <div className="erp-stagger-item erp-stagger-2 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Total Purchased (All Time)</span>
          <div className="font-currency-stat text-currency-stat text-on-surface mt-0.5">{rs(totals.purchased)}</div>
        </div>
        <div className="erp-stagger-item erp-stagger-3 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Outstanding Payable</span>
          <div className="font-currency-stat text-currency-stat text-error mt-0.5">{rs(totals.outstanding)}</div>
        </div>
        <div className="erp-stagger-item erp-stagger-4 erp-card-hover glass-card p-space-md rounded-xl shadow-sm">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Suppliers with a Balance</span>
          <div className="font-currency-stat text-currency-stat text-warning mt-0.5">{totals.overdue}</div>
        </div>
      </div>

      {/* Search */}
      <div className="erp-stagger-item erp-stagger-5 glass-toolbar p-space-md rounded-xl shadow-sm relative flex items-center">
        <span className="material-symbols-outlined absolute left-6 text-outline text-[20px]">search</span>
        <input
          className="w-full h-[40px] pl-10 pr-10 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          placeholder="Search by supplier name, contact person, or phone..."
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="erp-stagger-item erp-stagger-6 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[220px]">Supplier</th>
                <th className="py-space-sm px-space-sm min-w-[160px]">Contact</th>
                <th className="py-space-sm px-space-sm text-right min-w-[90px]">Purchases</th>
                <th className="py-space-sm px-space-sm text-right min-w-[130px]">Total Purchased</th>
                <th className="py-space-sm px-space-sm text-right min-w-[130px]">Outstanding</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={6}>Loading suppliers...</td></tr>
              )}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={6}>
                    {getErrorMessage(list.error, 'Could not load suppliers.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={6}>No suppliers match this search.</td></tr>
              )}
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-low/60 transition-colors group">
                  <td className="py-3 pl-space-md pr-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <div className="w-9 h-9 rounded-lg bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center shrink-0 font-label-md text-label-md font-semibold">
                        {initialsOf(s.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                          {s.name}
                        </span>
                        <span className="font-body-sm text-body-sm text-outline truncate">{s.address || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className="font-label-md text-label-md text-on-surface">{s.contact_person || '—'}</span>
                    <span className="block font-body-sm text-body-sm text-outline">{s.phone || '—'}</span>
                  </td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell text-on-surface">{s.purchase_count}</td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell text-on-surface">{rs(s.total_purchased)}</td>
                  <td className="py-3 px-space-sm text-right">
                    <span className={`font-currency-cell text-currency-cell font-bold ${Number(s.outstanding_balance) > 0 ? 'text-error' : 'text-success'}`}>
                      {rs(s.outstanding_balance)}
                    </span>
                  </td>
                  <td className="py-3 pr-space-md pl-space-xs text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer erp-btn-press"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[18px]">more_vert</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ mode: 'edit', supplier: s })}>Edit supplier</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPendingDelete(s)} variant="destructive">Delete supplier</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && (
        <SupplierFormDialog
          error={dialog.mode === 'edit' ? updateSupplier.error : createSupplier.error}
          onClose={closeDialog}
          onSubmit={handleSave}
          open
          saving={saving}
          supplier={dialog.supplier}
        />
      )}

      <ConfirmDialog
        confirmLabel="Delete supplier"
        description={`"${pendingDelete?.name ?? ''}" will be removed from the directory. This is blocked while it has purchase history.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        open={pendingDelete !== null}
        pending={removeSupplier.isPending}
        title="Delete this supplier?"
      />
    </div>
  );
};

export default SuppliersPage;
