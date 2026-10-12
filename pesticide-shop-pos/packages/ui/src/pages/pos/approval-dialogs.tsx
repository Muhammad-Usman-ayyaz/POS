import type { Api, ApprovalAction, Input } from '@pos/api-contract';
import { useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { Field } from '../../components/ui/primitives.js';
import { Input as TextInput } from '../../components/ui/input.js';
import { formatMoney, useI18n } from '../../i18n/index.js';

export interface OverLimitFacts {
  name: string;
  /** What they owe now. */
  owed: number;
  /** What this bill leaves on Khata. */
  adds: number;
  limit: number;
}

/**
 * "This sale is over the limit". The cashier can take more money now (which lowers what goes on Khata), or ask the owner. The owner
 * themselves is offered "Allow over the limit" instead (the sale is then sent with `credit_override`).
 */
export function OverLimitDialog({
  facts,
  isOwner,
  onTakeMore,
  onAsk,
  onAllow,
  onClose,
}: {
  facts: OverLimitFacts;
  isOwner: boolean;
  /** Takes this much more now. Not offered when no payment could fix it. */
  onTakeMore: (amount: number) => void;
  onAsk: () => void;
  onAllow: () => void;
  onClose: () => void;
}) {
  const { m, language } = useI18n();
  const t = m.pos.over;
  const after = facts.owed + facts.adds;
  const over = after - facts.limit;
  const takeable = over > 0 && over <= facts.adds ? over : 0;
  const money = (n: number) => formatMoney(n, language);
  return (
    <Dialog open title={t.title} onClose={onClose}>
      <p className="-mt-1 mb-1 text-sm font-semibold text-muted">{t.eyebrow}</p>
      <p className="mt-2 text-muted">{t.lead(facts.name, money(facts.owed), money(facts.adds))}</p>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-md bg-warn-bg p-4 text-warn-ink">
        <dt className="font-semibold">{t.afterSale}</dt>
        <dd className="num text-end font-bold">{money(after)}</dd>
        <dt>{t.creditLimit}</dt>
        <dd className="num text-end">{money(facts.limit)}</dd>
        <dt className="font-semibold">{t.overBy}</dt>
        <dd data-over-by className="num text-end font-bold text-danger-ink">
          {money(over)}
        </dd>
      </dl>
      {takeable > 0 && <p className="mt-4 text-muted">{t.hint(money(takeable))}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t.cancel}
        </Button>
        {takeable > 0 && (
          <Button variant="secondary" className="border-warn-ink/40 text-warn-ink" onClick={() => onTakeMore(takeable)}>
            {t.take(money(takeable))}
          </Button>
        )}
        {isOwner ? <Button onClick={onAllow}>{t.allow}</Button> : <Button onClick={onAsk}>{t.askOwner}</Button>}
      </div>
    </Dialog>
  );
}

/**
 * The owner types his own username and password at the counter. The answer is a one-use token for exactly this bill and amount, good for a
 * minute (the shell decides that). The screen never keeps the password: it is sent once and the field is emptied.
 */
export function ApprovalDialog({
  api,
  actions,
  subject,
  onGranted,
  onClose,
}: {
  api: Api;
  actions: readonly ApprovalAction[];
  subject: Input<'approval:request'>['sale'];
  onGranted: (token: string) => void;
  onClose: () => void;
}) {
  const { m } = useI18n();
  const t = m.pos.approval;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (busy || username.trim() === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      const grant = await api.approval.request({ username: username.trim(), password, actions: [...actions], sale: subject });
      setPassword('');
      onGranted(grant.token);
    } catch (e) {
      setPassword('');
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog open title={t.title} onClose={onClose}>
      <p className="-mt-1 mb-1 text-sm font-semibold text-muted">{t.eyebrow}</p>
      <p className="mt-2 text-muted">{t.lead}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a} className="rounded-full bg-warn-bg px-3 py-1 text-sm font-semibold text-warn-ink">
            {t.actions[a]}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field id="approval-username" label={t.username}>
          <TextInput id="approval-username" name="username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field id="approval-password" label={t.password} hint={t.hint}>
          <TextInput id="approval-password" name="password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error != null && <ErrorNotice error={error} />}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy || username.trim() === '' || password === ''}>
            {busy ? t.approving : t.approve}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
