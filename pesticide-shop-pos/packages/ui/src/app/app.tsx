import type { Api, AppState, Language, SessionUser } from '@pos/api-contract';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/app-shell.js';
import { ErrorNotice, ToastProvider } from '../components/feedback.js';
import { NAV_ITEMS } from '../components/sidebar.js';
import { I18nProvider, useI18n } from '../i18n/index.js';
import { LoginPage } from '../pages/login-page.js';
import { PlaceholderPage } from '../pages/placeholder-page.js';
import { ResetPage } from '../pages/reset-page.js';
import { SetupPage } from '../pages/setup-page.js';

/**
 * The whole app. It asks the shell which screen to show first (set up the shop, sign in, or the app itself) and
 * keeps the language in sync with the preference the shell remembers.
 */
export function App({ api }: { api: Api }) {
  const [state, setState] = useState<AppState | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.app.getState());
    } catch (e) {
      setBootError(e);
    }
  }, [api]);
  useEffect(() => void refresh(), [refresh]);

  // Switch at once on screen, and ask the shell to remember it for next time.
  const changeLanguage = useCallback(
    (language: Language) => {
      setState((s) => (s ? { ...s, language } : s));
      api.prefs.setLanguage({ language }).catch(() => undefined);
    },
    [api],
  );

  return (
    <I18nProvider language={state?.language ?? 'en'} onLanguageChange={changeLanguage}>
      <ToastProvider>
        <Screens api={api} state={state} bootError={bootError} refresh={refresh} />
      </ToastProvider>
    </I18nProvider>
  );
}

function Screens({ api, state, bootError, refresh }: { api: Api; state: AppState | null; bootError: unknown; refresh: () => Promise<void> }) {
  const { m } = useI18n();
  const [resetting, setResetting] = useState(false);

  if (bootError) {
    return (
      <div className="grid min-h-screen place-items-center p-8">
        <ErrorNotice error={bootError} className="max-w-lg" />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="stagger text-xl font-semibold text-muted">{m.loading}</p>
      </div>
    );
  }

  if (state.phase === 'needs-setup') {
    return <SetupPage api={api} onDone={() => void refresh()} />;
  }

  const shopName = state.shop?.name ?? m.appName;
  const deviceText = state.device ? `${state.device.name} · ${state.device.code}` : '';

  if (state.phase === 'needs-login' || !state.user) {
    return resetting ? (
      <ResetPage api={api} shopName={shopName} deviceText={deviceText} onBack={() => setResetting(false)} />
    ) : (
      <LoginPage api={api} shopName={shopName} deviceText={deviceText} onSignedIn={() => void refresh()} onForgot={() => setResetting(true)} />
    );
  }

  return <SignedIn api={api} user={state.user} shopName={shopName} deviceText={deviceText} onSignedOut={() => void refresh()} />;
}

function SignedIn({ api, user, shopName, deviceText, onSignedOut }: { api: Api; user: SessionUser; shopName: string; deviceText: string; onSignedOut: () => void }) {
  const signOut = () => void api.auth.logout().then(onSignedOut);
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell shopName={shopName} deviceText={deviceText} user={user} onSignOut={signOut} />}>
          <Route index element={<Navigate to="/pos" replace />} />
          {NAV_ITEMS.map(({ key, path }) => (
            <Route key={key} path={path} element={<PlaceholderPage page={key} />} />
          ))}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
