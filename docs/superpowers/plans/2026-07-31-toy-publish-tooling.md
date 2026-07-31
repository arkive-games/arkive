# Toy Build & Publish Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universal `pnpm toy:build` / `pnpm toy:publish` commands that package a frontend app plus its `data-*`/`resource-*` artifact repos into a single self-contained Bilibili Toy and drive the `toy` CLI, with palworld as the first configured app.

**Architecture:** Per-app `toy.config.json` declares toy identity and artifact-repo names. A shared helper module (`toy-lib.mjs`) holds the pure, unit-tested logic (config validation, package self-check, create-vs-update decision); three thin CLI scripts (`toy-build.mjs`, `toy-publish.mjs`, `toy-serve.mjs`) orchestrate. A `VITE_TOY` env flag flips the palworld router to hash history so deep links survive under `/toy/<slug>/`.

**Tech Stack:** Dependency-free Node ESM scripts (same style as `scripts/changelog-add.mjs`), vitest for unit tests, TanStack Router `createHashHistory`, the `toy` CLI (v0.3.2, `--json` contract).

**Spec:** `docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md`

---

## Preamble for the executor

- **Worktree:** per project convention, do this work in a git worktree. **Local `master` is ahead of `origin/master`** — `EnterWorktree` branches from `origin/master`, so immediately after creating the worktree run `git rebase master` (rebase the worktree branch onto the *local* master) or you will silently build against stale code. (See memory: worktrees branch from origin, not local.)
- **Integration:** merge back with rebase (no merge commits). No changelog entry — tooling is not a user-visible site feature.
- **All commits are signed automatically** (`commit.gpgsign=true`); never `--no-gpg-sign`. Stage explicit paths, never `git add -A`.
- Working directory for all `pnpm` commands: `frontend/`.
- The `toy` binary lives at `%LOCALAPPDATA%\Programs\toy\toy.exe` on this machine (not on PATH).

---

### Task 1: Shared helper module `toy-lib.mjs` with unit tests

**Files:**
- Create: `frontend/scripts/toy-lib.mjs`
- Create: `frontend/scripts/toy-lib.test.mjs`
- Modify: `frontend/vitest.config.ts`

- [ ] **Step 1: Add `scripts/**` to the vitest include list**

```ts
// frontend/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "packages/**/test/**/*.test.ts",
      "apps/**/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    environment: "node",
  },
});
```

- [ ] **Step 2: Write the failing tests**

