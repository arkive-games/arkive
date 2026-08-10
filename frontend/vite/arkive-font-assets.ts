import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const FONT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/meta/public/fonts',
)

/**
 * The served font directory is a content hash written by `pnpm fonts:sync`, so it
 * is read rather than hard-coded -- see the rationale in that script. Read from the
 * manifest and not by listing directories: a listing would silently pick a stale
 * leftover, whereas a missing manifest says exactly what to run.
 */
export const ARKIVE_FONT_VERSION: string = (() => {
  const manifest = path.join(FONT_ROOT, 'noto-sans', 'manifest.json')
  if (!fs.existsSync(manifest)) {
    throw new Error(`Font manifest is missing (${manifest}). Run \`pnpm fonts:sync\`.`)
  }
  const { version } = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version?: unknown }
  if (typeof version !== 'string' || !version) {
    throw new Error(`Font manifest has no version (${manifest}). Run \`pnpm fonts:sync\`.`)
  }
  return version
})()

export const ARKIVE_FONT_PATH = `/fonts/noto-sans/${ARKIVE_FONT_VERSION}/index.css`
export const ARKIVE_FONT_URL = `https://tc-imba.com${ARKIVE_FONT_PATH}`

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

export interface ArkiveFontAssetsOptions {
  /**
   * True for the app that SHIPS the font files in its own output -- the portal.
   *
   * It exists because `context.server` is undefined for every build, not just a
   * game's, so the portal's own production build was pointing at
   * https://tc-imba.com/fonts/... -- fetching its own fonts cross-origin from
   * itself. That also meant any non-production host of the portal (an EdgeOne
   * preview, `vite preview`) pulled fonts from live production, so a font change
   * could not be verified before deploying it.
   */
  hostsFonts?: boolean
}

export function arkiveFontAssets(options: ArkiveFontAssetsOptions = {}): Plugin {
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
            : context.server || options.hostsFonts
              ? ARKIVE_FONT_PATH
              : ARKIVE_FONT_URL)

        const tags = []
        // Only the games load the stylesheet from another hostname. tc-imba.com and
        // palworld.tc-imba.com are the same SITE (so they share one cache partition,
        // which is the whole reason a single font host is worth having) but different
        // ORIGINS, so without this the first paint waits on a fresh DNS + TLS
        // handshake. crossorigin is required: a font request is CORS-mode, and a
        // preconnect without it warms the wrong connection.
        if (href === ARKIVE_FONT_URL) {
          tags.push({
            tag: 'link',
            attrs: { rel: 'preconnect', href: 'https://tc-imba.com', crossorigin: '' },
            injectTo: 'head-prepend' as const,
          })
        }
        tags.push({
          tag: 'link',
          attrs: { rel: 'stylesheet', href },
          injectTo: 'head-prepend' as const,
        })
        return tags
      },
    },
  }
}
