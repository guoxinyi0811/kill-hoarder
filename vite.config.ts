import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '家庭保质期管理',
        short_name: '保质期',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [],
      },
    }),
  ],
  test: {
    // Use Node by default: src/lib contains pure logic and does not need a DOM.
    // Component tests that need a DOM declare `// @vitest-environment jsdom` per file.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
