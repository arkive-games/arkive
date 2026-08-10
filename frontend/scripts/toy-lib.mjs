// Shared helpers for the toy build/publish scripts. Pure logic lives here so
// vitest can cover it; the CLI entry points (toy-build/toy-publish/toy-serve)
// stay thin orchestration.
import fs from 'node:fs'
import path from 'node:path'

export const VISIBILITIES = ['link-only', 'password', 'public']
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const FOLDER_RE = /^[A-Za-z0-9._-]+$/
/**
 * The artifact-bundling keys, an all-or-nothing group: a game app ships its
 * `data-<app>` + `resource-<app>` repos inside the package, while the portal
 * (`apps/meta`, slug `arkive`) is pure site with nothing to fetch. A partial
 * set is always a mistake — e.g. a `dataBase` with no `dataDir` would inject
 * `VITE_DATA_BASE_URL` pointing at a folder the build never copies.
 */
export const ARTIFACT_KEYS = ['dataDir', 'resourceDir', 'dataBase', 'resourceBase']
/**
 * The alternative to bundling: point the app at the same CDN the website uses
 * and ship only the site. A pair, and mutually exclusive with ARTIFACT_KEYS.
 *
 * Why this exists: aion2's artifacts are 29k files, and while the platform
 * accepted the 130 MB upload it returned 504 on every attempt to generate the
 * preview — palworld bundles fine at 4.4k files, so the per-file work is what
 * does not scale. Fetching cross-origin is viable because the hosts send
 * `Access-Control-Allow-Origin: *` and the GL engine already sets
 * `crossOrigin: "anonymous"` on its tile and icon loaders (a WebGL texture
 * needs that even when the server permits it; a plain <img> would not).
 *
 * The trade: the toy stops being self-contained, so it breaks if the CDN does.
 */
export const ARTIFACT_URL_KEYS = ['dataUrl', 'resourceUrl']
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

/** True when this toy bundles data/resource artifact repos (validated config). */
export function bundlesArtifacts(cfg) {
  return cfg.dataDir !== undefined
}

/** True when this toy fetches its artifacts from absolute URLs instead. */
export function fetchesArtifacts(cfg) {
  return cfg.dataUrl !== undefined
}

