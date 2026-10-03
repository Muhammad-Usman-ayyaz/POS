import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { injectCsp } from './src/main/security';

// Our own workspace packages are TypeScript source: they are bundled into the app, not left as imports.
// Real npm packages stay as imports ONLY if apps/desktop/package.json lists them as dependencies. That is why
// better-sqlite3 is listed there although only @pos/db-sqlite imports it: without it the bundler inlines it and the
// app cannot load its native file (checked by removing it).
const workspacePackages = ['@pos/core', '@pos/db-sqlite', '@pos/api-contract', '@pos/ui'];

export default defineConfig(({ command }) => ({
  // Main process: bundles our code, leaves real npm packages (better-sqlite3, @node-rs/argon2, zod) as imports.
  main: {
    // Development tools (screenshots, the smoke test, database overrides) exist only in the dev server and in the
    // screenshot build. A normal `npm run build` turns this into `false` and they are cut out of the bundle:
    // apps/desktop/tests/production-bundle.test.ts checks that.
    define: { __POS_DEV_TOOLS__: JSON.stringify(command === 'serve' || process.env['POS_BUILD_DEV_TOOLS'] === '1') },
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },

  // Preload: runs sandboxed, where it cannot import anything except Electron. So everything else is bundled in.
  preload: {
    // electron-vite would leave our workspace packages (and zod) as imports; a sandboxed preload cannot import them.
    plugins: [externalizeDepsPlugin({ exclude: [...workspacePackages, 'zod'] })],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') }, external: ['electron'] } },
  },

  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [
      react(),
      tailwindcss(),
      {
        // Puts the Content-Security-Policy into index.html: strict for the built app, relaxed only for the dev server.
        name: 'pos-csp',
        transformIndexHtml: { order: 'pre', handler: (html: string) => injectCsp(html, command === 'serve') },
      },
    ],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
}));
