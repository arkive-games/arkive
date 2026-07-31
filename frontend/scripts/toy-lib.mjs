// Shared helpers for the toy build/publish scripts. Pure logic lives here so
// vitest can cover it; the CLI entry points (toy-build/toy-publish/toy-serve)
// stay thin orchestration.
import fs from 'node:fs'
import path from 'node:path'

export const VISIBILITIES = ['link-only', 'password', 'public']
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const FOLDER_RE = /^[A-Za-z0-9._-]+$/
// Entries that must never ship inside a toy package.
const FORBIDDEN = new Set(['.git', 'node_modules', 'toy.yaml', '.DS_Store', '__MACOSX'])

/** Minimal --flag parser, same conventions as changelog-add.mjs. */
export function parseArgs(argv, booleanFlags = []) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    if (booleanFlags.includes(key)) {
      out[key] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${key} needs a value`)
    }
    out[key] = value
    i++
  }
  return out
}

export function validateToyConfig(cfg) {
  for (const key of ['slug', 'title', 'visibility', 'dataDir', 'resourceDir', 'dataBase', 'resourceBase']) {
    if (typeof cfg[key] !== 'string' || cfg[key] === '') {
      throw new Error(`toy.config.json: missing or empty "${key}"`)
    }
  }
  if (!SLUG_RE.test(cfg.slug)) {
    throw new Error(`toy.config.json: slug "${cfg.slug}" must be lowercase-hyphen (and it is permanent once published)`)
  }
  if (!VISIBILITIES.includes(cfg.visibility)) {
    throw new Error(`toy.config.json: visibility must be one of ${VISIBILITIES.join('|')}`)
  }
  for (const key of ['dataBase', 'resourceBase']) {
    if (!FOLDER_RE.test(cfg[key])) {
      throw new Error(`toy.config.json: "${key}" must be a plain folder name, got "${cfg[key]}"`)
    }
  }
  return cfg
}

export function loadToyConfig(appDir) {
  const file = path.join(appDir, 'toy.config.json')
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found — this app has no toy config yet`)
  }
  return validateToyConfig(JSON.parse(fs.readFileSync(file, 'utf8')))
}

/** Walk ancestor dirs for a sibling artifact repo (mirrors the dev middleware). */
export function siblingRepo(startDir, name) {
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const p = path.resolve(dir, name)
    if (fs.existsSync(p)) return p
    dir = path.dirname(dir)
  }
  return null
}

/**
 * Static self-check of a built toy package: index.html at root, no
 * root-absolute src/href in HTML, no forbidden entries.
 */
export function checkPackage(dir) {
  const errors = []
  const warnings = []
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    errors.push('index.html missing at the package root')
  }
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (FORBIDDEN.has(entry.name)) {
        errors.push(`forbidden entry in package: ${path.relative(dir, full)}`)
        continue
      }
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.html?$/i.test(entry.name)) {
        const html = fs.readFileSync(full, 'utf8')
        // src="/x" or href="/x" — root-absolute, resolves outside /toy/<slug>/.
        // "//host/..." (protocol-relative) is external and allowed.
        const m = html.match(/(?:src|href)\s*=\s*["']\/(?!\/)[^"']*/g)
        if (m) {
          errors.push(`root-absolute reference(s) in ${path.relative(dir, full)}: ${m.slice(0, 5).join(', ')}`)
        }
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return { errors, warnings }
}

/**
 * create-vs-update decision: local history record wins, then a slug match in
 * mylist, else create. Field names tolerate both `slug` and `sub_dir`.
 */
export function decidePublishAction({ history, mylist, slug }) {
  const fromHistory = (history ?? []).find((r) => r && r.id != null)
  if (fromHistory) {
    return { mode: 'update', id: String(fromHistory.id), reason: 'local publish history has a record for this package dir' }
  }
  const fromMylist = (mylist ?? []).find((t) => t && (t.slug === slug || t.sub_dir === slug))
  if (fromMylist) {
    return { mode: 'update', id: String(fromMylist.id), reason: `mylist has a toy with slug "${slug}"` }
  }
  return { mode: 'create', reason: `no history record and no toy with slug "${slug}" in mylist` }
}

/** Locate the toy binary: TOY_BIN env, PATH, then the default Windows install dir. */
export function toyBinCandidates(env = process.env) {
  const out = []
  if (env.TOY_BIN) out.push(env.TOY_BIN)
  out.push('toy')
  if (env.LOCALAPPDATA) out.push(path.join(env.LOCALAPPDATA, 'Programs', 'toy', 'toy.exe'))
  return out
}

/** Recursive size + file count, for the build summary. */
export function packageSize(dir) {
  let bytes = 0
  let files = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else { bytes += fs.statSync(full).size; files++ }
    }
  }
  walk(dir)
  return { bytes, files }
}
