import { configDefaults, defineConfig } from 'vitest/config';

// The big-database tests only (`npm run test:large`): a realistic 5,000 products x 3 sizes shop with thousands of sales. They prove speed and
// correctness at size, print their timings, and are kept out of the normal run because they are heavy.
export default defineConfig({
  test: {
    include: ['**/*-large.test.ts'],
    exclude: [...configDefaults.exclude, '**/.kilo/**', '**/.kilocode/**', '**/.screenshots/**'],
  },
});
