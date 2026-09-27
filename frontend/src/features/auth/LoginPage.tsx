import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from './store';
import { loginApi } from './api';
import { loginSchema, type LoginFormData } from './schemas';

const loginErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return 'Incorrect email or password.';
    if (error.response?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'Sign in failed. Please try again.';
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loginStore = useAuthStore((state) => state.login);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [rememberTerminal, setRememberTerminal] = useState(true);
  const [isAuthenticatedNow, setIsAuthenticatedNow] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  if (isAuthenticated && !isAuthenticatedNow) {
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (values: LoginFormData) => {
    setFormError(null);
    try {
      const data = await loginApi(values);
      setIsAuthenticatedNow(true);
      loginStore(data, rememberTerminal);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(loginErrorMessage(error));
    }
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
              <form className="flex flex-col gap-space-lg" noValidate onSubmit={handleSubmit(onSubmit)}>
                {/* Email or ID */}
                <div>
                  <label
                    className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-xs"
                    htmlFor="usernameInput"
                  >
                    Email Address
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px] pointer-events-none">
                      badge
                    </span>
                    <input
                      className="w-full h-[40px] pl-[42px] pr-space-md rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline outline-none shadow-sm focus:bg-surface-container-low transition-colors"
                      id="usernameInput"
                      placeholder="owner@pesticideclub.com"
                      autoComplete="username"
                      type="email"
                      aria-invalid={Boolean(errors.email)}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-space-xs font-label-sm text-label-sm text-error" role="alert">{errors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-space-xs">
                    <label
                      className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"
                      htmlFor="passwordInput"
                    >
                      Password
                    </label>
                    <button
                      className="font-label-sm text-label-sm text-primary hover:underline cursor-pointer"
                      onClick={() => toast.info('Password resets are handled by the shop owner. Please contact them.')}
                      type="button"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-space-md text-on-surface-variant text-[20px] pointer-events-none">
                      lock
                    </span>
                    <input
                      className="w-full h-[40px] pl-[42px] pr-[42px] rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-outline outline-none shadow-sm focus:bg-surface-container-low transition-colors"
                      id="passwordInput"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      type={showPassword ? 'text' : 'password'}
                      aria-invalid={Boolean(errors.password)}
                      {...register('password')}
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
                  {errors.password && (
                    <p className="mt-space-xs font-label-sm text-label-sm text-error" role="alert">{errors.password.message}</p>
                  )}
                </div>

                {formError && (
                  <div className="rounded-lg bg-error-container px-space-md py-space-sm font-body-sm text-body-sm text-on-error-container" role="alert">
                    {formError}
                  </div>
                )}

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
                    isAuthenticatedNow
                      ? 'bg-secondary'
                      : isSubmitting
                      ? 'bg-primary-container opacity-90'
                      : 'bg-primary-container hover:bg-primary'
                  }`}
                  disabled={isSubmitting}
                  id="signInBtn"
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Authenticating Terminal...</span>
                    </>
                  ) : isAuthenticatedNow ? (
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
