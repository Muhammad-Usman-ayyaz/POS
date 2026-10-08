// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DELAY_MS, useDebouncedSearch, useDebouncedValue } from '../src/lib/use-debounced-search.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useDebouncedValue', () => {
  it('the delay is short: about a tenth of a second or a bit more', () => {
    expect(SEARCH_DELAY_MS).toBeGreaterThanOrEqual(100);
    expect(SEARCH_DELAY_MS).toBeLessThanOrEqual(250);
  });

  it('gives the first value at once, and a new one only after typing has paused for the delay', async () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), { initialProps: { v: 'a' } });
    expect(result.current).toBe('a');
    rerender({ v: 'ab' });
    await tick(149);
    expect(result.current).toBe('a'); // not yet
    await tick(1);
    expect(result.current).toBe('ab');
  });

  it('every keystroke restarts the wait: fast typing gives only the last value', async () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), { initialProps: { v: '' } });
    for (const v of ['i', 'in', 'ins', 'inse']) {
      rerender({ v });
      await tick(100); // always less than the delay
    }
    expect(result.current).toBe(''); // 400 ms have passed in all, and nothing was sent
    await tick(50);
    expect(result.current).toBe('inse');
  });

  it('a pending update is dropped when the screen goes away (nothing runs after unmount)', async () => {
    const seen: string[] = [];
    const { rerender, unmount } = renderHook(({ v }) => { const d = useDebouncedValue(v, 150); seen.push(d); return d; }, { initialProps: { v: 'a' } });
    rerender({ v: 'b' });
    unmount();
    await tick(500);
    expect(seen).not.toContain('b');
  });
});

describe('useDebouncedSearch', () => {
  /** A search whose answers we release by hand, in any order. */
  function controlled() {
    const pending: { query: string; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
    const run = vi.fn((query: string) => new Promise<string>((resolve, reject) => pending.push({ query, resolve, reject })));
    return { run, pending };
  }

  it('searches at once for the first text, then once per pause: typing "abc" quickly sends one search, for "abc"', async () => {
    const { run, pending } = controlled();
    const { rerender } = renderHook(({ q }) => useDebouncedSearch(run, q, 150), { initialProps: { q: '' } });
    expect(run).toHaveBeenCalledTimes(1); // the first screen load does not wait
    expect(run).toHaveBeenLastCalledWith('');
    pending[0]!.resolve('all');

    for (const q of ['a', 'ab', 'abc']) {
      rerender({ q });
      await tick(60);
    }
    expect(run).toHaveBeenCalledTimes(1); // nothing sent while typing
    await tick(100);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('abc');
  });

  it('shows the answer, and says it is loading until then', async () => {
    const { run, pending } = controlled();
    const { result } = renderHook(() => useDebouncedSearch(run, 'x', 150));
    expect(result.current).toMatchObject({ data: null, loading: true });
    await act(async () => pending[0]!.resolve('answer'));
    expect(result.current).toMatchObject({ data: 'answer', loading: false, error: null });
  });

  it('a slow EARLIER answer never overwrites a newer one', async () => {
    const { run, pending } = controlled();
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(run, q, 150), { initialProps: { q: 'old' } });
    rerender({ q: 'new' });
    await tick(150);
    expect(pending.map((p) => p.query)).toEqual(['old', 'new']);

    await act(async () => pending[1]!.resolve('answer for new')); // the newer search answers first
    await act(async () => pending[0]!.resolve('LATE answer for old')); // the older one answers late
    expect(result.current.data).toBe('answer for new');
  });

  it('an error from an earlier search is ignored too, and an error from the latest is shown', async () => {
    const { run, pending } = controlled();
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(run, q, 150), { initialProps: { q: 'one' } });
    rerender({ q: 'two' });
    await tick(150);
    await act(async () => pending[0]!.reject(new Error('stale failure')));
    expect(result.current.error).toBeNull();
    await act(async () => pending[1]!.reject(new Error('real failure')));
    expect((result.current.error as Error).message).toBe('real failure');
    expect(result.current.loading).toBe(false);
  });

  it('refresh searches again with the same text and replaces the data', async () => {
    const { run, pending } = controlled();
    const { result } = renderHook(() => useDebouncedSearch(run, 'x', 150));
    await act(async () => pending[0]!.resolve('first'));
    act(() => result.current.refresh());
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('x');
    await act(async () => pending[1]!.resolve('second'));
    expect(result.current.data).toBe('second');
  });

  it('an answer that arrives after the screen is gone does nothing (no update after unmount)', async () => {
    const { run, pending } = controlled();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useDebouncedSearch(run, 'x', 150));
    unmount();
    await act(async () => pending[0]!.resolve('too late'));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
