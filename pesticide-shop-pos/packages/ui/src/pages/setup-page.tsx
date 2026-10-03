import type { Api, SessionUser } from '@pos/api-contract';
import { useState, type FormEvent } from 'react';
import { ErrorNotice } from '../components/feedback.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Field } from '../components/ui/primitives.js';
import { useI18n } from '../i18n/index.js';
import { RecoveryCodeStep } from './recovery-code-step.js';
import { SplitLayout } from './split-layout.js';

const USERNAME = /^[a-z0-9._-]{3,32}$/;

/**
 * First launch: the shop name, the owner, and the owner's login. Styled like Sign in. After the shop is created
 * the owner sees the one-time recovery code and must write it down before going on.
 */
export function SetupPage({ api, onDone }: { api: Api; onDone: (user: SessionUser) => void }) {
  const { m } = useI18n();
  const [form, setForm] = useState({ shopName: '', ownerName: '', username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ user: SessionUser; recoveryCode: string } | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const username = form.username.trim().toLowerCase();
  const problems = {
    shopName: !form.shopName.trim() ? m.validation.required : undefined,
    ownerName: !form.ownerName.trim() ? m.validation.required : undefined,
    username: !USERNAME.test(username) ? m.validation.usernameFormat : undefined,
    password: form.password.length < 8 ? m.validation.passwordShort : undefined,
    confirm: form.confirm !== form.password ? m.validation.passwordMismatch : undefined,
  };
  const invalid = Object.values(problems).some(Boolean);
  const show = (key: keyof typeof problems) => (touched ? problems[key] : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.setup.createShop({ shopName: form.shopName, ownerName: form.ownerName, username, password: form.password });
      setForm((f) => ({ ...f, password: '', confirm: '' }));
      setCreated(result);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SplitLayout eyebrow={m.setup.eyebrow} title={m.setup.title} tagline={m.setup.tagline} footer={m.setup.thisComputer} heading={created ? m.recovery.title : m.setup.title}>
      {created ? (
        <RecoveryCodeStep code={created.recoveryCode} lead={m.recovery.lead} onDone={() => onDone(created.user)} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 [@media(max-height:800px)]:gap-3">
          <Field id="shopName" label={m.setup.shopName} error={show('shopName')} className="stagger">
            <Input id="shopName" autoFocus value={form.shopName} onChange={set('shopName')} invalid={!!show('shopName')} />
          </Field>
          <Field id="ownerName" label={m.setup.ownerName} error={show('ownerName')} className="stagger">
            <Input id="ownerName" value={form.ownerName} onChange={set('ownerName')} invalid={!!show('ownerName')} />
          </Field>
          <Field id="username" label={m.setup.username} hint={m.setup.usernameHint} error={show('username')} className="stagger">
            <Input id="username" autoComplete="username" value={form.username} onChange={set('username')} invalid={!!show('username')} dir="ltr" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="password" label={m.setup.password} hint={m.setup.passwordHint} error={show('password')} className="stagger">
              <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!show('password')} dir="ltr" />
            </Field>
            <Field id="confirm" label={m.setup.confirmPassword} error={show('confirm')} className="stagger">
              <Input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} invalid={!!show('confirm')} dir="ltr" />
            </Field>
          </div>

          {error ? <ErrorNotice error={error} /> : null}

          <Button type="submit" size="xl" disabled={busy} className="stagger w-full">
            {busy ? m.setup.submitting : m.setup.submit}
          </Button>
        </form>
      )}
    </SplitLayout>
  );
}
