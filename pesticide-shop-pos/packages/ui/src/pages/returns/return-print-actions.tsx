import type { Api, DocumentKind, PrintResult } from '@pos/api-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button.js';
import { useI18n } from '../../i18n/index.js';
import { PrintOutcome } from '../invoices/print-actions.js';

type Output = 'printer' | 'pdf';

/**
 * The buttons of a finished return: the 80 mm slip and the A4 credit note, each printed or saved as a PDF. It never sets the language (the shell uses
 * the one chosen in the print settings for that paper). A second click while one is on its way is ignored; a PDF saved instead of printing is a notice.
 */
export function ReturnPrintActions({ api, returnId, onDone }: { api: Api; returnId: string; onDone?: () => void }) {
  const { m } = useI18n();
  const t = m.returns.print;
  const p = m.invoices.print;
  const [busy, setBusy] = useState<{ kind: DocumentKind; output: Output } | null>(null);
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
    (kind: DocumentKind, output: Output) => {
      if (working.current) return;
      working.current = true;
      setBusy({ kind, output });
      setError(null);
      api.print.returnSlip({ return_id: returnId, kind, output }).then(
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
    [api, returnId, onDone],
  );
  const label = (kind: DocumentKind, output: Output, text: string) => (busy?.kind === kind && busy.output === output ? p.working : text);

  return (
    <>
      <PrintOutcome result={result} error={error} className="w-full basis-full text-start" />
      <Button variant="secondary" disabled={busy !== null} data-return-print="receipt:pdf" onClick={() => run('receipt', 'pdf')}>
        {label('receipt', 'pdf', p.savePdf)}
      </Button>
      <Button variant="secondary" disabled={busy !== null} data-return-print="invoice:printer" onClick={() => run('invoice', 'printer')}>
        {label('invoice', 'printer', t.credit)}
      </Button>
      <Button disabled={busy !== null} data-return-print="receipt:printer" onClick={() => run('receipt', 'printer')}>
        {label('receipt', 'printer', t.slip)}
      </Button>
    </>
  );
}
