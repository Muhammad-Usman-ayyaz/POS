import type { Api, DocumentKind, PrintResult } from '@pos/api-contract';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorNotice, Notice } from '../../components/feedback.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/primitives.js';
import { useI18n } from '../../i18n/index.js';
import { buildPrintRequest, type PrintOutput } from './invoices-requests.js';

export type { PrintOutput };

export interface PrintState {
  /** The document being sent right now, or null. */
  busy: { kind: DocumentKind; output: PrintOutput } | null;
  /** The last reply. A PDF saved instead of printing is a normal reply, shown as a notice. */
  result: PrintResult | null;
  /** Only a real failure (not even a PDF could be made). */
  error: unknown;
  run: (kind: DocumentKind, output: PrintOutput) => void;
}

/**
 * Sends `print:document` for one invoice. It never sets the language: the shell uses the language chosen in the print settings for
 * that kind of document. A second click while one is on its way is ignored.
 */
export function usePrintDocument(api: Api, invoiceId: string, onDone?: () => void): PrintState {
  const [busy, setBusy] = useState<PrintState['busy']>(null);
  const [result, setResult] = useState<PrintResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    (kind: DocumentKind, output: PrintOutput) => {
      if (working.current) return;
      working.current = true;
      setBusy({ kind, output });
      setError(null);
      api.print.document(buildPrintRequest(invoiceId, kind, output)).then(
        (reply) => {
          working.current = false;
          if (!alive.current) return;
          setBusy(null);
          setResult(reply);
          onDone?.();
        },
        (e: unknown) => {
          working.current = false;
          if (!alive.current) return;
          setBusy(null);
          setResult(null);
          setError(e);
        },
      );
    },
    [api, invoiceId, onDone],
  );
  return { busy, result, error, run };
}

/** What the last print did, in words: a calm notice, never an error, when a PDF was saved instead of printing. */
export function PrintOutcome({ result, error, className }: { result: PrintResult | null; error: unknown; className?: string }) {
  const { m } = useI18n();
  const t = m.invoices.print;
  if (error != null) return <ErrorNotice error={error} className={className} />;
  if (!result) return null;
  const saved = result.status === 'pdf_saved';
  const reason = result.fallback === 'no_printer' ? t.savedNoPrinter : result.fallback === 'print_failed' ? t.savedFailed : t.savedAsked;
  return (
    <div data-print-outcome={saved ? 'pdf_saved' : 'printed'} data-fallback={result.fallback ?? undefined} className={className}>
      {saved ? (
        <>
          <Notice tone="success" title={t.savedTitle} next={reason} />
          {result.pdf_path && (
            <p data-pdf-path dir="ltr" className="mt-2 break-all text-start text-sm text-muted">
              {t.savedAt(result.pdf_path)}
            </p>
          )}
        </>
      ) : (
        <Notice tone="success" title={t.printed} next={t.printedNext} />
      )}
      {result.is_copy && (
        <p data-copy-hint className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone="warning">{t.copy}</Badge>
          {t.copyHint}
        </p>
      )}
    </div>
  );
}

/**
 * The print buttons for one invoice plus what happened. Used by the sale-saved box at the counter (the receipt only) and by the invoice history
 * (the receipt and the A4 invoice). The outcome has its own full-width line so it sits above the buttons in a wrapping row.
 */
export function PrintActions({ api, invoiceId, kinds, onDone, children }: { api: Api; invoiceId: string; kinds: readonly DocumentKind[]; onDone?: () => void; children?: ReactNode }) {
  const { m } = useI18n();
  const t = m.invoices.print;
  const print = usePrintDocument(api, invoiceId, onDone);
  const label = (kind: DocumentKind, output: PrintOutput): string =>
    print.busy?.kind === kind && print.busy.output === output ? t.working : output === 'printer' ? (kind === 'receipt' ? t.receipt : t.invoice) : kind === 'receipt' ? t.receiptPdf : t.invoicePdf;
  return (
    <>
      <PrintOutcome result={print.result} error={print.error} className="w-full basis-full text-start" />
      {kinds.map((kind) => (
        <Button key={`p-${kind}`} variant="secondary" disabled={print.busy !== null} data-print={`${kind}:printer`} onClick={() => print.run(kind, 'printer')}>
          {label(kind, 'printer')}
        </Button>
      ))}
      {kinds.map((kind) => (
        <Button key={`f-${kind}`} variant="secondary" disabled={print.busy !== null} data-print={`${kind}:pdf`} onClick={() => print.run(kind, 'pdf')}>
          {label(kind, 'pdf')}
        </Button>
      ))}
      {children}
    </>
  );
}
