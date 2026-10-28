import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// Serve the sibling `data-oss` / `resource-oss` artifact repos in dev.
// Walk ancestor directories until the sibling repo is found, so this keeps
// working from a git worktree. Override with OSS_DATA_DIR / OSS_RES_DIR.
// In prod the frontend reads VITE_DATA_BASE_URL / VITE_RESOURCE_BASE_URL instead.
function siblingRepo(name: string): string {
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    const p = path.resolve(dir, name)
    if (fs.existsSync(p)) return p
    dir = path.dirname(dir)
  }
  return path.resolve(__dirname, '../../../..', name)
}
const DATA_DIR = process.env.OSS_DATA_DIR ?? siblingRepo('data-oss')
const RES_DIR = process.env.OSS_RES_DIR ?? siblingRepo('resource-oss')

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
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0])
        const file = path.resolve(path.join(root, rel))
        if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { next(); return }
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    staticDirPlugin('oss-data', '/data', DATA_DIR),
    staticDirPlugin('oss-res', '/ossres', RES_DIR),
  ],
  server: { port: 15180, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'map-renderer', test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: 'react-runtime', test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
