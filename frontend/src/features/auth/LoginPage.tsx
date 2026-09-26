import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './store';
import type { UserRole } from '@/types/auth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);

  const [role, setRole] = useState<'Owner' | 'Manager' | 'Salesman' | 'Accountant'>('Owner');
  const [username, setUsername] = useState('owner@pesticideclub.com');
  const [password, setPassword] = useState('SecureTerminalAccess2024');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberTerminal, setRememberTerminal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleRoleChange = (selectedRole: 'Owner' | 'Manager' | 'Salesman' | 'Accountant') => {
    setRole(selectedRole);
    if (selectedRole === 'Owner') setUsername('owner@pesticideclub.com');
    else if (selectedRole === 'Manager') setUsername('manager@pesticideclub.com');
    else if (selectedRole === 'Salesman') setUsername('pos@pesticideclub.com');
    else if (selectedRole === 'Accountant') setUsername('accountant@pesticideclub.com');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsAuthenticated(true);

      const mappedRole: UserRole =
        role === 'Owner'
          ? 'OWNER'
          : role === 'Manager'
          ? 'MANAGER'
          : role === 'Salesman'
          ? 'SALESMAN'
          : 'ACCOUNTANT';

      loginStore({
        access: 'mock_jwt_access_token_' + Date.now(),
        refresh: 'mock_jwt_refresh_token_' + Date.now(),
        user: {
          id: 1,
          email: username,
          name: role === 'Owner' ? 'Muhammad Khan' : `${role} Operator`,
          role: mappedRole,
          is_active: true,
        },
      });

      setTimeout(() => {
        navigate('/dashboard');
      }, 700);
    }, 900);
  };

  return (
    <main className="w-full min-h-screen flex items-center justify-center p-gutter bg-surface">
      <div className="flex flex-col w-full">
        <div className="w-full flex items-center justify-center py-space-xl">
          <div className="w-full max-w-[460px] flex flex-col items-center">
            {/* Brand Header */}
            <div className="flex flex-col items-center text-center mb-space-xl">
              <div className="w-16 h-16 rounded-xl bg-surface-container-low p-space-xs shadow-sm flex items-center justify-center mb-space-md transition-transform hover:scale-105 duration-200">
                <img
                  alt="Pesticide Club Logo"
                  className="w-full h-full object-contain"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDx6C6tbE8rGoIj7PtvO7ATDSW0mQl2crdSrE0tm3xhFa-OpplAbc5JzT6QxmpjE-tAKyEep6KdFtN_4poE8TgbESWXd881scoeEYwV8v3PatCYp3KNvkQdVc7Mv_wqXAJAtW3lBln__rHRnbTKkiBglMYi_YLrMUFoRJNwW3FgVy0UeRg4BgMcDuBhQhXM-_k9NqbW27owLCJZ8VVp87jv8nfS2hA4n55YvOYiLwCZeXXNEGEsPF6MyA"
                />
              </div>
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Pesticide Club</h1>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mt-space-xs">
                Agricultural Retail ERP &amp; Khata System
              </p>
            </div>

            {/* Main Login Card */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl p-space-2xl">
              {/* Title & Subtitle */}
              <div className="mb-space-xl text-left">
                <h2 className="font-headline-md text-headline-md text-on-surface">Sign In to Your Workspace</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                  Manage POS sales, batch inventory, supplier accounts &amp; farmer ledgers.
                </p>
              </div>

              {/* Form */}
              <form className="flex flex-col gap-space-lg" onSubmit={handleSubmit}>
                {/* Role Selector Chips */}
                <div>
                  <label className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-xs">
                    Operating Role
                  </label>
                  <div className="grid grid-cols-2 gap-space-xs" id="roleGroup">
                    <button
                      className={`role-pill flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full font-label-sm text-label-sm transition-all duration-150 cursor-pointer ${
                        role === 'Owner'
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => handleRoleChange('Owner')}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">storefront</span>
                      <span>Shop Owner</span>
                    </button>
                    <button
                      className={`role-pill flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full font-label-sm text-label-sm transition-all duration-150 cursor-pointer ${
                        role === 'Manager'
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => handleRoleChange('Manager')}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">domain</span>
                      <span>Branch Mgr</span>
                    </button>
                    <button
                      className={`role-pill flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full font-label-sm text-label-sm transition-all duration-150 cursor-pointer ${
                        role === 'Salesman'
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => handleRoleChange('Salesman')}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">point_of_sale</span>
                      <span>Salesman / POS</span>
                    </button>
                    <button
                      className={`role-pill flex items-center justify-center gap-space-xs py-space-xs px-space-sm rounded-full font-label-sm text-label-sm transition-all duration-150 cursor-pointer ${
                        role === 'Accountant'
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      }`}
                      onClick={() => handleRoleChange('Accountant')}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">menu_book</span>
                      <span>Accountant</span>
                    </button>
                  </div>
                </div>

                {/* Email or ID */}
                <div>
                  <label
                    className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-xs"
                    htmlFor="usernameInput"
                  >
                    Operator ID or Email
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px] pointer-events-none">
                      badge
                    </span>
                    <input
                      className="w-full h-[40px] pl-[42px] pr-space-md rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline outline-none shadow-sm focus:bg-surface-container-low transition-colors"
                      id="usernameInput"
                      placeholder="owner@pesticideclub.com or EMP-0142"
                      required
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-space-xs">
                    <label
                      className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"
                      htmlFor="passwordInput"
                    >
                      Access PIN / Password
                    </label>
                    <a className="font-label-sm text-label-sm text-primary hover:underline" href="#">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px] pointer-events-none">
                      lock
                    </span>
                    <input
                      className="w-full h-[40px] pl-[42px] pr-[42px] rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline outline-none shadow-sm focus:bg-surface-container-low transition-colors"
                      id="passwordInput"
                      placeholder="••••••••••••"
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      aria-label="Toggle password visibility"
                      className="absolute right-space-sm text-on-surface-variant hover:text-on-surface p-space-xs flex items-center justify-center transition-colors cursor-pointer"
                      onClick={() => setShowPassword(!showPassword)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Terminal Session Remember */}
                <div className="flex items-center justify-between py-space-xs">
                  <label className="flex items-center gap-space-sm cursor-pointer select-none">
                    <input
                      checked={rememberTerminal}
                      onChange={(e) => setRememberTerminal(e.target.checked)}
                      className="w-4 h-4 rounded text-primary bg-surface-container-low accent-primary cursor-pointer"
                      type="checkbox"
                    />
                    <span className="font-body-sm text-body-sm text-on-surface">Remember this terminal for 30 days</span>
                  </label>
                  <span className="font-label-sm text-label-sm text-secondary flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                    Node Synced
                  </span>
                </div>

                {/* Primary Submit Button */}
                <button
                  className={`w-full h-[44px] rounded text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm shadow-md transition-all active:scale-[0.99] cursor-pointer ${
                    isAuthenticated
                      ? 'bg-secondary'
                      : isLoading
                      ? 'bg-primary-container opacity-90'
                      : 'bg-primary-container hover:bg-primary'
                  }`}
                  disabled={isLoading}
                  id="signInBtn"
                  type="submit"
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Authenticating Terminal...</span>
                    </>
                  ) : isAuthenticated ? (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Authenticated</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Terminal</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divider Hint */}
              <div className="mt-space-xl pt-space-lg flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm bg-surface-container-low rounded-lg p-space-md">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[18px]">cell_tower</span>
                  <span>Station: Main Godown HQ</span>
                </div>
                <span className="font-currency-cell text-currency-cell text-on-surface">ID: #GW-09</span>
              </div>
            </div>

            {/* Trust Badges & System Metadata */}
            <div className="w-full mt-space-xl flex flex-wrap items-center justify-center gap-space-md text-on-surface-variant">
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-secondary text-[16px]">verified_user</span>
                <span>256-Bit SSL Encrypted</span>
              </div>
              <span className="text-outline-variant font-label-sm">•</span>
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-primary text-[16px]">cloud_sync</span>
                <span>Offline POS Sync Ready</span>
              </div>
              <span className="text-outline-variant font-label-sm">•</span>
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                <span>v2.4.0 Commercial Release</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;
