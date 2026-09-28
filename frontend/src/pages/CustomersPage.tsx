import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customers as customersApi, useRecordCharge, useRecordCustomerPayment } from '@/features/customers/api';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import type { Customer, CustomerInput } from '@/features/customers/types';
import { ChargeDialog } from '@/features/khata/components/ChargeDialog';
import { CustomerPaymentDialog } from '@/features/khata/components/CustomerPaymentDialog';
import type { ChargeInput, PaymentInput } from '@/features/khata/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify } from '@/lib/notify';

const rs = (value: string | number) => `Rs. ${Number(value).toLocaleString()}`;
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

type DialogState =
  | { kind: 'create' | 'edit'; customer?: Customer }
  | { kind: 'charge' | 'pay'; customer: Customer }
  | null;

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

  const list = customersApi.useList({ search: debouncedSearch || undefined, has_balance: balanceOnly || undefined, page, page_size: pageSize });
  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;

  const createCustomer = customersApi.useCreate({ silent: true });
  const updateCustomer = customersApi.useUpdate({ silent: true });
  const removeCustomer = customersApi.useRemove();
  const recordCharge = useRecordCharge();
  const recordPayment = useRecordCustomerPayment();

  const closeDialog = () => {
    setDialog(null);
    createCustomer.reset();
    updateCustomer.reset();
    recordCharge.reset();
    recordPayment.reset();
  };

  const handleSaveCustomer = (input: CustomerInput) => {
    if (dialog?.kind === 'edit' && dialog.customer) {
      updateCustomer.mutate({ id: dialog.customer.id, input }, { onSuccess: () => { notify(`${input.name} updated`); closeDialog(); } });
    } else {
      createCustomer.mutate(input, { onSuccess: () => { notify(`${input.name} registered`); closeDialog(); } });
    }
  };

  const handleCharge = (input: ChargeInput) => {
    if (dialog?.kind !== 'charge') return;
    recordCharge.mutate(
      { id: dialog.customer.id, input },
      { onSuccess: () => { notify(`Rs. ${Number(input.amount).toLocaleString()} charged to ${dialog.customer.name}`); closeDialog(); } }
    );
  };

  const handlePay = (input: PaymentInput) => {
    if (dialog?.kind !== 'pay') return;
    recordPayment.mutate(
      { id: dialog.customer.id, input },
      { onSuccess: () => { notify(`Payment of Rs. ${Number(input.amount).toLocaleString()} recorded for ${dialog.customer.name}`); closeDialog(); } }
    );
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    removeCustomer.mutate(pendingDelete.id, { onSuccess: () => { notify(`${pendingDelete.name} deleted`); setPendingDelete(null); } });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">groups</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Farmers &amp; Customers</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">{total} Registered</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Manage customer contacts and khata credit limits.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => setDialog({ kind: 'create' })}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Register New Farmer</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row gap-space-sm">
        <div className="flex-1 relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[20px]">search</span>
          <input
            className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
            placeholder="Search by name, phone, CNIC, or village..."
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
        <label className="flex items-center gap-2 h-[40px] px-space-md rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md cursor-pointer select-none">
          <input checked={balanceOnly} className="accent-primary" onChange={(e) => { setBalanceOnly(e.target.checked); setPage(1); }} type="checkbox" />
          Outstanding balance only
        </label>
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[220px]">Farmer / Customer</th>
                <th className="py-space-sm px-space-sm min-w-[150px]">Contact</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Credit Limit</th>
                <th className="py-space-sm px-space-sm text-right min-w-[110px]">Outstanding</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={5}>Loading customers...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={5}>
                    {getErrorMessage(list.error, 'Could not load customers.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={5}>No customers match these filters.</td></tr>
              )}
              {rows.map((c) => (
                <tr className="hover:bg-surface-container-low/60 transition-colors group" key={c.id}>
                  <td className="py-3 pl-space-md pr-space-sm">
                    <button className="flex items-center gap-space-sm text-left cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)} type="button">
                      <div className="w-9 h-9 rounded-lg bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center shrink-0 font-label-md text-label-md font-semibold">
                        {initialsOf(c.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors">{c.name}</span>
                        <span className="font-body-sm text-body-sm text-outline truncate">{c.village || '—'}</span>
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className="font-label-md text-label-md text-on-surface">{c.phone || '—'}</span>
                    <span className="block font-body-sm text-body-sm text-outline">{c.cnic || '—'}</span>
                  </td>
                  <td className="py-3 px-space-sm text-right font-currency-cell text-currency-cell text-outline">{rs(c.credit_limit)}</td>
                  <td className="py-3 px-space-sm text-right">
                    <span className={`font-currency-cell text-currency-cell font-bold ${Number(c.outstanding_balance) > 0 ? 'text-error' : 'text-success'}`}>{rs(c.outstanding_balance)}</span>
                    {c.over_credit_limit && (
                      <span className="block font-label-sm text-label-sm text-warning">Over limit</span>
                    )}
                  </td>
                  <td className="py-3 pr-space-md pl-space-xs text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button className="h-8 px-2.5 rounded-lg hover:bg-surface-container-high text-outline hover:text-primary text-label-sm font-label-sm cursor-pointer erp-btn-press" onClick={() => setDialog({ kind: 'pay', customer: c })} type="button">
                        Pay
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer erp-btn-press" type="button">
                            <span className="material-symbols-outlined text-[18px]">more_vert</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => navigate(`/customers/${c.id}`)}>View profile</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'charge', customer: c })}>Record credit sale</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', customer: c })}>Edit details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setPendingDelete(c)} variant="destructive">Delete customer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination noun="customers" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} page={page} pageSize={pageSize} total={total} />
      </div>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <CustomerFormDialog
          customer={dialog.customer}
          error={dialog.kind === 'edit' ? updateCustomer.error : createCustomer.error}
          onClose={closeDialog}
          onSubmit={handleSaveCustomer}
          saving={createCustomer.isPending || updateCustomer.isPending}
        />
      )}

      {dialog?.kind === 'charge' && (
        <ChargeDialog customerName={dialog.customer.name} error={recordCharge.error} onClose={closeDialog} onSubmit={handleCharge} saving={recordCharge.isPending} />
      )}

      {dialog?.kind === 'pay' && (
        <CustomerPaymentDialog
          customerName={dialog.customer.name}
          error={recordPayment.error}
          onClose={closeDialog}
          onSubmit={handlePay}
          outstandingBalance={dialog.customer.outstanding_balance}
          saving={recordPayment.isPending}
        />
      )}

      <ConfirmDialog
        confirmLabel="Delete customer"
        description={`"${pendingDelete?.name ?? ''}" will be removed from the directory. This is blocked while it has khata history.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        open={pendingDelete !== null}
        pending={removeCustomer.isPending}
        title="Delete this customer?"
      />
    </div>
  );
};

export default CustomersPage;
