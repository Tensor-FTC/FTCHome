import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/logo.svg', 'favicon.svg'],
      manifest: {
        id: '/?app=ftc-home',
        name: 'FTC Home — FTC season manager',
        short_name: 'FTC Home',
        description: 'One place, all season. Season management for FIRST Tech Challenge teams.',
        theme_color: '#0B0E10',
        background_color: '#08090A',
        display: 'standalone',
        // Not locked to portrait: the same install is a desktop window with a
        // 240px rail, and Competition Mode is meant to run landscape on a laptop.
        orientation: 'any',
        categories: ['productivity', 'education', 'sports'],
        start_url: '.',
        scope: '.',
        shortcuts: [
          { name: 'Today', url: 'today' },
          { name: 'Live event', url: 'live' },
          { name: 'Competition Mode', url: 'comp' },
        ],
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'brand/logo.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The gym case: never let a failed network call blank a screen.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ftc-home-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/ftc-api\.firstinspires\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ftc-events-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
