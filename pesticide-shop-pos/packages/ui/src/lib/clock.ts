// The ONE place the UI reads the wall clock. Pages ask `uiNow()` instead of calling `new Date()` themselves, so a test can pin the time with
// `setUiClock` and the "today" of a screen is never a surprise. (Older screens that still read the clock directly are listed in the Phase 6 report.)

let clock: () => Date = () => new Date();

/** The current moment. The single wall-clock read of the UI. */
export const uiNow = (): Date => clock();

/** Tests only: replace the clock (`setUiClock(() => new Date('2026-03-01T00:30:00+05:00'))`); call it with no argument to restore the real one. */
export function setUiClock(fn?: () => Date): void {
  clock = fn ?? (() => new Date());
}
