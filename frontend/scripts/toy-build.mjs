#!/usr/bin/env node
// Build a frontend app as a self-contained Bilibili Toy package:
//   pnpm toy:build --app palworld
// Output: frontend/apps/<app>/dist-toy/ = vite build (relative base, hash
// routing via VITE_TOY) + the data-<app> and resource-<app> artifact repos.
// Site-only toys (no artifact keys in the config, e.g. the `arkive` portal)
// skip the artifact lookup/copy entirely.
// Spec: docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs, loadToyConfig, bundlesArtifacts, fetchesArtifacts, siblingRepo, checkPackage, packageSize } from './toy-lib.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`toy-build: ${message}`)
  process.exit(1)
}

let args
try { args = parseArgs(process.argv.slice(2)) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app palworld)')
if (!/^[a-z0-9-]+$/.test(app)) fail(`invalid app name "${app}"`)
const appDir = path.join(FRONTEND, 'apps', app)
if (!fs.existsSync(appDir)) fail(`no such app: ${appDir}`)

let cfg
try { cfg = loadToyConfig(appDir) } catch (e) { fail(e.message) }

const withArtifacts = bundlesArtifacts(cfg)
let dataDir
let resDir
if (withArtifacts) {
  dataDir = process.env.TOY_DATA_DIR ?? siblingRepo(appDir, cfg.dataDir)
  resDir = process.env.TOY_RES_DIR ?? siblingRepo(appDir, cfg.resourceDir)
  if (!dataDir) fail(`artifact repo "${cfg.dataDir}" not found in ancestor dirs (override with TOY_DATA_DIR)`)
  if (!resDir) fail(`artifact repo "${cfg.resourceDir}" not found in ancestor dirs (override with TOY_RES_DIR)`)
}

const withArtifactUrls = fetchesArtifacts(cfg)

const outDir = path.join(appDir, 'dist-toy')
// Three shapes:
//   bundled  — relative folder names, resolved inside the package
//   fetched  — absolute https URLs on the same CDN the website uses
//   neither  — a pure site (the portal): no vars at all, so an app that did
//              try to fetch fails loudly at build config time, not at runtime
const env = {
  ...process.env,
  VITE_TOY: '1',
  ...(withArtifacts ? { VITE_DATA_BASE_URL: cfg.dataBase, VITE_RESOURCE_BASE_URL: cfg.resourceBase } : {}),
  ...(withArtifactUrls ? { VITE_DATA_BASE_URL: cfg.dataUrl, VITE_RESOURCE_BASE_URL: cfg.resourceUrl } : {}),
}

console.log(`toy-build: building ${app} (slug ${cfg.slug})`)
execSync(`pnpm --filter ${app} exec tsc -b`, { cwd: FRONTEND, stdio: 'inherit' })
execSync(`pnpm --filter ${app} exec vite build --base ./ --outDir dist-toy --emptyOutDir`, {
  cwd: FRONTEND,
  stdio: 'inherit',
  env,
})

// Bundle the artifact repos. Excluded: VCS dirs and edgeone.json (host config,
// not content the app fetches). Skipped entirely for a site-only toy.
if (withArtifacts) {
  const copyFilter = (src) => {
    const base = path.basename(src)
    if (base === '.git') return false
    if (base === 'edgeone.json') return false
    return true
  }
  const dataOut = path.join(outDir, cfg.dataBase)
  const resOut = path.join(outDir, cfg.resourceBase)
  if (fs.existsSync(dataOut)) fail(`output collision: ${dataOut} already exists (vite output clashes with dataBase)`)
  if (fs.existsSync(resOut)) fail(`output collision: ${resOut} already exists (vite output clashes with resourceBase)`)

  try {
    console.log(`toy-build: copying ${dataDir} -> ${cfg.dataBase}/`)
    fs.cpSync(dataDir, dataOut, { recursive: true, filter: copyFilter })
    console.log(`toy-build: copying ${resDir} -> ${cfg.resourceBase}/`)
    fs.cpSync(resDir, resOut, { recursive: true, filter: copyFilter })
  } catch (e) {
    fs.rmSync(outDir, { recursive: true, force: true })
    fail(`copying artifact repos failed: ${e.message}`)
  }
} else if (withArtifactUrls) {
  console.log(`toy-build: fetching artifacts at runtime — data ${cfg.dataUrl}, resource ${cfg.resourceUrl}`)
  console.log('toy-build: (those hosts must send Access-Control-Allow-Origin; WebGL textures need it too)')
} else {
  console.log('toy-build: site-only toy — no data/resource artifacts bundled')
}

const { errors, warnings } = checkPackage(outDir)
for (const w of warnings) console.warn(`toy-build: WARN ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`toy-build: ERROR ${e}`)
  fail('package self-check failed — fix the above before publishing')
}

const { bytes, files } = packageSize(outDir)
console.log(`toy-build: OK — ${outDir}`)
console.log(`toy-build: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB uncompressed`)
console.log('toy-build: (the platform size limit is server-side; the publish API is the authority)')
