import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API runs on 127.0.0.1:8000 (`bin/trailhead serve`); the dev server proxies it so cookies and CORS stay simple.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
  },
})
