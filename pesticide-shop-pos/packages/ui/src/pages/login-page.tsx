import type { Api, SessionUser } from '@pos/api-contract';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '../components/feedback.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Field } from '../components/ui/primitives.js';
import { useI18n } from '../i18n/index.js';
import { SplitLayout } from './split-layout.js';

/** Sign in, as in the approved design. The password is checked and the session is kept in the main process. */
export function LoginPage({ api, shopName, deviceText, onSignedIn, onForgot }: { api: Api; shopName: string; deviceText: string; onSignedIn: (user: SessionUser) => void; onForgot: () => void }) {
  const { m } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.auth.login({ username, password }));
    } catch (e) {
      setError(e);
      // Clear the password, but do not then scold the person with "Required" under an empty field they did not leave empty.
      setPassword('');
      setTouched(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SplitLayout eyebrow={m.login.eyebrow} title={shopName} tagline={m.login.tagline} footer={deviceText} heading={m.login.title}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field id="username" label={m.login.username} error={touched && !username.trim() ? m.validation.required : undefined} className="stagger">
          <Input id="username" name="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} invalid={touched && !username.trim()} dir="ltr" />
        </Field>
        <Field id="password" label={m.login.password} error={touched && !password ? m.validation.required : undefined} className="stagger">
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={touched && !password} dir="ltr" />
        </Field>

        {error ? <ErrorNotice error={error} /> : null}

        <Button type="submit" size="xl" disabled={busy} className="stagger mt-1 w-full">
          {busy ? m.login.submitting : m.login.submit}
        </Button>

        <div className="stagger flex flex-col items-start gap-1 text-base text-muted">
          <p>{m.login.forgot}</p>
          <button type="button" onClick={onForgot} className="min-h-11 rounded-sm font-semibold text-accent underline-offset-4 hover:underline">
            {m.login.useRecovery}
          </button>
        </div>
      </form>
    </SplitLayout>
  );
}
