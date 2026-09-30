import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: {
      // shamela.ws sends no Access-Control-Allow-Origin, so the browser cannot
      // fetch it directly. Dev-only escape hatch: this does NOT exist in `dist/`.
      '/shamela': {
        target: 'https://shamela.ws',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shamela/, ''),
      },
    },
  },
})
