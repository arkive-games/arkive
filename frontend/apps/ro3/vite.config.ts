import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { arkiveFontAssets } from '../../vite/arkive-font-assets.ts'

function siblingRepo(name: string): string {
  let dir = import.meta.dirname
  for (let index = 0; index < 8; index += 1) {
    const candidate = path.resolve(dir, name)
    if (fs.existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }
  return path.resolve(import.meta.dirname, '../../../..', name)
}

const DATA_DIR = process.env.RO3_DATA_DIR ?? siblingRepo('data-ro3')
const RES_DIR = process.env.RO3_RES_DIR ?? siblingRepo('resource-ro3')

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
}

function staticDirPlugin(name: string, urlPrefix: string, rootDir: string): Plugin {
  const root = path.resolve(rootDir)
  return {
    name,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (request, response, next) => {
        const relativePath = decodeURIComponent((request.url ?? '').split('?')[0])
        const file = path.resolve(path.join(root, relativePath))
        if (!file.startsWith(root)) {
          response.statusCode = 403
          response.end()
          return
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          next()
          return
        }
        response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        response.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(response)
      })
    },
  }
}

export default defineConfig({
  server: { host: '0.0.0.0', port: 15178, strictPort: true, allowedHosts: true },
  plugins: [
    arkiveFontAssets(),
    react(),
    tailwindcss(),
    staticDirPlugin('ro3-data', '/data', DATA_DIR),
    staticDirPlugin('ro3-res', '/ro3res', RES_DIR),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
