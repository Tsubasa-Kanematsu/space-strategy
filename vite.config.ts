import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 開発時 (npm run dev) は API リクエストを Express サーバー (localhost:3000) に
// プロキシする。本番は Express が SPA も同一オリジンで配信するため不要。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/store': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
})
