#!/usr/bin/env node
// Snapshot an app's sitemap pages into static HTML so crawlers that run no
// JavaScript (Baidu, mostly) still read each page's content:
//   node scripts/prerender.mjs --app gmzz
// Runs on a finished production build, after the deploy workflow has copied
// edgeone.json into dist. It serves dist locally, renders every sitemap path
// in headless Chromium against the live data hosts the build points at, and
// writes dist/<path>/index.html plus a rewritten dist/edgeone.json.
//
// The snapshot only fills the empty #root; the app still boots exactly as
// before and replaces it, so visitors always see live data. A page that throws
// or renders nothing keeps the plain shell and is reported, never shipped.
// Nothing is written until every page has rendered, so a crash leaves dist as
// the build produced it.
//
// Two deliberate trade-offs: the snapshot is rendered in Chinese, so a reader
// in another language sees it until the bundle runs and switches; and it holds
// the data as of the last frontend deploy, which only crawlers ever read.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { parseArgs } from './toy-lib.mjs'
import { SHELL_FILE, fillShell, outputFile, prerenderedConfig, sitemapPaths } from './prerender-lib.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
// Pages render in parallel; a data-heavy route can keep the network busy for a
// while, so idle is waited for up to a bound rather than required.
const CONCURRENCY = 4
const IDLE_TIMEOUT_MS = 20_000
// Below this much text outside the site chrome (header, nav, footer) the page
// is a loading or error state, not content. The chrome alone clears any small
// bound, so it is left out of the count.
const MIN_TEXT = 20
const CHROME = 'header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]'

const inCI = Boolean(process.env.GITHUB_ACTIONS)
const warn = (message) => console.warn(inCI ? `::warning::prerender: ${message}` : `prerender: WARN ${message}`)
function fail(message) {
  console.error(inCI ? `::error::prerender: ${message}` : `prerender: ${message}`)
  process.exit(1)
}

let args
try { args = parseArgs(process.argv.slice(2)) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app gmzz)')
if (!/^[a-z0-9-]+$/.test(app)) fail(`invalid app name "${app}"`)
const dist = path.join(FRONTEND, 'apps', app, 'dist')
const shellPath = path.join(dist, 'index.html')
const sitemapPath = path.join(dist, 'sitemap.xml')
if (!fs.existsSync(shellPath)) fail(`${shellPath} is missing — build ${app} first`)
if (!fs.existsSync(sitemapPath)) fail(`${sitemapPath} is missing — every deployed app ships one`)

const shell = fs.readFileSync(shellPath, 'utf8')
if (fs.existsSync(path.join(dist, SHELL_FILE))) fail(`${SHELL_FILE} already exists — prerender runs once per build`)
const sitemap = fs.readFileSync(sitemapPath, 'utf8')
const routes = sitemapPaths(sitemap)
const locs = new Map([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => [new URL(loc.trim()).pathname, loc.trim()]))

// Serves the build like EdgeOne does before this step: real files as they are,
// every other path as the SPA entry.
const server = http.createServer((req, res) => {
  let url
  // A path that cannot be decoded names no file, so it falls through to the shell.
  try { url = decodeURIComponent((req.url ?? '/').split('?')[0]) } catch { url = null }
  const file = url === null ? null : path.resolve(path.join(dist, url))
  const isFile = file !== null && file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
  if (isFile) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } else {
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    res.end(shell)
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({
  // The map pages draw with WebGL; software GL lets them start on a GPU-less runner.
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
// Chinese is what the sites' searchers read, and the apps pick their language
// from the browser's.
const context = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
// A snapshot run is not a visit: keep it out of the traffic report.
await context.route(/hm\.baidu\.com/, (route) => route.abort())

async function render(route) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(origin + route, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS }).catch(() => {})
    const result = await page.evaluate((chrome) => {
      const root = document.getElementById('root')
      const body = root?.cloneNode(true)
      body?.querySelectorAll(chrome).forEach((element) => element.remove())
      return {
        title: document.title,
        lang: document.documentElement.lang,
        rootHtml: root?.innerHTML ?? '',
        text: (body?.textContent ?? '').replace(/\s+/g, ' ').trim().length,
      }
    }, CHROME)
    if (errors.length) return { route, skipped: `threw: ${errors[0]}` }
    if (result.text < MIN_TEXT) return { route, skipped: `rendered only ${result.text} characters` }
    return { route, ...result }
  } catch (e) {
    return { route, skipped: e.message.split('\n')[0] }
  } finally {
    await page.close()
  }
}

const results = []
const queue = [...routes]
try {
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let route = queue.shift(); route; route = queue.shift()) results.push(await render(route))
  }))
} finally {
  await browser.close()
  server.close()
}

const rendered = results.filter((result) => !result.skipped)
for (const { route, skipped } of results.filter((result) => result.skipped)) warn(`${app}${route} kept the plain shell (${skipped})`)
if (!rendered.length) fail(`no page of ${app} rendered`)

// Everything that can refuse runs before the first write, so a refusal leaves
// dist as built; past this point only I/O can fail.
for (const result of rendered) {
  const target = path.join(dist, outputFile(result.route))
  if (result.route !== '/' && fs.existsSync(target)) fail(`${target} already exists in the build`)
}
const configPath = path.join(dist, 'edgeone.json')
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
let next
try { next = prerenderedConfig(config, rendered.map((result) => result.route)) } catch (e) { fail(e.message) }
fs.writeFileSync(path.join(dist, SHELL_FILE), shell)
for (const result of rendered) {
  const target = path.join(dist, outputFile(result.route))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, fillShell(shell, { ...result, url: locs.get(result.route) }))
  console.log(`prerender: ${app}${result.route} — ${result.text} characters, "${result.title}"`)
}
if (next !== config) fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`)
console.log(`prerender: ${app} — ${rendered.length} of ${routes.length} pages prerendered`)
