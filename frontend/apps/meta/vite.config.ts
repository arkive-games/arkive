import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { arkiveFontAssets } from '../../vite/arkive-font-assets.ts'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 15172,
    strictPort: true,
    allowedHosts: true,
  },
  plugins: [arkiveFontAssets({ hostsFonts: true }), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: {
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? Date.now().toString()),
    __BUILD_GIT_COMMIT__: JSON.stringify(execSync('git rev-parse HEAD').toString().trim()),
  },
})
