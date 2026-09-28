import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { UserRole } from '@/types/auth';
import { getErrorMessage } from '@/lib/apiError';
import { ROLE_LABELS, type Employee, type EmployeeInput } from '../types';

interface EmployeeFormDialogProps {
  employee?: Employee;
  currentUserRole: UserRole;
  saving: boolean;
  error: unknown;
  onSubmit: (input: EmployeeInput) => void;
  onClose: () => void;
}

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

const ASSIGNABLE_ROLES: UserRole[] = ['MANAGER', 'SALESMAN', 'ACCOUNTANT', 'OWNER'];

export const EmployeeFormDialog: React.FC<EmployeeFormDialogProps> = ({ employee, currentUserRole, saving, error, onSubmit, onClose }) => {
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    role: (employee?.role ?? 'SALESMAN') as UserRole,
    password: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const assignableRoles = ASSIGNABLE_ROLES.filter((r) => r !== 'OWNER' || currentUserRole === 'OWNER' || employee?.role === 'OWNER');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: EmployeeInput = { name: form.name, email: form.email, role: form.role };
    if (form.password) input.password = form.password;
    onSubmit(input);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          <DialogDescription>{employee ? "Update this employee's details, role, or password." : 'Create a login for a new staff member.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-space-md">
          <fieldset disabled={saving} className="contents">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="empName">Full Name <span className="text-error">*</span></label>
              <input className={inputClass} id="empName" required type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="empEmail">Email <span className="text-error">*</span></label>
              <input className={inputClass} id="empEmail" required type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="empRole">Role <span className="text-error">*</span></label>
                <select className={inputClass} id="empRole" value={form.role} onChange={(e) => set({ role: e.target.value as UserRole })}>
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="empPassword">
                  {employee ? 'Reset Password' : 'Password'} {!employee && <span className="text-error">*</span>}
                </label>
                <input
                  className={inputClass} id="empPassword" minLength={8} placeholder={employee ? 'Leave blank to keep current' : ''}
                  required={!employee} type="password" value={form.password} onChange={(e) => set({ password: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          {error != null && (
            <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
              {getErrorMessage(error)}
            </div>
          )}

          <DialogFooter>
            <button
              className="h-10 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md cursor-pointer erp-btn-press"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-10 px-space-lg rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer erp-btn-press disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving...' : employee ? 'Save Changes' : 'Create Employee'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeFormDialog;