export function validateToyConfig(cfg) {
  for (const key of ['slug', 'title', 'visibility']) {
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
  for (const key of ARTIFACT_KEYS) {
    if (cfg[key] !== undefined && (typeof cfg[key] !== 'string' || cfg[key] === '')) {
      throw new Error(`toy.config.json: "${key}" must be a non-empty string when present`)
    }
  }
  const present = ARTIFACT_KEYS.filter((key) => cfg[key] !== undefined)
  if (present.length !== 0 && present.length !== ARTIFACT_KEYS.length) {
    const missing = ARTIFACT_KEYS.filter((key) => cfg[key] === undefined)
    throw new Error(
      `toy.config.json: ${ARTIFACT_KEYS.join('/')} are all-or-nothing — got ${present.join(', ')} ` +
      `but missing ${missing.join(', ')} (omit all four for a site-only toy such as the portal)`,
    )
  }
  if (bundlesArtifacts(cfg)) {
    for (const key of ['dataBase', 'resourceBase']) {
      if (!FOLDER_RE.test(cfg[key])) {
        throw new Error(`toy.config.json: "${key}" must be a plain folder name, got "${cfg[key]}"`)
      }
    }
    if (cfg.dataBase === cfg.resourceBase) {
      throw new Error(`toy.config.json: dataBase and resourceBase must differ, both are "${cfg.dataBase}"`)
    }
  }
  validateArtifactUrls(cfg)
  return cfg
}

function validateArtifactUrls(cfg) {
  const present = ARTIFACT_URL_KEYS.filter((key) => cfg[key] !== undefined)
  if (present.length === 0) return
  if (present.length !== ARTIFACT_URL_KEYS.length) {
    const missing = ARTIFACT_URL_KEYS.filter((key) => cfg[key] === undefined)
    throw new Error(
      `toy.config.json: ${ARTIFACT_URL_KEYS.join('/')} are a pair — got ${present.join(', ')} ` +
      `but missing ${missing.join(', ')}`,
    )
  }
  if (bundlesArtifacts(cfg)) {
    throw new Error(
      `toy.config.json: ${ARTIFACT_URL_KEYS.join('/')} and ${ARTIFACT_KEYS.join('/')} are mutually ` +
      'exclusive — a toy either bundles its artifacts or fetches them, not both',
    )
  }
  for (const key of ARTIFACT_URL_KEYS) {
    const value = cfg[key]
    if (typeof value !== 'string' || value === '') {
      throw new Error(`toy.config.json: "${key}" must be a non-empty string`)
    }
    // Absolute https only: a toy is served from https://www.bilibili.com, so a
    // protocol-relative or http URL is mixed content the browser will block,
    // and a relative one would resolve inside the package that has no files.
    let url
    try {
      url = new URL(value)
    } catch {
      throw new Error(`toy.config.json: "${key}" must be an absolute URL, got "${value}"`)
    }
    if (url.protocol !== 'https:') {
      throw new Error(`toy.config.json: "${key}" must be https, got "${value}"`)
    }
    if (value.endsWith('/')) {
      throw new Error(`toy.config.json: "${key}" must not end in "/" (the app joins path segments itself), got "${value}"`)
    }
  }
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
        //
        // `/toy/<slug>/...` is allowed too, and is the ONE legitimate root-absolute
        // form: every toy shares one origin, so this is how a toy reaches a sibling
        // (the portal ships the shared fonts and the others reference them, and the
        // inter-toy nav links work the same way). It has to be root-absolute --
        // relative would resolve inside the referring toy -- and it has to spell out
        // the file, since a bare directory URL 404s on this host.
        const m = html.match(/(?:src|href)\s*=\s*["']\/(?!\/)[^"']*/g)
          ?.filter((hit) => !/["']\/toy\/[\w-]+\/.+/.test(hit))
        if (m?.length) {
          errors.push(`root-absolute reference(s) in ${path.relative(dir, full)}: ${m.slice(0, 5).join(', ')}`)
        }
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return { errors, warnings }
}

/**
 * Real `toy mylist --json` records (verified 2026-07-31, CLI v0.3.2) carry no
 * `slug`/`sub_dir` field at all — the slug only appears as a path segment in
 * `url` (e.g. `https://www.bilibili.com/toy/<slug>/index.html`). Extract it
 * from there as a fallback for records that don't expose `slug`/`sub_dir`
 * directly (kept in case a future CLI version adds one).
 */
export function slugFromToyUrl(url) {
  if (typeof url !== 'string') return null
  const m = url.match(/\/toy\/([^/]+)\//)
  return m ? m[1] : null
}

/**
 * create-vs-update decision: local history record wins, then a slug match in
 * mylist, else create. A history record only matches when it carries no
 * `slug`/`sub_dir` field (unverified real-CLI shape, so id alone is trusted)
 * or when that field equals the `slug` argument — a record for a different
 * toy is skipped. mylist matches require `slug`/`sub_dir` to equal `slug`,
 * or — since real records carry neither — the slug extracted from `url`.
 */
export function decidePublishAction({ history, mylist, slug }) {
  const fromHistory = (history ?? []).find((r) => {
    if (!r || r.id == null) return false
    const recordSlug = r.slug ?? r.sub_dir
    return recordSlug == null || recordSlug === slug
  })
  if (fromHistory) {
    return { mode: 'update', id: String(fromHistory.id), reason: 'local publish history has a record for this package dir' }
  }
  const fromMylist = (mylist ?? []).find((t) => {
    if (!t) return false
    if (t.slug === slug || t.sub_dir === slug) return true
    return slugFromToyUrl(t.url) === slug
  })
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

/**
 * Rewrite every `*.yaml` in a package to `*.json`, returning the count.
 *
 * The toy content host 404s `.yaml` (verified 2026-07-31 against a real
 * preview: `.html`, `.js`, `.css`, `.webp`, `.svg` and `.png` all serve, only
 * `.yaml` does not), and an app whose UI catalogues are YAML would render
 * untranslated with no clue why. Apps that read these back must ask for
 * `.json` in a toy build; `yaml.parse` accepts either, JSON being a subset.
 */
export function countYaml(dir) {
  let n = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.ya?ml$/i.test(entry.name)) n++
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return n
}

export function yamlToJson(dir, parse) {
  let converted = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.ya?ml$/i.test(entry.name)) {
        const doc = parse(fs.readFileSync(full, 'utf8'))
        fs.writeFileSync(full.replace(/\.ya?ml$/i, '.json'), JSON.stringify(doc))
        fs.rmSync(full)
        converted++
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return converted
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
