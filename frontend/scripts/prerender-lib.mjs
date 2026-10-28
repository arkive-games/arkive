// Pure helpers for prerender.mjs, kept apart so vitest can cover them; the CLI
// entry point stays thin orchestration around a browser.
import path from 'node:path'

/**
 * The untouched SPA entry, kept beside the prerendered pages. Once `/` is
 * prerendered, index.html carries the home page's content, so every route
 * without a snapshot of its own is rewritten here instead — otherwise a crawler
 * would read the home page at every unlisted URL.
 */
export const SHELL_FILE = 'app-shell.html'
// EdgeOne refuses an edgeone.json with more rewrites than this.
export const MAX_REWRITES = 100

/** Every `<loc>` path in a sitemap, deduplicated, in document order. */
export function sitemapPaths(xml) {
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc.trim()).pathname)
  return [...new Set(paths)]
}

/** Where a route's snapshot lives inside dist: `/` -> index.html, `/a/b` -> a/b/index.html. */
export function outputFile(route) {
  const parts = route.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) throw new Error(`unsafe route ${route}`)
  return path.join(...parts, 'index.html')
}

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (text) => escapeText(text).replace(/"/g, '&quot;')

/**
 * Fill the built shell with what the browser rendered: the page's title and
 * canonical URL in the head, and the root's markup in the body. The head is
 * otherwise left alone, so the entry script the deploy check looks for stays
 * exactly where the build put it. `<html lang>` is kept as built on purpose:
 * the apps read it as a language fallback on a first visit, so stamping the
 * render locale would switch unsupported-language visitors to Chinese on
 * prerendered pages only. The snapshot's own language goes on a wrapper inside
 * #root instead, which the app discards when it mounts. Scripts are stripped
 * from the captured markup: the entry script re-runs the app, and anything the
 * app injected (analytics) would otherwise run twice.
 */
export function fillShell(shell, { title, url, lang, rootHtml }) {
  const roots = shell.match(/<div id="root"[^>]*><\/div>/g) ?? []
  if (roots.length !== 1) throw new Error(`expected one empty #root in the shell, found ${roots.length}`)
  // Replacer functions throughout: a replacement string would expand `$&` or
  // `$1` inside a title or URL as a substitution pattern.
  let html = shell
  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeText(title)}</title>`)
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, (_, open, close) => `${open}${escapeAttr(title)}${close}`)
  }
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, (_, open, close) => `${open}${escapeAttr(url)}${close}`)
  html = html.replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/, '')
  html = html.replace('</head>', () => `  <link rel="canonical" href="${escapeAttr(url)}" />\n  </head>`)
  const markup = rootHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const content = lang ? `<div lang="${escapeAttr(lang)}">${markup}</div>` : markup
  return html.replace(/(<div id="root"[^>]*>)(<\/div>)/, (_, open, close) => `${open}${content}${close}`)
}

/**
 * The deployed edgeone.json: every rule that served the SPA entry now serves
 * the shell, and each prerendered route gets an exact rule to its own file,
 * placed first so it wins over the route's existing rules. Only the exact path
 * is claimed — `/x?query` and `/x/child` keep reaching the shell through the
 * rules that already cover them.
 */
export function prerenderedConfig(config, routes) {
  const existing = (config.rewrites ?? []).map((rule) =>
    rule.destination === '/index.html' ? { ...rule, destination: `/${SHELL_FILE}` } : rule)
  const exact = routes
    .filter((route) => route !== '/')
    .map((route) => ({ source: route, destination: `/${outputFile(route).split(path.sep).join('/')}` }))
  if (!config.rewrites && !exact.length) return config
  const rewrites = [...exact, ...existing]
  if (rewrites.length > MAX_REWRITES) {
    throw new Error(`${rewrites.length} rewrites exceed EdgeOne's limit of ${MAX_REWRITES}`)
  }
  return { ...config, rewrites }
}
