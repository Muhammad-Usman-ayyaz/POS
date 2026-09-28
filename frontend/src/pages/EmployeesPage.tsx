import React, { useState } from 'react';
import { employees as employeesApi, useReactivateEmployee } from '@/features/employees/api';
import { EmployeeFormDialog } from '@/features/employees/components/EmployeeFormDialog';
import { ROLE_LABELS, type Employee, type EmployeeInput } from '@/features/employees/types';
import { useAuthStore } from '@/features/auth/store';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-primary-fixed text-on-primary-fixed-variant',
  MANAGER: 'bg-secondary/15 text-secondary',
  ACCOUNTANT: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  SALESMAN: 'bg-surface-container-high text-on-surface-variant',
};

type DialogState = { mode: 'create' | 'edit'; employee?: Employee } | null;

export const EmployeesPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<Employee | null>(null);

  const list = employeesApi.useList({ search: debouncedSearch || undefined, page_size: 100 });
  const rows = list.data?.results ?? [];

  const createEmployee = employeesApi.useCreate({ silent: true });
  const updateEmployee = employeesApi.useUpdate({ silent: true });
  const removeEmployee = employeesApi.useRemove();
  const reactivateEmployee = useReactivateEmployee();
  const saving = createEmployee.isPending || updateEmployee.isPending;

  const closeDialog = () => {
    setDialog(null);
    createEmployee.reset();
    updateEmployee.reset();
  };

  const handleSave = (input: EmployeeInput) => {
    if (dialog?.mode === 'edit' && dialog.employee) {
      updateEmployee.mutate(
        { id: dialog.employee.id, input },
        { onSuccess: () => { notify(`${input.name} updated`); closeDialog(); } }
      );
    } else {
      createEmployee.mutate(input, { onSuccess: () => { notify(`${input.name} added`); closeDialog(); } });
    }
  };

  const handleDeactivate = () => {
    if (!pendingDeactivate) return;
    removeEmployee.mutate(pendingDeactivate.id, {
      onSuccess: () => { notify(`${pendingDeactivate.name} deactivated`); setPendingDeactivate(null); },
      onError: (err) => notifyError(getErrorMessage(err, 'Could not deactivate this employee.')),
    });
  };

  const handleReactivate = (employee: Employee) => {
    reactivateEmployee.mutate(employee.id, {
      onSuccess: () => notify(`${employee.name} reactivated`),
      onError: (err) => notifyError(getErrorMessage(err, 'Could not reactivate this employee.')),
    });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md erp-animate-page">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex flex-col lg:flex-row lg:items-center justify-between gap-space-md p-space-lg rounded-xl shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">badge</span>
          </div>
          <div>
            <div className="flex items-center gap-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Employees</h1>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm">{rows.length} Total</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline">Staff accounts, roles, and access to the shop system.</p>
          </div>
        </div>
        <button
          className="h-[38px] px-space-md rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md flex items-center gap-1.5 shadow-sm cursor-pointer w-fit erp-btn-press"
          onClick={() => setDialog({ mode: 'create' })}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Add Employee</span>
        </button>
      </div>

      <div className="erp-stagger-item erp-stagger-2 glass-toolbar p-space-md rounded-xl shadow-sm relative flex items-center">
        <span className="material-symbols-outlined absolute left-6 text-outline text-[20px]">search</span>
        <input
          className="w-full h-[40px] pl-10 pr-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          placeholder="Search by name..."
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-outline font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm pl-space-md pr-space-sm min-w-[200px]">Employee</th>
                <th className="py-space-sm px-space-sm min-w-[140px]">Role</th>
                <th className="py-space-sm px-space-sm min-w-[100px]">Status</th>
                <th className="py-space-sm pr-space-md pl-space-xs text-center min-w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {list.isPending && <tr><td className="py-space-xl text-center text-outline" colSpan={4}>Loading employees...</td></tr>}
              {list.isError && (
                <tr>
                  <td className="py-space-xl text-center text-error" colSpan={4}>
                    {getErrorMessage(list.error, 'Could not load employees.')}{' '}
                    <button className="text-primary underline cursor-pointer" onClick={() => list.refetch()} type="button">Retry</button>
                  </td>
                </tr>
              )}
              {list.isSuccess && rows.length === 0 && (
                <tr><td className="py-space-xl text-center text-outline" colSpan={4}>No employees match this search.</td></tr>
              )}
              {rows.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-container-low/60 transition-colors group">
                  <td className="py-3 pl-space-md pr-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <div className="w-9 h-9 rounded-lg bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center shrink-0 font-label-md text-label-md font-semibold">
                        {initialsOf(emp.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors">
                          {emp.name}{emp.id === currentUser?.id && <span className="text-outline font-body-sm text-body-sm font-normal"> (You)</span>}
                        </span>
                        <span className="font-body-sm text-body-sm text-outline truncate">{emp.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm font-semibold ${ROLE_BADGE[emp.role]}`}>{ROLE_LABELS[emp.role]}</span>
                  </td>
                  <td className="py-3 px-space-sm">
                    <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold inline-block ${emp.is_active ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                      {emp.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="py-3 pr-space-md pl-space-xs text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-8 h-8 rounded-lg hover:bg-surface-container-high text-outline hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer erp-btn-press" type="button">
                          <span className="material-symbols-outlined text-[18px]">more_vert</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ mode: 'edit', employee: emp })}>Edit / Reset Password</DropdownMenuItem>
                        {emp.is_active ? (
                          <DropdownMenuItem
                            disabled={emp.id === currentUser?.id}
                            onSelect={() => setPendingDeactivate(emp)}
                            variant="destructive"
                          >
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => handleReactivate(emp)}>Reactivate</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && currentUser && (
        <EmployeeFormDialog
          currentUserRole={currentUser.role}
          employee={dialog.employee}
          error={dialog.mode === 'edit' ? updateEmployee.error : createEmployee.error}
          onClose={closeDialog}
          onSubmit={handleSave}
          saving={saving}
        />
      )}

      <ConfirmDialog
        confirmLabel="Deactivate"
        description={`${pendingDeactivate?.name ?? ''} will no longer be able to sign in. Their name stays on past sales, purchases, and adjustments. This can be undone.`}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivate}
        open={pendingDeactivate !== null}
        pending={removeEmployee.isPending}
        title="Deactivate this employee?"
      />
    </div>
  );
};

export default EmployeesPage;
