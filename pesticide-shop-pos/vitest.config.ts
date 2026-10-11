import { configDefaults, defineConfig } from 'vitest/config';

// Run only THIS project's tests. Other tools (Kilo) keep a full working copy of the repo under .kilo/ and .kilocode/,
// which vitest would otherwise find and run a second time (doubling the file and test counts).
export default defineConfig({
  test: {
    // The big-database tests (`*-large.test.ts`) use a lot of CPU for several seconds and starve the UI tests of time when run alongside them:
    // they have their own command, `npm run test:large`.
    exclude: [...configDefaults.exclude, '**/.kilo/**', '**/.kilocode/**', '**/.screenshots/**', '**/*-large.test.ts'],
  },
});
