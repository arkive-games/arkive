import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const ARKIVE_FONT_PATH = '/fonts/noto-sans/v1/index.css'
export const ARKIVE_FONT_URL = `https://tc-imba.com${ARKIVE_FONT_PATH}`

const FONT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/meta/public/fonts',
)

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

function localFontMiddleware(): Plugin['configureServer'] {
  return (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url || !req.url.startsWith('/fonts/')) return next()

      const relativePath = decodeURIComponent(req.url.split('?')[0]).slice('/fonts/'.length)
      const filePath = path.resolve(FONT_ROOT, relativePath)
      if (!filePath.startsWith(`${FONT_ROOT}${path.sep}`)) return next()
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next()

      res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-cache')
      fs.createReadStream(filePath).pipe(res)
    })
  }
}

export function arkiveFontAssets(): Plugin {
  return {
    name: 'arkive-font-assets',
    configureServer: localFontMiddleware(),
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const override = process.env.VITE_FONT_STYLESHEET_URL?.trim()
        const href = override
          || (process.env.VITE_TOY === '1'
            ? `.${ARKIVE_FONT_PATH}`
            : context.server
              ? ARKIVE_FONT_PATH
              : ARKIVE_FONT_URL)

        return [{
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href,
          },
          injectTo: 'head-prepend',
        }]
      },
    },
  }
}
