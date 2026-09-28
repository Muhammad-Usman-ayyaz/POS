import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changePasswordApi } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import { ROLE_LABELS } from '@/features/employees/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getErrorMessage } from '@/lib/apiError';
import { notify, notifyError } from '@/lib/notify';

const inputClass =
  'w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container';

export const SettingsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: changePasswordApi,
    onSuccess: () => {
      notify('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => notifyError(getErrorMessage(err, 'Could not update your password.')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      notifyError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError('New passwords do not match.');
      return;
    }
    changePassword.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  return (
    <div className="flex flex-col w-full gap-y-space-md erp-animate-page max-w-3xl">
      <div className="erp-stagger-item erp-stagger-1 glass-card flex items-center gap-space-sm p-space-lg rounded-xl shadow-sm">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[24px]">settings</span>
        </div>
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
          <p className="font-body-sm text-body-sm text-outline">Your account, security, and how the app looks.</p>
        </div>
      </div>

      <section className="erp-stagger-item erp-stagger-2 glass-card p-space-lg rounded-xl shadow-sm flex flex-col gap-space-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">My Account</h2>
        <div className="grid sm:grid-cols-2 gap-space-md">
          <div>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Name</span>
            <p className="font-body-md text-body-md text-on-surface mt-0.5">{user?.name}</p>
          </div>
          <div>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Email</span>
            <p className="font-body-md text-body-md text-on-surface mt-0.5">{user?.email}</p>
          </div>
          <div>
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">Role</span>
            <p className="font-body-md text-body-md text-on-surface mt-0.5">{user ? ROLE_LABELS[user.role] : '—'}</p>
          </div>
        </div>
      </section>

      <section className="erp-stagger-item erp-stagger-3 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col gap-space-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Change Password</h2>
        <form className="flex flex-col gap-space-sm max-w-sm" onSubmit={handleSubmit}>
          <fieldset disabled={changePassword.isPending} className="contents">
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="currentPassword">Current Password</label>
              <input className={inputClass} id="currentPassword" required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="newPassword">New Password</label>
              <input className={inputClass} id="newPassword" minLength={8} required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-1" htmlFor="confirmPassword">Confirm New Password</label>
              <input className={inputClass} id="confirmPassword" minLength={8} required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </fieldset>
          <button
            className="h-10 px-space-lg mt-1 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm cursor-pointer erp-btn-press disabled:opacity-60 w-fit"
            disabled={changePassword.isPending}
            type="submit"
          >
            {changePassword.isPending ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>

      <section className="erp-stagger-item erp-stagger-4 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col gap-space-md">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Appearance</h2>
          <p className="font-body-sm text-body-sm text-outline">Choose how Pesticide Club ERP looks on this device.</p>
        </div>
        <ThemeToggle />
      </section>
    </div>
  );
};

export default SettingsPage;
