// Print every state-memory key the repo defines, sorted, and fail on a collision.
//
// Storage keys are the one part of this system users carry between deploys, and
// both ways of breaking them are invisible to tests: rename a key and everybody
// silently restarts from the default; define one key twice and the two definitions
// overwrite each other. Both are "working as written". A committed, sorted list
// makes them show up as a diff to review.
//
// The declared dimensions are recorded too, because adding or removing one MOVES
// every stored value between the base key and the partitioned keys -- a change the
// key string alone does not reveal.
//
// Static scan rather than importing the apps: a record registers when its module
// is imported, and importing six Vite apps in Node to read a registry would be far
// more machinery than reading the source.
//
// Usage: node scripts/memory-keys.mjs [--check]

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SEARCH = ['apps', 'packages']
const SNAPSHOT = path.join(ROOT, 'scripts', 'memory-keys.txt')
const CLASS_METHODS = ['preference', 'progress', 'session', 'draft', 'recent']

/** Every .ts/.tsx file under the searched trees, excluding tests and build output. */
function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'dist-toy', '.vite', 'e2e'].includes(entry.name)) continue
      sources(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** name -> namespace for every `export const x = memoryFor('ns')` in the repo, so a
 *  binding imported from another module still resolves to a real key. */
function exportedNamespaces(files) {
  const map = new Map()
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/export\s+const\s+(\w+)\s*=\s*memoryFor\(\s*['"]([\w-]+)['"]/g)) {
      map.set(m[1], m[2])
    }
  }
  return map
}

/** The declared `keyedBy` dimension names, sorted. */
function dimensionsOf(tail) {
  const block = /keyedBy:\s*\{([^}]*)\}/.exec(tail ?? '')
  if (!block) return ''
  return [...block[1].matchAll(/(\w+)\s*:\s*true/g)].map((m) => m[1]).sort().join('+')
}

function keysIn(file, text, exported) {
  const found = []
  const relative = path.relative(ROOT, file).replaceAll('\\', '/')

  const local = new Map()
  for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*memoryFor\(\s*['"]([\w-]+)['"]/g)) {
    local.set(m[1], m[2])
  }

  const classCall = new RegExp(
    `\\b(\\w+)\\.(${CLASS_METHODS.join('|')})\\(\\s*['"]([\\w-]+)/([\\w-]+)['"]([\\s\\S]{0,400}?)\\}\\)`,
    'g',
  )
  for (const m of text.matchAll(classCall)) {
    const namespace = local.get(m[1]) ?? exported.get(m[1])
    if (!namespace) {
      // Only complain about names that look like a memory binding; plenty of other
      // objects have a `.session(` method.
      if (!/[Mm]emory$/.test(m[1])) continue
      throw new Error(
        `${relative}: cannot resolve the namespace behind "${m[1]}" -- export it as ` +
        '`export const x = memoryFor("ns")` so the key list stays complete',
      )
    }
    found.push({
      key: `arkive.memory.${namespace}.${m[3]}.${m[4]}`,
      file: relative,
      dims: dimensionsOf(m[5]),
    })
  }

  // Cross-site records always live under `site`.
  for (const m of text.matchAll(/\bsharedMemory\(\s*['"]([\w-]+)\/([\w-]+)['"]([\s\S]{0,400}?)\}\)/g)) {
    found.push({
      key: `arkive.memory.site.${m[1]}.${m[2]}`,
      file: relative,
      dims: dimensionsOf(m[3]),
    })
  }

  // Original API: an object literal carrying id / namespace / surface.
  for (const body of defineMemoryRecordBodies(text)) {
    const id = /\bid:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    const namespace = /\bnamespace:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    const surface = /\bsurface:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    if (!id || !namespace || !surface) continue
    const dims = [
      /\baccount:\s*true/.test(body) ? 'account' : '',
      /\bviewport:\s*true/.test(body) ? 'viewport' : '',
    ].filter(Boolean).join('+')
    found.push({ key: `arkive.memory.${namespace}.${surface}.${id}`, file: relative, dims })
  }
  return found
}

/**
 * The object literal of every `defineMemoryRecord({ ... })` call in a file.
 *
 * Brace-matched rather than length-capped. The previous version read at most 600
 * characters and then required a literal `})`, so a record whose body ran longer
 * -- `aion2.wiki.recent-entries`, whose `validate` is an eight-line predicate --
 * matched nothing at all and was silently absent from the inventory. A snapshot
 * that omits records is worse than no snapshot: `memory:keys:check` passed while
 * the registry it is supposed to enumerate was incomplete.
 *
 * String bodies are skipped so a brace inside a literal cannot unbalance the
 * scan.
 */
function defineMemoryRecordBodies(text) {
  const bodies = []
  const call = /defineMemoryRecord\s*(?:<[^>]*>)?\s*\(\s*\{/g
  for (const match of text.matchAll(call)) {
    let i = match.index + match[0].length
    const start = i
    let depth = 1
    let quote = ''
    while (i < text.length && depth > 0) {
      const c = text[i]
      if (quote) {
        if (c === '\\') i += 1
        else if (c === quote) quote = ''
      } else if (c === "'" || c === '"' || c === '`') {
        quote = c
      } else if (c === '{') {
        depth += 1
      } else if (c === '}') {
        depth -= 1
      }
      i += 1
    }
    if (depth === 0) bodies.push(text.slice(start, i - 1))
  }
  return bodies
}

const files = SEARCH
  .map((dir) => path.join(ROOT, dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap((dir) => sources(dir))
const exported = exportedNamespaces(files)
const all = files.flatMap((file) => keysIn(file, fs.readFileSync(file, 'utf8'), exported))

const byKey = new Map()
for (const entry of all) {
  const record = byKey.get(entry.key) ?? { count: 0, files: new Set(), dims: new Set() }
  record.count += 1
  record.files.add(entry.file)
  record.dims.add(entry.dims)
  byKey.set(entry.key, record)
}

const lines = [...byKey.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, { files, dims }]) => {
    const keyed = [...dims].filter(Boolean).sort().join(',') || '-'
    return `${key}\t${keyed}\t${[...files].sort().join(' ')}`
  })
const report = `${lines.join('\n')}\n`

// Counting DEFINITIONS, not distinct files: two definitions in one file are just
// as much of a collision, and they are the easier ones to write by accident.
const collisions = [...byKey.entries()].filter(([, record]) => record.count > 1)

if (process.argv.includes('--check')) {
  const expected = fs.existsSync(SNAPSHOT) ? fs.readFileSync(SNAPSHOT, 'utf8') : ''
  let failed = false
  if (expected !== report) {
    console.error('memory-keys: the key list changed. Review the diff, then run `pnpm memory:keys` to accept it.')
    console.error(`  defined now: ${byKey.size}`)
    failed = true
  }
  if (collisions.length) {
    console.error('memory-keys: a key is defined more than once:')
    for (const [key, r] of collisions) console.error(`  ${key}  x${r.count}  ${[...r.files].join(' ')}`)
    failed = true
  }
  if (failed) process.exit(1)
  console.log(`memory-keys: ok (${byKey.size} keys)`)
} else {
  fs.writeFileSync(SNAPSHOT, report)
  console.log(`memory-keys: wrote ${byKey.size} keys to ${path.relative(ROOT, SNAPSHOT)}`)
  for (const [key, r] of collisions) console.log(`  DUPLICATE ${key}  x${r.count}  ${[...r.files].join(' ')}`)
}