```js
// frontend/scripts/toy-lib.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  validateToyConfig,
  checkPackage,
  decidePublishAction,
} from './toy-lib.mjs'

const GOOD_CONFIG = {
  slug: 'arkive-palworld',
  title: '幻兽帕鲁 · Arkive',
  visibility: 'public',
  dataDir: 'data-palworld',
  resourceDir: 'resource-palworld',
  dataBase: 'data',
  resourceBase: 'palres',
}

describe('validateToyConfig', () => {
  it('accepts a complete config', () => {
    expect(() => validateToyConfig(GOOD_CONFIG)).not.toThrow()
  })
  it('rejects a missing required key', () => {
    const { slug, ...rest } = GOOD_CONFIG
    expect(() => validateToyConfig(rest)).toThrow(/slug/)
  })
  it('rejects an invalid slug (uppercase / leading hyphen)', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, slug: 'Arkive-Palworld' })).toThrow(/slug/)
    expect(() => validateToyConfig({ ...GOOD_CONFIG, slug: '-palworld' })).toThrow(/slug/)
  })
  it('rejects an unknown visibility', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, visibility: 'private' })).toThrow(/visibility/)
  })
  it('rejects dataBase/resourceBase containing path separators', () => {
    expect(() => validateToyConfig({ ...GOOD_CONFIG, dataBase: 'a/b' })).toThrow(/dataBase/)
    expect(() => validateToyConfig({ ...GOOD_CONFIG, resourceBase: '../x' })).toThrow(/resourceBase/)
  })
})

describe('checkPackage', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'toy-pkg-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('passes a clean package', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><head><script src="./assets/app.js"></script></head></html>')
    mkdirSync(path.join(dir, 'assets'))
    writeFileSync(path.join(dir, 'assets', 'app.js'), '')
    expect(checkPackage(dir).errors).toEqual([])
  })
  it('errors when index.html is missing at the root', () => {
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/index\.html/)
  })
  it('errors on root-absolute src/href in HTML', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><script src="/assets/app.js"></script></html>')
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/root-absolute/)
  })
  it('does not flag protocol-relative or external URLs', () => {
    writeFileSync(path.join(dir, 'index.html'),
      '<html><a href="https://example.com/x">x</a><img src="//cdn.example.com/i.png"></html>')
    expect(checkPackage(dir).errors).toEqual([])
  })
  it('errors on forbidden entries (.git, node_modules, toy.yaml)', () => {
    writeFileSync(path.join(dir, 'index.html'), '<html></html>')
    mkdirSync(path.join(dir, 'sub', '.git'), { recursive: true })
    writeFileSync(path.join(dir, 'toy.yaml'), '')
    const { errors } = checkPackage(dir)
    expect(errors.join('\n')).toMatch(/\.git/)
    expect(errors.join('\n')).toMatch(/toy\.yaml/)
  })
})

describe('decidePublishAction', () => {
  it('prefers the local history record', () => {
    const action = decidePublishAction({
      history: [{ id: '123', slug: 'arkive-palworld' }],
      mylist: [],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '123', reason: expect.stringContaining('history') })
  })
  it('falls back to a slug match in mylist', () => {
    const action = decidePublishAction({
      history: [],
      mylist: [{ id: '456', slug: 'arkive-palworld' }, { id: '789', slug: 'other' }],
      slug: 'arkive-palworld',
    })
    expect(action).toEqual({ mode: 'update', id: '456', reason: expect.stringContaining('mylist') })
  })
  it('creates when neither knows the slug', () => {
    const action = decidePublishAction({ history: [], mylist: [], slug: 'arkive-palworld' })
    expect(action.mode).toBe('create')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `frontend/`): `pnpm vitest run scripts/toy-lib.test.mjs`
Expected: FAIL — `Cannot find module './toy-lib.mjs'`.

- [ ] **Step 4: Implement `toy-lib.mjs`**

```js
// frontend/scripts/toy-lib.mjs
// Shared helpers for the toy build/publish scripts. Pure logic lives here so
// vitest can cover it; the CLI entry points (toy-build/toy-publish/toy-serve)
// stay thin orchestration.
import fs from 'node:fs'
import path from 'node:path'

export const VISIBILITIES = ['link-only', 'password', 'public']
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const FOLDER_RE = /^[A-Za-z0-9._-]+$/
// Entries that must never ship inside a toy package (skill content checklist §3).
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
 * Static self-check of a built toy package (skill content checklist §1/§3):
 * index.html at root, no root-absolute src/href in HTML, no forbidden entries.
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
 * create-vs-update decision (skill workflow D): local history record wins,
 * then a slug match in mylist, else create. Field names tolerate both `slug`
 * and `sub_dir` — verify against real `--json` output during integration.
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `frontend/`): `pnpm vitest run scripts/toy-lib.test.mjs`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Run the full test suite to check nothing else broke**

