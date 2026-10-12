import type { Api, AppState, Language, SessionUser } from '@pos/api-contract';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/app-shell.js';
import { ErrorNotice, ToastProvider } from '../components/feedback.js';
import { NAV_ITEMS } from '../components/sidebar.js';
import { I18nProvider, useI18n } from '../i18n/index.js';
import { LoginPage } from '../pages/login-page.js';
import { PlaceholderPage } from '../pages/placeholder-page.js';
import { InvoicesPage } from '../pages/invoices/invoices-page.js';
import { PrintActions } from '../pages/invoices/print-actions.js';
import { PosPage } from '../pages/pos/pos-page.js';
import { ProductFormPage } from '../pages/products/product-form-page.js';
import { ProductsPage } from '../pages/products/products-page.js';
import { PurchasesPage } from '../pages/purchases/purchases-page.js';
import { ReceiveStockPage } from '../pages/purchases/receive-stock-page.js';
import { SettingsPage } from '../pages/settings/settings-page.js';
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
          <Route path="/pos" element={<PosPage api={api} user={user} receiptActions={(sale) => <PrintActions api={api} invoiceId={sale.invoice.id} kinds={['receipt']} />} />} />
          <Route path="/invoices" element={<InvoicesPage api={api} user={user} />} />
          <Route path="/products" element={<ProductsPage api={api} user={user} />} />
          <Route path="/products/new" element={<ProductFormPage api={api} user={user} />} />
          <Route path="/products/:groupId/edit" element={<ProductFormPage api={api} user={user} />} />
          <Route path="/purchases" element={<PurchasesPage user={user} />} />
          <Route path="/purchases/receive" element={<ReceiveStockPage api={api} user={user} />} />
          <Route path="/settings" element={<SettingsPage api={api} user={user} />} />
          {NAV_ITEMS.filter(({ key }) => key !== 'pos' && key !== 'invoices' && key !== 'products' && key !== 'purchases' && key !== 'settings').map(({ key, path }) => (
            <Route key={key} path={path} element={<PlaceholderPage page={key} />} />
          ))}
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
