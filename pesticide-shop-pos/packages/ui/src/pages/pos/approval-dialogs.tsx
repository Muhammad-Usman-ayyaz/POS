import type { Api, ApprovalAction, Input } from '@pos/api-contract';
import { useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../i18n/index.js';
import { Actions, Chip, DialogInput, FieldLabel } from './counter-ui.js';

export interface OverLimitFacts {
  name: string;
  /** What they owe now. */
  owed: number;
  /** What this bill leaves on Khata. */
  adds: number;
  limit: number;
}

/** "Take at least Rs 1,050 more now, or ask the owner to approve." with the amount in bold (the sentence comes from the messages; the amount is found in it). */
function WithBoldAmount({ text, amount }: { text: string; amount: string }) {
  const at = text.indexOf(amount);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="num">{amount}</b>
      {text.slice(at + amount.length)}
    </>
  );
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
    <Dialog counter open title={t.title} eyebrow={t.eyebrow} lead={t.lead(facts.name, money(facts.owed), money(facts.adds))} onClose={onClose}>
      <dl className="flex flex-col gap-1.5 rounded-md bg-warn-bg px-4 py-3.5 text-warn-deep">
        <div className="flex justify-between gap-3 font-bold">
          <dt className="text-muted">{t.afterSale}</dt>
          <dd className="num text-warn-deep">{money(after)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t.creditLimit}</dt>
          <dd className="num">{money(facts.limit)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-bold">
          <dt className="text-muted">{t.overBy}</dt>
          <dd data-over-by className="num text-danger-ink">
            {money(over)}
          </dd>
        </div>
      </dl>
      {takeable > 0 && (
        <p className="text-sm text-ink-mid">
          <WithBoldAmount text={t.hint(money(takeable))} amount={money(takeable)} />
        </p>
      )}
      {/* No Cancel, as in the design: Escape or a press outside closes the box. */}
      <Actions>
        {takeable > 0 && (
          <Button variant="secondary" size="dialog" className="border-warn-edge text-warn-deep" onClick={() => onTakeMore(takeable)}>
            {t.take(money(takeable))}
          </Button>
        )}
        {isOwner ? (
          <Button size="dialog" onClick={onAllow}>
            {t.allow}
          </Button>
        ) : (
          <Button size="dialog" onClick={onAsk}>
            {t.askOwner}
          </Button>
        )}
      </Actions>
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
  overLimit,
  onGranted,
  onClose,
}: {
  api: Api;
  actions: readonly ApprovalAction[];
  subject: Input<'approval:request'>['sale'];
  /** What the bill leaves the customer owing and the limit, so the chip can say "Over credit limit · Rs 11,050 of Rs 10,000". */
  overLimit?: { after: number; limit: number } | undefined;
  onGranted: (token: string) => void;
  onClose: () => void;
}) {
  const { m, language } = useI18n();
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
    <Dialog counter open title={t.title} eyebrow={t.eyebrow} lead={t.lead} onClose={onClose}>
      <ul className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a}>
            <Chip tone="warn" className="px-3 py-1 text-[13px]">
              {a === 'credit_override' && overLimit ? t.overChip(formatMoney(overLimit.after, language), formatMoney(overLimit.limit, language)) : t.actions[a]}
            </Chip>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <FieldLabel htmlFor="approval-username">{t.username}</FieldLabel>
          <DialogInput id="approval-username" name="username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} className="num" />
        </div>
        <div>
          <FieldLabel htmlFor="approval-password">{t.password}</FieldLabel>
          <DialogInput id="approval-password" name="password" type="password" autoComplete="off" aria-describedby="approval-password-hint" value={password} onChange={(e) => setPassword(e.target.value)} className="num" />
        </div>
        <p id="approval-password-hint" className="text-[13px] text-muted">
          {t.hint}
        </p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button variant="secondary" size="dialog" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" size="dialog" disabled={busy || username.trim() === '' || password === ''}>
            {busy ? t.approving : t.approve}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