Run (from `frontend/`): `pnpm test`
Expected: PASS (changelog validators etc. unaffected).

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts/toy-lib.mjs frontend/scripts/toy-lib.test.mjs frontend/vitest.config.ts
git commit -m "feat(frontend): shared helpers for toy packaging scripts"
```

---

### Task 2: Palworld toy config + hash-history toggle

**Files:**
- Create: `frontend/apps/palworld/toy.config.json`
- Modify: `frontend/apps/palworld/src/main.tsx:3-9` (imports) and `:301` (router)
- Modify: `frontend/apps/palworld/env.d.ts`

- [ ] **Step 1: Write `toy.config.json`** (no `poster` yet — artwork comes later)

```json
{
  "slug": "arkive-palworld",
  "title": "幻兽帕鲁 · Arkive",
  "visibility": "public",
  "dataDir": "data-palworld",
  "resourceDir": "resource-palworld",
  "dataBase": "data",
  "resourceBase": "palres"
}
```

- [ ] **Step 2: Declare `VITE_TOY` in `env.d.ts`**

```ts
interface ImportMetaEnv {
  readonly VITE_DATA_BASE_URL?: string
  readonly VITE_RESOURCE_BASE_URL?: string
  readonly VITE_HOME_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_ICP_BEIAN?: string
  readonly VITE_TOY?: string
}
```

- [ ] **Step 3: Switch the router to hash history under `VITE_TOY`**

In `frontend/apps/palworld/src/main.tsx`, add `createHashHistory` to the existing
`@tanstack/react-router` import block:

```ts
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
```

and replace line 301:

```ts
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
```

with:

```ts
// Toy builds (VITE_TOY, see scripts/toy-build.mjs) are served under
// https://www.bilibili.com/toy/<slug>/ where only index.html exists as a real
// file — deep links must live in the hash or refreshes 404.
const router = import.meta.env.VITE_TOY
  ? createRouter({ routeTree, history: createHashHistory(), basepath: '/' })
  : createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
```

- [ ] **Step 4: Verify the normal (non-toy) build still typechecks and builds**

Run (from `frontend/`): `pnpm build:palworld`
Expected: `tsc -b` clean, vite build completes, output in `apps/palworld/dist/`.

- [ ] **Step 5: Verify unit tests still pass**

Run (from `frontend/`): `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/palworld/toy.config.json frontend/apps/palworld/env.d.ts frontend/apps/palworld/src/main.tsx
git commit -m "feat(palworld): toy config and hash-history routing for toy builds"
```

---

### Task 3: Build script `toy-build.mjs`

**Files:**
- Create: `frontend/scripts/toy-build.mjs`
- Modify: `frontend/package.json` (scripts)
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Implement the script**

```js
#!/usr/bin/env node
// Build a frontend app as a self-contained Bilibili Toy package:
//   pnpm toy:build --app palworld
// Output: frontend/apps/<app>/dist-toy/ = vite build (relative base, hash
// routing via VITE_TOY) + the data-<app> and resource-<app> artifact repos.
// Spec: docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs, loadToyConfig, siblingRepo, checkPackage, packageSize } from './toy-lib.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`toy-build: ${message}`)
  process.exit(1)
}

let args
try { args = parseArgs(process.argv.slice(2)) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app palworld)')
const appDir = path.join(FRONTEND, 'apps', app)
if (!fs.existsSync(appDir)) fail(`no such app: ${appDir}`)

let cfg
try { cfg = loadToyConfig(appDir) } catch (e) { fail(e.message) }

const dataDir = process.env.TOY_DATA_DIR ?? siblingRepo(appDir, cfg.dataDir)
const resDir = process.env.TOY_RES_DIR ?? siblingRepo(appDir, cfg.resourceDir)
if (!dataDir) fail(`artifact repo "${cfg.dataDir}" not found in ancestor dirs (override with TOY_DATA_DIR)`)
if (!resDir) fail(`artifact repo "${cfg.resourceDir}" not found in ancestor dirs (override with TOY_RES_DIR)`)

const outDir = path.join(appDir, 'dist-toy')
const env = {
  ...process.env,
  VITE_TOY: '1',
  VITE_DATA_BASE_URL: cfg.dataBase,
  VITE_RESOURCE_BASE_URL: cfg.resourceBase,
}

console.log(`toy-build: building ${app} (slug ${cfg.slug})`)
execSync(`pnpm --filter ${app} exec tsc -b`, { cwd: FRONTEND, stdio: 'inherit' })
execSync(`pnpm --filter ${app} exec vite build --base ./ --outDir dist-toy --emptyOutDir`, {
  cwd: FRONTEND,
  stdio: 'inherit',
  env,
})

