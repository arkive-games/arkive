import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { arkiveFontAssets } from '../../vite/arkive-font-assets.ts'

export default defineConfig({
  server: { host: '0.0.0.0', port: 15178, strictPort: true, allowedHosts: true },
  plugins: [arkiveFontAssets(), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
