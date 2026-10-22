import type { Api, InvoiceForReturnView } from '@pos/api-contract';
import { useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Dialog } from '../../components/ui/dialog.js';
import { useI18n } from '../../i18n/index.js';
import { quantityShown } from './returns-format.js';
import { lineName } from '../../print/format.js';
import { cn } from '../../lib/cn.js';
import { Actions, DialogInput, FieldLabel } from '../pos/counter-ui.js';
import { approvalRequest, chosenLines, type Condition, type Draft } from './returns-state.js';

/**
 * Staff started the return; the owner approves it here by typing their own username and password. The owner also confirms, line by line, whether the
 * goods go back to the shelf or are written off (the resaleable decision is the owner's). The token that comes back is for exactly these lines,
 * quantities, conditions and reasons, works once, and lasts a minute (the shell decides that). The password is sent once and the box emptied.
 */
export function ReturnApprovalDialog({
  api,
  view,
  draft,
  onCondition,
  onGranted,
  onClose,
}: {
  api: Api;
  view: InvoiceForReturnView;
  draft: Draft;
  onCondition: (id: string, condition: Condition) => void;
  onGranted: (token: string) => void;
  onClose: () => void;
}) {
  const { m, language } = useI18n();
  const t = m.returns;
  const a = t.approval;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lines = chosenLines(view, draft);

  const submit = async () => {
    const request = approvalRequest(view, draft, username, password);
    if (busy || !request || username.trim() === '' || password === '') return;
    setBusy(true);
    setError(null);
    try {
      const grant = await api.approval.requestReturn(request);
      setPassword('');
      onGranted(grant.token);
    } catch (e) {
      setPassword('');
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Dialog counter open title={a.title} eyebrow={a.eyebrow} lead={a.lead} onClose={onClose} locked={busy}>
      <section aria-label={a.linesTitle} data-approval-lines>
        <h3 className="mb-2 text-sm font-bold">{a.linesTitle}</h3>
        <ul className="flex flex-col gap-2">
          {lines.map(({ line, item }) => {
            const off: Condition = line.batch_expired ? 'expired' : 'damaged';
            return (
              <li key={line.invoice_item_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <span>
                  {lineName(line, language)} <span className="num font-semibold">{quantityShown(m, language, line.base_unit, line.pack_size, item.qty)}</span>
                </span>
                <span role="group" aria-label={t.conditionLabel} className="flex gap-1.5">
                  <button
                    type="button"
                    aria-pressed={item.condition === 'resellable'}
                    disabled={line.batch_expired}
                    onClick={() => onCondition(line.invoice_item_id, 'resellable')}
                    className={cn('min-h-11 rounded-md border px-3 text-sm font-semibold disabled:opacity-55', item.condition === 'resellable' ? 'border-accent bg-tint text-accent-dark' : 'border-line')}
                  >
                    {t.backToStock}
                  </button>
                  <button
                    type="button"
                    aria-pressed={item.condition !== 'resellable'}
                    onClick={() => onCondition(line.invoice_item_id, off)}
                    className={cn('min-h-11 rounded-md border px-3 text-sm font-semibold', item.condition !== 'resellable' ? 'border-warn-edge bg-warn-bg text-warn-deep' : 'border-line')}
                  >
                    {t.writtenOff}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <FieldLabel htmlFor="return-approval-username">{a.username}</FieldLabel>
          <DialogInput id="return-approval-username" name="username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} className="num" />
        </div>
        <div>
          <FieldLabel htmlFor="return-approval-password">{a.password}</FieldLabel>
          <DialogInput id="return-approval-password" name="password" type="password" autoComplete="off" aria-describedby="return-approval-hint" value={password} onChange={(e) => setPassword(e.target.value)} className="num" />
        </div>
        <p id="return-approval-hint" className="text-[13px] text-muted">
          {a.hint}
        </p>
        {error != null && <ErrorNotice error={error} />}
        <Actions>
          <Button variant="secondary" size="dialog" onClick={onClose} disabled={busy}>
            {a.cancel}
          </Button>
          <Button type="submit" size="dialog" disabled={busy || username.trim() === '' || password === ''}>
            {busy ? a.approving : a.approve}
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
