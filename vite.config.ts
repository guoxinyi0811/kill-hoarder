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
    // 默认 node：src/lib 是纯逻辑，不需要 DOM。
    // 需要 DOM 的组件测试在文件顶部用 `// @vitest-environment jsdom` 单独声明。
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
