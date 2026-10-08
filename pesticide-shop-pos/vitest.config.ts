import { configDefaults, defineConfig } from 'vitest/config';

// Run only THIS project's tests. Other tools (Kilo) keep a full working copy of the repo under .kilo/ and .kilocode/,
// which vitest would otherwise find and run a second time (doubling the file and test counts).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.kilo/**', '**/.kilocode/**', '**/.screenshots/**'],
  },
});
