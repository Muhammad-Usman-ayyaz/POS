import { useCallback, useEffect, useRef, useState } from 'react';

/** How long typing must pause before a search is sent. Short enough to feel instant, long enough to skip every keystroke. */
export const SEARCH_DELAY_MS = 150;

/**
 * `value`, but only after it has stopped changing for `delayMs`. The first value is returned at once (no wait on load).
 * Every change restarts the wait, and a pending update is cancelled when the screen goes away.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DELAY_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export interface SearchState<T> {
  /** The answer to the most recent search, or null before the first one arrives. */
  data: T | null;
  /** The error of the most recent search, or null. */
  error: unknown;
  /** True from the moment a search is sent until its answer arrives. */
  loading: boolean;
  /** The text `data` is the answer to (what was typed, once it had paused). `data` is for this text only when it equals the text now typed AND `loading` is false. */
  answeredFor: string | null;
  /** Search again with the same text (after the data changed). */
  refresh: () => void;
}

/**
 * Runs `run(query)` when typing pauses, and keeps only the answer to the LATEST search: if an earlier search answers
 * late (or fails late), it is ignored, so a slow reply can never overwrite a newer one. `run` must be a stable function
 * (wrap it in useCallback), or the search runs again on every render.
 */
export function useDebouncedSearch<T>(run: (query: string) => Promise<T>, query: string, delayMs: number = SEARCH_DELAY_MS): SearchState<T> {
  const settled = useDebouncedValue(query, delayMs);
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean; answeredFor: string | null }>({ data: null, error: null, loading: true, answeredFor: null });
  const [again, setAgain] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const mine = ++latest.current;
    setState((s) => ({ ...s, loading: true }));
    run(settled).then(
      (data) => {
        if (latest.current === mine) setState({ data, error: null, loading: false, answeredFor: settled });
      },
      (error: unknown) => {
        if (latest.current === mine) setState((s) => ({ ...s, error, loading: false }));
      },
    );
    return () => {
      // Whatever this search answers from now on is out of date (the text changed, or the screen is gone).
      if (latest.current === mine) latest.current += 1;
    };
  }, [run, settled, again]);

  const refresh = useCallback(() => setAgain((n) => n + 1), []);
  return { ...state, refresh };
}
