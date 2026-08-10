// Print every state-memory key the repo defines, sorted, and fail on a collision.
//
// Storage keys are the one part of this system users carry between deploys: rename
// one and everybody silently starts from the default; collide two and they
// overwrite each other. Neither shows up in a test, because both are "working as
// written". A committed, sorted list makes both visible in a diff.
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

const CLASS_METHODS = ['preference', 'progress', 'session', 'draft', 'recent']

/** name -> namespace for every `export const x = memoryFor('ns')` in the repo,
 *  so a binding imported from another module still resolves to a real key. */
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

function keysIn(file, text, exported) {
  const found = []
  const relative = path.relative(ROOT, file).replaceAll('\\', '/')

  // New API: `memoryFor('ns')` bound to a name, then `<name>.<class>('surface/id'`.
  const namespaces = new Map()
  for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*memoryFor\(\s*['"]([\w-]+)['"]/g)) {
    namespaces.set(m[1], m[2])
  }
  for (const [local, namespace] of namespaces) {
    const call = new RegExp(`\\b${local}\\.(${CLASS_METHODS.join('|')})\\(\\s*['"]([\\w-]+)/([\\w-]+)['"]`, 'g')
    for (const m of text.matchAll(call)) {
      found.push({ key: `arkive.memory.${namespace}.${m[2]}.${m[3]}`, file: relative })
    }
  }
  // Imported bindings (e.g. `vrisingMemory` from lib/memory) — resolve by name.
  for (const m of text.matchAll(/\b(\w*[Mm]emory)\.(preference|progress|session|draft|recent)\(\s*['"]([\w-]+)\/([\w-]+)['"]/g)) {
    if (namespaces.has(m[1])) continue // already counted above
    const namespace = exported.get(m[1])
    if (!namespace) {
      throw new Error(`${relative}: cannot resolve the namespace behind "${m[1]}" -- ` +
        'export it as `export const x = memoryFor("ns")` so keys stay enumerable')
    }
    found.push({ key: `arkive.memory.${namespace}.${m[3]}.${m[4]}`, file: relative })
  }
  // Cross-site records always live under `site`.
  for (const m of text.matchAll(/\bsharedMemory\(\s*['"]([\w-]+)\/([\w-]+)['"]/g)) {
    found.push({ key: `arkive.memory.site.${m[1]}.${m[2]}`, file: relative })
  }
  // Original API: an object literal carrying id / namespace / surface.
  for (const m of text.matchAll(/defineMemoryRecord[^{]*\{([\s\S]{0,600}?)\}\)/g)) {
    const body = m[1]
    const id = /\bid:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    const namespace = /\bnamespace:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    const surface = /\bsurface:\s*['"]([\w-]+)['"]/.exec(body)?.[1]
    if (id && namespace && surface) {
      found.push({ key: `arkive.memory.${namespace}.${surface}.${id}`, file: relative })
    }
  }
  return found
}

const files = SEARCH
  .map((dir) => path.join(ROOT, dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap((dir) => sources(dir))
const exported = exportedNamespaces(files)
const all = files.flatMap((file) => keysIn(file, fs.readFileSync(file, 'utf8'), exported))

const byKey = new Map()
for (const entry of all) {
  const files = byKey.get(entry.key) ?? new Set()
  files.add(entry.file)
  byKey.set(entry.key, files)
}

const lines = [...byKey.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, files]) => `${key}\t${[...files].sort().join(' ')}`)
const report = `${lines.join('\n')}\n`

// A key defined in two different files is almost always an accident -- two
// components reaching for "the same" state and disagreeing about its shape.
const collisions = [...byKey.entries()].filter(([, files]) => files.size > 1)

if (process.argv.includes('--check')) {
  const expected = fs.existsSync(SNAPSHOT) ? fs.readFileSync(SNAPSHOT, 'utf8') : ''
  if (expected !== report) {
    console.error('memory-keys: the key list changed. Review the diff, then run `pnpm memory:keys` to accept it.')
    console.error(`  defined now: ${byKey.size}`)
    process.exit(1)
  }
  if (collisions.length) {
    console.error('memory-keys: the same key is defined in more than one file:')
    for (const [key, files] of collisions) console.error(`  ${key}  ${[...files].join(' ')}`)
    process.exit(1)
  }
  console.log(`memory-keys: ok (${byKey.size} keys)`)
} else {
  fs.writeFileSync(SNAPSHOT, report)
  console.log(`memory-keys: wrote ${byKey.size} keys to ${path.relative(ROOT, SNAPSHOT)}`)
  for (const [key, files] of collisions) console.log(`  DUPLICATE ${key}  ${[...files].join(' ')}`)
}
