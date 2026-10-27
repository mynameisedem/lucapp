/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

// Build-only so dev HMR (websocket) keeps working; the shipped app may only talk to the Drive API.
const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'self'; connect-src https://www.googleapis.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'",
    },
    injectTo: 'head',
  }],
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    csp,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
      manifest: {
        name: 'Luca – baby log',
        short_name: 'Luca',
        description: 'Offline baby tracker',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#1b1830',
        theme_color: '#4c40a0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Start sleep', url: './#/quick/sleep', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Log diaper', url: './#/quick/diaper', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Start feed', url: './#/quick/feed', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  test: { env: { TZ: 'Europe/Budapest' }, include: ['src/**/*.test.ts'] },
})
