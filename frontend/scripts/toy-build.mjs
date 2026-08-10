#!/usr/bin/env node
// Build a frontend app as a self-contained Bilibili Toy package:
//   pnpm toy:build --app palworld
// Output: frontend/apps/<app>/dist-toy/ = vite build (relative base, hash
// routing via VITE_TOY) + the data-<app> and resource-<app> artifact repos.
// Site-only toys (no artifact keys in the config, e.g. the `arkive` portal)
// skip the artifact lookup/copy entirely.
// Spec: docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs, loadToyConfig, bundlesArtifacts, fetchesArtifacts, siblingRepo, checkPackage, packageSize, yamlToJson, countYaml } from './toy-lib.mjs'

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

// The portal toy is the one that ships the fonts; every other toy points at it.
// Its slug is read from its own config rather than hard-coded, since a slug is
// permanent once published and duplicating it invites the two to drift.
const PORTAL_APP = 'meta'
const hostsFonts = app === PORTAL_APP
const portalSlug = loadToyConfig(path.join(FRONTEND, 'apps', PORTAL_APP)).slug
// The version directory is a content hash from `pnpm fonts:sync`; read it from the
// manifest so this URL cannot drift from what the portal actually ships.
const FONT_MANIFEST = path.join(FRONTEND, 'apps/meta/public/fonts/noto-sans/manifest.json')
if (!fs.existsSync(FONT_MANIFEST)) fail('font manifest is missing; run pnpm fonts:sync')
const fontVersion = JSON.parse(fs.readFileSync(FONT_MANIFEST, 'utf8')).version
// Spelled out to the file: a bare directory URL 404s on the toy host.
const FONT_TOY_URL = `/toy/${portalSlug}/fonts/noto-sans/${fontVersion}/index.css`

/** Files under a directory, recursively -- for the size/count reporting only. */
function countFiles(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1
  }
  return total
}
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
  // The portal keeps the plugin's relative default (it ships the files); everyone
  // else resolves to the portal toy's copy on the same origin.
  ...(hostsFonts ? {} : { VITE_FONT_STYLESHEET_URL: FONT_TOY_URL }),
}

console.log(`toy-build: building ${app} (slug ${cfg.slug})`)
execSync(`pnpm --filter ${app} exec tsc -b`, { cwd: FRONTEND, stdio: 'inherit' })
execSync(`pnpm --filter ${app} exec vite build --base ./ --outDir dist-toy --emptyOutDir`, {
  cwd: FRONTEND,
  stdio: 'inherit',
  env,
})

// Fonts: shipped by the PORTAL toy only, and referenced by the others.
//
// Every toy lives on one origin, differing by path (/toy/<slug>/), so they share a
// cache partition and need no CORS -- one copy serves all of them, and cross-toy
// absolute paths are already how the toys link to each other. Copying the 206
// subsets into each toy instead cost ~209 files and ~8.5 MB apiece, which matters:
// this platform has a byte limit AND a separate limit on FILE COUNT that surfaces
// as a 504.
//
// The trade-off is a real dependency: a toy referencing the portal degrades to
// fallback CJK (font-display: swap) if the portal toy is republished without this
// exact versioned path, or unpublished. Keep the version directory stable unless the
// font content actually changes.
const fontSource = path.join(FRONTEND, 'apps', 'meta', 'public', 'fonts')
if (!fs.existsSync(fontSource)) fail('shared font assets are missing; run pnpm fonts:sync')
if (hostsFonts) {
  // Vite already copied public/fonts for the portal; only copy if it did not.
  const fontOut = path.join(outDir, 'fonts')
  if (!fs.existsSync(fontOut)) fs.cpSync(fontSource, fontOut, { recursive: true })
  console.log(`toy-build: ships the shared fonts (${countFiles(fontSource)} files)`)
} else {
  console.log(`toy-build: fonts referenced from ${FONT_TOY_URL} (not bundled)`)
}

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

// The toy content host 404s .yaml, so anything the app fetches as YAML has to
// become JSON here (see yamlToJson). Only the app's own files: a bundled
// artifact repo is served from this package too, but its catalogues are
// already JSON.
{
  // Resolved from the APP, not this script: `yaml` is the app's dependency,
  // and converting with the same version the app parses with is what keeps the
  // rewrite faithful.
  const appRequire = createRequire(path.join(appDir, 'package.json'))
  let parse
  try {
    ;({ parse } = appRequire('yaml'))
  } catch {
    parse = null
  }
  const yamlCount = countYaml(outDir)
  if (yamlCount && !parse) {
    fail(`${yamlCount} .yaml file(s) in the package but "yaml" is not resolvable from ${app} — the toy host 404s .yaml, so they must be converted`)
  }
  if (parse) {
    const converted = yamlToJson(outDir, parse)
    if (converted) console.log(`toy-build: rewrote ${converted} .yaml file(s) to .json (the toy host does not serve .yaml)`)
  }
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
