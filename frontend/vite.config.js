import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Target the real API. Prefer VITE_DEV_API_PROXY (explicit), else VITE_API_URL,
  // else the production Railway URL. Browser CORS is bypassed because the proxy
  // runs server-side in the Vite dev server.
  const target =
    env.VITE_DEV_API_PROXY ||
    env.VITE_API_URL ||
    'https://movienight-production.up.railway.app'

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
