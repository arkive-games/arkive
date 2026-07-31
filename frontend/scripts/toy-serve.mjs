#!/usr/bin/env node
// Serve a built toy package under its real subpath for local smoke testing:
//   pnpm toy:serve --app palworld [--port 15180]
// Mounts dist-toy at /toy/<slug>/ exactly like the platform. Deliberately NO
// SPA fallback: hash routing needs none, and a 404 here means a root-absolute
// path bug that would also break on the platform.
// Package-shape agnostic: it serves whatever dist-toy contains, so a site-only
// toy (the `arkive` portal, no data/resource folders) needs nothing special.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs, loadToyConfig } from './toy-lib.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function fail(message) {
  console.error(`toy-serve: ${message}`)
  process.exit(1)
}

let args
try { args = parseArgs(process.argv.slice(2)) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app palworld)')
if (!/^[a-z0-9-]+$/.test(app)) fail(`invalid app name "${app}"`)
const appDir = path.join(FRONTEND, 'apps', app)

let cfg
try { cfg = loadToyConfig(appDir) } catch (e) { fail(e.message) }

const root = path.join(appDir, 'dist-toy')
if (!fs.existsSync(path.join(root, 'index.html'))) {
  fail(`${root} is missing — run \`pnpm toy:build --app ${app}\` first`)
}
const prefix = `/toy/${cfg.slug}/`
const port = Number(args.port ?? 15180)
if (Number.isNaN(port)) fail(`invalid --port "${args.port}"`)

const server = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (url === '/' || url === `/toy/${cfg.slug}`) {
      res.writeHead(302, { Location: `${prefix}index.html` })
      res.end()
      return
    }
    if (!url.startsWith(prefix)) { res.writeHead(404); res.end('outside toy prefix'); return }
    let rel = url.slice(prefix.length)
    if (rel === '') rel = 'index.html'
    const file = path.resolve(path.join(root, rel))
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).on('error', () => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }).pipe(res)
  } catch {
    if (!res.headersSent) res.writeHead(400)
    res.end('bad request')
  }
})
server.on('error', (e) => fail(e.message))
server.listen(port, '127.0.0.1', () => {
  console.log(`toy-serve: http://localhost:${port}${prefix}index.html`)
})
