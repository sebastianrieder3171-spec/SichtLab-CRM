declare const process: { env: Record<string, string | undefined> }
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'SICHTFAKTOR Akquise-CRM',
        short_name: 'Akquise',
        description: 'Telefonakquise: Anrufliste, Rückrufe, Notizen und Pipeline.',
        lang: 'de-AT',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#F5F7F5',
        theme_color: '#1F6B52',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: base + 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ]
})
