import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// Serve the sibling `data-sts2` / `resource-sts2` artifact repos in dev.
// Walk ancestor directories until the sibling repo is found, so this keeps
// working from a git worktree. Override with STS2_DATA_DIR / STS2_RES_DIR.
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
const DATA_DIR = process.env.STS2_DATA_DIR ?? siblingRepo('data-sts2')
const RES_DIR = process.env.STS2_RES_DIR ?? siblingRepo('resource-sts2')

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
  server: { host: '0.0.0.0', port: 15175, strictPort: true, allowedHosts: true },
  plugins: [
    react(),
    tailwindcss(),
    staticDirPlugin('sts2-data', '/data', DATA_DIR),
    staticDirPlugin('sts2-res', '/sts2res', RES_DIR),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: {
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? Date.now().toString()),
    __BUILD_GIT_COMMIT__: JSON.stringify(execSync('git rev-parse HEAD').toString().trim()),
  },
})
