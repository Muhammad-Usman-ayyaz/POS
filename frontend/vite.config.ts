import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Installable + instant-loading shell only — NOT an offline sales queue. Every checkout
      // still needs the network (stock/khata are validated server-side). See CLAUDE.md's
      // "Known gaps" section if that changes.
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Pesticide Club — Agri ERP & Khata System',
        short_name: 'Pesticide Club',
        description: 'POS sales, batch inventory, supplier accounts & farmer ledgers.',
        theme_color: '#176B87',
        background_color: '#FAF7EF',
        display: 'standalone',
        start_url: '/dashboard',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell (JS/CSS/HTML/icons) so it loads instantly and opens even with no
        // connection; API calls are never cached (a stale product list or stock count would be a
        // real correctness problem for a POS, not just a stale UI).
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5180,
    strictPort: false,
  },
})
