import type { Api } from '@pos/api-contract';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '../components/feedback.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Field } from '../components/ui/primitives.js';
import { useI18n } from '../i18n/index.js';
import { RecoveryCodeStep } from './recovery-code-step.js';
import { SplitLayout } from './split-layout.js';

/** The owner forgot the password: type the recovery code, choose a new password, write down the NEW code. */
export function ResetPage({ api, shopName, deviceText, onBack }: { api: Api; shopName: string; deviceText: string; onBack: () => void }) {
  const { m } = useI18n();
  const [form, setForm] = useState({ username: '', code: '', password: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const problems = {
    username: !form.username.trim() ? m.validation.required : undefined,
    code: form.code.replace(/[^0-9a-z]/gi, '').length !== 20 ? m.validation.codeFormat : undefined,
    password: form.password.length < 8 ? m.validation.passwordShort : undefined,
  };
  const show = (key: keyof typeof problems) => (touched ? problems[key] : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.auth.resetOwnerPassword({ username: form.username, recoveryCode: form.code, newPassword: form.password });
      setForm({ username: form.username, code: '', password: '' });
      setNewCode(result.recoveryCode);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SplitLayout eyebrow={m.login.eyebrow} title={shopName} tagline={m.login.tagline} footer={deviceText} heading={newCode ? m.reset.doneTitle : m.reset.title}>
      {newCode ? (
        <RecoveryCodeStep code={newCode} lead={m.reset.doneLead} continueLabel={m.reset.signIn} onDone={onBack} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 [@media(max-height:800px)]:gap-3">
          <p className="text-base text-muted">{m.reset.lead}</p>
          <Field id="username" label={m.reset.username} error={show('username')} className="stagger">
            <Input id="username" autoFocus autoComplete="username" value={form.username} onChange={set('username')} invalid={!!show('username')} dir="ltr" />
          </Field>
          <Field id="code" label={m.reset.code} error={show('code')} className="stagger">
            <Input id="code" autoComplete="off" spellCheck={false} value={form.code} onChange={set('code')} invalid={!!show('code')} dir="ltr" className="num uppercase tracking-widest" />
          </Field>
          <Field id="newPassword" label={m.reset.newPassword} hint={m.setup.passwordHint} error={show('password')} className="stagger">
            <Input id="newPassword" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!show('password')} dir="ltr" />
          </Field>

          {error ? <ErrorNotice error={error} /> : null}

          <Button type="submit" size="xl" disabled={busy} className="w-full">
            {busy ? m.reset.submitting : m.reset.submit}
          </Button>
          <button type="button" onClick={onBack} className="min-h-11 self-start rounded-sm font-semibold text-accent underline-offset-4 hover:underline">
            {m.reset.back}
          </button>
        </form>
      )}
    </SplitLayout>
  );
}
