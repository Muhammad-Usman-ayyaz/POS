import type { PrintResult } from '@pos/api-contract';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface KhataPrintState<K extends string> {
  /** What is being sent right now, or null. A second click while one is on its way is ignored. */
  busy: K | null;
  /** The last reply. A PDF saved instead of printing is a normal reply, shown as a notice. */
  result: PrintResult | null;
  /** Only a real failure (not even a PDF could be made). */
  error: unknown;
  run: (key: K, send: () => Promise<PrintResult>) => void;
}

/** One print call at a time, with the reply or the error kept for the notice. `PrintOutcome` (pages/invoices/print-actions) shows it. */
export function useKhataPrint<K extends string>(): KhataPrintState<K> {
  const [busy, setBusy] = useState<K | null>(null);
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
  const run = useCallback((key: K, send: () => Promise<PrintResult>) => {
    if (working.current) return;
    working.current = true;
    setBusy(key);
    setError(null);
    send().then(
      (reply) => {
        working.current = false;
        if (!alive.current) return;
        setBusy(null);
        setResult(reply);
      },
      (e: unknown) => {
        working.current = false;
        if (!alive.current) return;
        setBusy(null);
        setResult(null);
        setError(e);
      },
    );
  }, []);
  return { busy, result, error, run };
}