// Bundle the artifact repos. Excluded: VCS dirs and edgeone.json (host config,
// not content the app fetches).
const copyFilter = (src) => {
  const base = path.basename(src)
  if (base === '.git') return false
  if (base === 'edgeone.json') return false
  return true
}
console.log(`toy-build: copying ${dataDir} -> ${cfg.dataBase}/`)
fs.cpSync(dataDir, path.join(outDir, cfg.dataBase), { recursive: true, filter: copyFilter })
console.log(`toy-build: copying ${resDir} -> ${cfg.resourceBase}/`)
fs.cpSync(resDir, path.join(outDir, cfg.resourceBase), { recursive: true, filter: copyFilter })

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
```

- [ ] **Step 2: Wire the workspace script and gitignore**

In `frontend/package.json` scripts, after `"changelog:verify"`:

```json
"toy:build": "node scripts/toy-build.mjs",
```

In the repo-root `.gitignore`, after the `dist-ssr` line:

```
dist-toy
```

- [ ] **Step 3: Run the build for palworld**

Run (from `frontend/`): `pnpm toy:build --app palworld`
Expected: tsc + vite complete; copy logs for both repos; self-check OK; summary
around `~3700+ files, ~120 MB uncompressed`; exit code 0.

- [ ] **Step 4: Assert the package structure**

Run (from `frontend/`):
```bash
ls apps/palworld/dist-toy/index.html apps/palworld/dist-toy/data/version.json
ls apps/palworld/dist-toy/palres | head
grep -o 'src="[^"]*"' apps/palworld/dist-toy/index.html
git status --short   # dist-toy must NOT appear
```
Expected: files exist; `palres/` lists `icons/ layouts/ notes/ tiles/`; all
`src=` values start with `./`; `dist-toy` absent from git status.

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/toy-build.mjs frontend/package.json .gitignore
git commit -m "feat(frontend): toy-build script bundles an app with its data+resource artifacts"
```

---

### Task 4: Publish script `toy-publish.mjs`

**Files:**
- Create: `frontend/scripts/toy-publish.mjs`
- Modify: `frontend/package.json` (scripts)

- [ ] **Step 1: Verify the real `--json` field names** (read-only commands, safe)

```bash
"$LOCALAPPDATA/Programs/toy/toy.exe" mylist --json
"$LOCALAPPDATA/Programs/toy/toy.exe" history --json
```
Note the actual property names for a toy's id and slug (`id`, `slug` or
`sub_dir`, …). If they differ from what `decidePublishAction` in `toy-lib.mjs`
expects, fix `decidePublishAction` (and its tests) first, in this task.
If the CLI reports the session expired, tell the user to run `toy login`
themselves (it opens a browser) and continue afterwards.

- [ ] **Step 2: Implement the script**

```js
#!/usr/bin/env node
// Upload a built toy package and (optionally) submit it for review:
//   pnpm toy:publish --app palworld            # upload, print preview URL, STOP
//   pnpm toy:publish --app palworld --submit   # upload AND submit for review
// The two-step flag mirrors the toy CLI's own preview→confirm→review gate:
// without --submit we never pass --yes.
// Spec: docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs, loadToyConfig, checkPackage, decidePublishAction, toyBinCandidates } from './toy-lib.mjs'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(`toy-publish: ${message}`)
  process.exit(1)
}

function findToyBin() {
  for (const candidate of toyBinCandidates()) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' })
      return candidate
    } catch { /* try next */ }
  }
  fail('toy binary not found — set TOY_BIN or install the toy CLI')
}

function runToy(bin, argv, { allowFailure = false } = {}) {
  try {
    return execFileSync(bin, [...argv, '--json'], { encoding: 'utf8' })
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    if (/登录态|toy login/.test(out)) {
      fail(`session expired — run \`toy login\` yourself (it opens a browser), then retry.\n${out}`)
    }
    if (allowFailure) return null
    fail(`toy ${argv.join(' ')} failed:\n${out || e.message}`)
  }
}

