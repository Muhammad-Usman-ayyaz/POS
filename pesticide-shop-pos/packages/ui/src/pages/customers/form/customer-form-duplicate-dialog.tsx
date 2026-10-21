import type { DuplicateMatchView } from '@pos/api-contract';
import { ErrorNotice } from '../../../components/feedback.js';
import { Button } from '../../../components/ui/button.js';
import { Dialog } from '../../../components/ui/dialog.js';
import { formatMoney, useI18n } from '../../../i18n/index.js';
import { balanceKind } from './customer-form-requests.js';

/**
 * The "already exists" warning (docs/design/CustomerForms.dc.html, section 1b). It never blocks: Cancel goes back to the form, Open existing
 * goes to that customer, Save as new sends the same save again with confirm_duplicate. A balance is "Owes Rs X" or "Advance Rs X", never a minus sign.
 */
export function CustomerDuplicateDialog({ matches, typedName, busy, onCancel, onOpen, onSaveNew, openLabel, error }: { error?: unknown; matches: DuplicateMatchView[] | null; typedName: string; busy: boolean; onCancel: () => void; onOpen: (customerId: string) => void; onSaveNew: () => void; openLabel?: (name: string) => string }) {
  const { m, language } = useI18n();
  const f = m.customerForm;
  if (matches === null) return null;
  const nameOf = (row: DuplicateMatchView) => ((language === 'ur' ? (row.name_ur ?? row.name_en) : (row.name_en ?? row.name_ur)) ?? '').trim();
  const sameName = matches.some((x) => x.same_name);
  return (
    <Dialog open title={sameName ? f.dupTitle(typedName) : f.dupTitlePhone} onClose={onCancel} locked={busy} counter className="max-w-[520px] bg-warn-bg">
      <ul className="flex flex-col gap-2">
        {matches.map((row) => {
          const amount = formatMoney(Math.abs(row.balance), language);
          return (
            <li key={row.customer_id} data-duplicate-row className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[15px]">
              <span>
                {[nameOf(row), row.village].filter((part) => part && part !== '').join(' · ')}
                {row.phone ? (
                  <>
                    {' · '}
                    <span dir="ltr" className="num">
                      {row.phone}
                    </span>
                  </>
                ) : null}
              </span>
              <span data-balance className="num text-[13px] font-bold">
                {balanceKind(row) === 'advance' ? f.advance(amount) : f.owes(amount)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm">{f.dupHint}</p>
      {error != null && <ErrorNotice error={error} />}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" size="dialog" disabled={busy} onClick={onCancel}>
          {f.dupCancel}
        </Button>
        {matches.map((row) => (
          <Button key={row.customer_id} variant="secondary" size="dialog" className="border-warn-ink" disabled={busy} onClick={() => onOpen(row.customer_id)}>
            {(openLabel ?? f.dupOpen)(nameOf(row))}
          </Button>
        ))}
        <Button size="dialog" disabled={busy} onClick={onSaveNew}>
          {f.dupSaveNew}
        </Button>
      </div>
    </Dialog>
  );
}
