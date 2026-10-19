import type { Api, ExportStatementResult } from '@pos/api-contract';
import { useRef, useState } from 'react';
import { ErrorNotice, Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { useI18n } from '../../i18n/index.js';
import { PrintOutcome } from '../invoices/print-actions.js';
import { buildExportRequest, buildPrintReceiptRequest, buildPrintStatementRequest } from './statement-requests.js';
import { useKhataPrint } from './use-khata-print.js';

/**
 * The statement's buttons: Print (80 mm), Print A4, Save PDF (A4) and Export CSV, plus what happened. Ready to wire: the customer page puts it in its
 * `statementActions` slot and the statement page uses it too. `from` and `to` are `YYYY-MM-DD` or '' (no limit). A PDF saved instead of printing is a calm
 * notice (never an error); the CSV is written by the main process after the person chose a place in the Save box (cancel writes nothing).
 */
export function StatementPrintActions({ api, customerId, from, to }: { api: Api; customerId: string; from: string; to: string }) {
  const { m } = useI18n();
  const t = m.statement;
  const print = useKhataPrint<'80' | 'a4' | 'pdf'>();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<ExportStatementResult | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const exportingNow = useRef(false);

  const exportCsv = () => {
    if (exportingNow.current) return;
    exportingNow.current = true;
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
  return (
    <div data-statement-actions className="flex flex-wrap items-center gap-2">
      <div className="w-full basis-full text-start">
        <PrintOutcome result={print.result} error={print.error} />
        {exportError != null && <ErrorNotice error={exportError} className="mt-2" />}
        {exported?.status === 'saved' && (
          <div data-csv-outcome="saved" className="mt-2">
            <Notice tone="success" title={t.csvSavedTitle} />
            {exported.path && (
              <p data-csv-path dir="ltr" className="mt-2 break-all text-start text-sm text-muted">
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
      </div>
      <Button variant="secondary" disabled={busy} data-statement-print="80" onClick={() => print.run('80', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'receipt', 'printer')))}>
        {print.busy === '80' ? t.working : t.print80}
      </Button>
      <Button variant="secondary" disabled={busy} data-statement-print="a4" onClick={() => print.run('a4', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'invoice', 'printer')))}>
        {print.busy === 'a4' ? t.working : t.printA4}
      </Button>
      <Button variant="secondary" disabled={busy} data-statement-print="pdf" onClick={() => print.run('pdf', () => api.print.statement(buildPrintStatementRequest(customerId, from, to, 'invoice', 'pdf')))}>
        {print.busy === 'pdf' ? t.working : t.savePdf}
      </Button>
      <Button variant="secondary" disabled={exporting} data-statement-export onClick={exportCsv}>
        {exporting ? t.working : t.exportCsv}
      </Button>
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