function parseJson(text, label) {
  if (text == null) return null
  try { return JSON.parse(text) } catch { fail(`could not parse ${label} output as JSON:\n${text}`) }
}

let args
try { args = parseArgs(process.argv.slice(2), ['submit']) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app palworld)')
const appDir = path.join(FRONTEND, 'apps', app)
let cfg
try { cfg = loadToyConfig(appDir) } catch (e) { fail(e.message) }

const distDir = path.join(appDir, 'dist-toy')
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  fail(`${distDir} is missing or empty — run \`pnpm toy:build --app ${app}\` first`)
}
const { errors } = checkPackage(distDir)
if (errors.length) {
  for (const e of errors) console.error(`toy-publish: ERROR ${e}`)
  fail('package self-check failed')
}

const bin = findToyBin()

// create-vs-update: local publish history first, then slug match in mylist.
const history = parseJson(runToy(bin, ['history', distDir], { allowFailure: true }), 'history') ?? []
const mylistRaw = parseJson(runToy(bin, ['mylist', '--size', '50']), 'mylist')
const mylist = Array.isArray(mylistRaw) ? mylistRaw : mylistRaw?.list ?? []
const action = decidePublishAction({ history, mylist, slug: cfg.slug })
console.log(`toy-publish: ${action.mode} (${action.reason})`)

const argv = action.mode === 'create'
  ? ['create', distDir,
     '--slug', cfg.slug,
     '--title', cfg.title,
     '--visibility', cfg.visibility,
     ...(cfg.poster ? ['--poster', path.join(appDir, cfg.poster)] : [])]
  : ['update', action.id, distDir]
if (args.submit) argv.push('--yes')

console.log(`toy-publish: running toy ${argv.join(' ')}`)
const result = parseJson(runToy(bin, argv), argv[0])

if (!args.submit) {
  console.log('')
  console.log('='.repeat(72))
  console.log(`  PREVIEW ONLY — nothing was submitted for review.`)
  console.log(`  Preview URL: ${result?.preview_url ?? JSON.stringify(result)}`)
  console.log(`  Check it in a browser, then rerun with --submit to submit for review.`)
  console.log('='.repeat(72))
} else {
  console.log(`toy-publish: submitted for review — id=${result?.id} status=${result?.status}`)
  console.log(`toy-publish: share URL once approved: https://www.bilibili.com/toy/${cfg.slug}/index.html`)
}
```

- [ ] **Step 3: Wire the workspace script**

In `frontend/package.json` scripts, after `"toy:build"`:

```json
"toy:publish": "node scripts/toy-publish.mjs",
```

- [ ] **Step 4: Dry checks (no upload yet)**

Run (from `frontend/`):
```bash
node scripts/toy-publish.mjs 2>&1 | head -2                # missing --app → clear error
node scripts/toy-publish.mjs --app sts2 2>&1 | head -2     # no toy.config.json → clear error
```
Expected: both fail fast with the exact messages from the script (exit 1).
Do NOT run a real upload in this task — that is the operational step after merge.

- [ ] **Step 5: Run unit tests**

Run (from `frontend/`): `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts/toy-publish.mjs frontend/package.json
git commit -m "feat(frontend): toy-publish script with preview/submit two-step gate"
```

---

### Task 5: Subpath smoke server `toy-serve.mjs` + local verification

**Files:**
- Create: `frontend/scripts/toy-serve.mjs`
- Modify: `frontend/package.json` (scripts)

- [ ] **Step 1: Implement the server**

```js
#!/usr/bin/env node
// Serve a built toy package under its real subpath for local smoke testing:
//   pnpm toy:serve --app palworld [--port 15180]
// Mounts dist-toy at /toy/<slug>/ exactly like the platform. Deliberately NO
// SPA fallback: hash routing needs none, and a 404 here means a root-absolute
// path bug that would also break on the platform.
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
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const args = parseArgs(process.argv.slice(2))
if (!args.app) { console.error('toy-serve: --app is required'); process.exit(1) }
const appDir = path.join(FRONTEND, 'apps', args.app)
const cfg = loadToyConfig(appDir)
const root = path.join(appDir, 'dist-toy')
const prefix = `/toy/${cfg.slug}/`
const port = Number(args.port ?? 15180)

