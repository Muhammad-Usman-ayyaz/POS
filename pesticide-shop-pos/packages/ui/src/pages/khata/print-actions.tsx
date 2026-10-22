import type { Api, ExportStatementResult } from '@pos/api-contract';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorNotice, Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { useI18n } from '../../i18n/index.js';
import { PrintOutcome } from '../invoices/print-actions.js';
import { buildExportRequest, buildPrintReceiptRequest, buildPrintStatementRequest } from './statement-requests.js';
import { useKhataPrint } from './use-khata-print.js';

/**
 * The statement's buttons: Print (80 mm), Print A4, Save PDF (A4) and Export CSV, plus what happened. Ready to wire: the customer page puts it in its
 * `statementActions` slot and the statement page uses it too. `from` and `to` are `YYYY-MM-DD` or '' (no limit). A PDF saved instead of printing is a calm
 * notice (never an error); the notices float in a panel over the bottom corner of the window (with a Close button), so showing one never moves the buttons or the table under them; the CSV is written by the main process after the person chose a place in the Save box (cancel writes nothing).
 */
export function StatementPrintActions({ api, customerId, from, to }: { api: Api; customerId: string; from: string; to: string }) {
  const { m, language } = useI18n();
  const t = m.statement;
  const print = useKhataPrint<'80' | 'a4' | 'pdf'>();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<ExportStatementResult | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const exportingNow = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const exportCsv = () => {
    if (exportingNow.current) return;
    exportingNow.current = true;
    setDismissed(false);
    setExporting(true);
    setExportError(null);
    setExported(null);
    api.khata.exportStatement(buildExportRequest(customerId, from, to)).then(
      (reply) => {
        exportingNow.current = false;
        setExporting(false);
        setExported(reply);
      },
      (e: unknown) => {
        exportingNow.current = false;
        setExporting(false);
        setExportError(e);
      },
    );
  };
  const busy = print.busy !== null;
  const hasNotice = print.result !== null || print.error != null || exportError != null || exported !== null;
  return (
    <div data-statement-actions className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" disabled={busy} data-statement-print="80" onClick={() => (setDismissed(false), print.run('80', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'receipt', 'printer'))))}>
        {print.busy === '80' ? t.working : t.print80}
      </Button>
      <Button variant="secondary" disabled={busy} data-statement-print="a4" onClick={() => (setDismissed(false), print.run('a4', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'invoice', 'printer'))))}>
        {print.busy === 'a4' ? t.working : t.printA4}
      </Button>
      <Button variant="secondary" disabled={busy} data-statement-print="pdf" onClick={() => (setDismissed(false), print.run('pdf', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'invoice', 'pdf'))))}>
        {print.busy === 'pdf' ? t.working : t.savePdf}
      </Button>
      <Button variant="secondary" disabled={exporting} data-statement-export onClick={exportCsv}>
        {exporting ? t.working : t.exportCsv}
      </Button>
      {/* Only drawn when there is something to say. It floats (fixed, in a portal on the page body: the page header animates with a transform, which would pin a fixed child to the header), so it can never push the table down or wrap the buttons. */}
      {hasNotice && !dismissed && createPortal(
        <div data-statement-notices role="region" dir={language === 'ur' ? 'rtl' : 'ltr'} className="fixed bottom-6 end-6 z-30 flex max-h-[60vh] w-[min(30rem,calc(100vw-3rem))] flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-card p-3 text-start shadow-card">
          <button type="button" data-notices-close aria-label={t.dismissNotice} className="lift inline-flex min-h-11 items-center justify-center self-end rounded-sm px-3 text-sm font-semibold text-muted hover:bg-row-hover" onClick={() => setDismissed(true)}>
            ×
          </button>
          <PrintOutcome result={print.result} error={print.error} />
          {exportError != null && <ErrorNotice error={exportError} className="mt-2" />}
          {exported?.status === 'saved' && (
            <div data-csv-outcome="saved" className="mt-2">
              <Notice tone="success" title={t.csvSavedTitle} />
              {exported.path && (
                <p data-csv-path dir="ltr" title={exported.path} className="mt-2 line-clamp-2 break-all text-start text-sm text-muted">
                  {t.csvSavedAt(exported.path)}
                </p>
              )}
            </div>
          )}
          {exported?.status === 'cancelled' && (
            <div data-csv-outcome="cancelled" className="mt-2">
              <Notice tone="warning" title={t.csvCancelledTitle} next={t.csvCancelledNext} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * The payment receipt's buttons (Print receipt, Save PDF) plus what happened, for the payment dialog's `receiptActions` slot. The payment receipt is the
 * 80 mm slip; the language is the one chosen in the print settings.
 */
export function PaymentReceiptActions({ api, paymentId }: { api: Api; paymentId: string }) {
  const { m } = useI18n();
  const t = m.paymentReceipt;
  const print = useKhataPrint<'printer' | 'pdf'>();
  const busy = print.busy !== null;
  return (
    <div data-payment-receipt-actions className="flex flex-wrap items-center gap-2">
      <div className="w-full basis-full text-start">
        <PrintOutcome result={print.result} error={print.error} />
      </div>
      <Button variant="secondary" disabled={busy} data-receipt-print="printer" onClick={() => print.run('printer', () => api.print.paymentReceipt(buildPrintReceiptRequest(paymentId, 'printer')))}>
        {print.busy === 'printer' ? t.working : t.print}
      </Button>
      <Button variant="secondary" disabled={busy} data-receipt-print="pdf" onClick={() => print.run('pdf', () => api.print.paymentReceipt(buildPrintReceiptRequest(paymentId, 'pdf')))}>
        {print.busy === 'pdf' ? t.working : t.savePdf}
      </Button>
    </div>
  );
}
