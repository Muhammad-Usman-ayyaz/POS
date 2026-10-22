import type { Api } from '@pos/api-contract';
import { useEffect, useState } from 'react';
import { ErrorNotice } from '../../components/feedback.js';
import { DateField } from '../../components/ui/date-field.js';
import { formatDate, formatMoney, ltr } from '../../i18n/format.js';
import { useI18n } from '../../i18n/index.js';
import { buildStatementRequest } from './statement-requests.js';

/**
 * "Balance on a date" (customer page and statement page). The person picks a day; the screen asks the shell for the statement up to the END of that
 * shop day (`khata:statement` with only `to`) and shows the reply's `closing_balance` as it is. No balance is worked out here. The day is a shop day
 * (Asia/Karachi): the shell cuts it, this screen sends the date and nothing else. A negative balance is worded "Advance Rs X".
 */
export function BalanceOnDate({ api, customerId }: { api: Api; customerId: string }) {
  const { m, language } = useI18n();
  const t = m.statement;
  const [date, setDate] = useState('');
  const [closing, setClosing] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setClosing(null);
    setError(null);
    if (date === '') return;
    let alive = true;
    api.khata.statement(buildStatementRequest(customerId, '', date)).then(
      (s) => alive && setClosing(s.closing_balance),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [api, customerId, date]);

  const money = (n: number) => formatMoney(n, language);
  const when = language === 'ur' ? ltr(formatDate(date, language)) : formatDate(date, language);
  return (
    <section data-balance-on-date aria-label={t.balanceOnLabel} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
        {t.balanceOnLabel}
        <DateField name="balance-on" label={t.balanceOnLabel} value={date} onChange={setDate} className="h-12 w-44" />
      </label>
      {date !== '' && closing !== null && (
        <p data-balance-on-value className="num pb-2 text-lg font-bold">
          {t.balanceOnResult(when, closing < 0 ? t.advance(money(-closing)) : money(closing))}
        </p>
      )}
      {error != null && <ErrorNotice error={error} className="max-w-xl" />}
    </section>
  );
}