http.createServer((req, res) => {
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
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(port, () => {
  console.log(`toy-serve: http://localhost:${port}${prefix}index.html`)
})
```

- [ ] **Step 2: Wire the workspace script**

In `frontend/package.json` scripts, after `"toy:publish"`:

```json
"toy:serve": "node scripts/toy-serve.mjs",
```

- [ ] **Step 3: Smoke-test the palworld package under the subpath**

Run (from `frontend/`): `pnpm toy:serve --app palworld` (background), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15180/toy/arkive-palworld/index.html   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15180/toy/arkive-palworld/data/version.json  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15180/assets/anything.js               # 404 (proves no root-absolute escape hatch)
```

Then verify in a real browser (or Playwright): open
`http://localhost:15180/toy/arkive-palworld/index.html` and check —
- the app boots (no white screen, no 404s in the network tab),
- navigation lands on hash URLs (`#/pals`, …) and a hard refresh on a deep
  hash route still loads,
- the map renders tiles/icons (data + resource fetches resolve inside the package),
- the `?engine=` switcher still works (TanStack search params live inside the
  hash under hash history — this is the one behavior flagged for verification).

- [ ] **Step 4: Kill the server, commit**

Remember (memory: Windows orphan vite): if the server was started via a
background task, `taskkill //PID <pid> //F` the node child if TaskStop leaves
it alive.

```bash
git add frontend/scripts/toy-serve.mjs frontend/package.json
git commit -m "feat(frontend): toy-serve subpath smoke server for toy packages"
```

---

### Task 6: Docs + integration

**Files:**
- Modify: `CLAUDE.md` (workspace) — one short block under Conventions/Notes

- [ ] **Step 1: Document the commands in CLAUDE.md**

Add to the Notes section of the workspace `CLAUDE.md`:

```markdown
- **Bilibili Toy publishing:** each app can ship as a single self-contained toy
  (site + data + resource bundled). `frontend/apps/<app>/toy.config.json` holds the
  identity (slug is permanent once published). Commands (from `frontend/`):
  `pnpm toy:build --app <app>` → `dist-toy/`; `pnpm toy:serve --app <app>` to
  smoke-test under `/toy/<slug>/`; `pnpm toy:publish --app <app>` uploads a
  preview (submits nothing), `--submit` submits for review. Toy builds use hash
  routing via `VITE_TOY`. Spec: `docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the bilibili toy build/publish commands"
```

- [ ] **Step 3: Final verification sweep**

From `frontend/`:
```bash
pnpm test                    # unit tests incl. toy-lib
pnpm build:palworld          # normal build unaffected
pnpm toy:build --app palworld  # toy build end-to-end
```
Expected: all green (toy build self-check OK).

- [ ] **Step 4: Integrate** — rebase the worktree branch onto `master`, fast-forward
`master`, per `superpowers:finishing-a-development-branch`. No changelog entry.

---

## Operational follow-up (after merge — NOT part of this plan)

The actual first publish of `arkive-palworld` is an operational step driven by
the toy skill's rules, not by this tooling plan:

1. `pnpm toy:build --app palworld && pnpm toy:publish --app palworld` → preview URL.
2. The user checks the preview in a browser.
3. Explicit user confirmation (per the toy skill's iron rule 2) → rerun with `--submit`.
4. Poster artwork (4:3, ~1200×900 map screenshot) can be added to the config and
   applied via a later `update`.
5. If the platform rejects the package for size, revisit trimming (spec: out of scope).
