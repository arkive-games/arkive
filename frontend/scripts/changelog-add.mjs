#!/usr/bin/env node
/**
 * Append a change to an app's version history.
 *
 *   node scripts/changelog-add.mjs --app palworld --bump minor \
 *     --kind feature \
 *     --en "Pal stat simulator." --zh-cn "新增帕鲁属性模拟器。" --zh-tw "新增帕魯屬性模擬器。"
 *
 * Flags:
 *   --app     palworld | aion2                       (required)
 *   --bump    major | minor | patch                  (required unless --append)
 *   --append  add this change to the newest existing entry instead of creating
 *             a new version — use for the second and later bullets of one release
 *   --kind    feature | improvement | fix | data     (required)
 *   --en / --zh-cn / --zh-tw   the change text        (all three required)
 *   --date    YYYY-MM-DD, defaults to today (local)
 *
 * This does light validation only. `pnpm test` runs the full validator from
 * @gamemap/ui over the resulting file — that is the authority.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPS = ['palworld', 'aion2']
const KINDS = ['feature', 'improvement', 'fix', 'data']
const BUMPS = ['major', 'minor', 'patch']

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    if (key === 'append') {
      out.append = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      fail(`--${key} needs a value`)
    }
    out[key] = value
    i++
  }
  return out
}

function fail(message) {
  console.error(`changelog-add: ${message}`)
  process.exit(1)
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const args = parseArgs(process.argv.slice(2))

if (!APPS.includes(args.app)) fail(`--app must be one of ${APPS.join(', ')}`)
if (!KINDS.includes(args.kind)) fail(`--kind must be one of ${KINDS.join(', ')}`)
if (!args.append && !BUMPS.includes(args.bump)) {
  fail(`--bump must be one of ${BUMPS.join(', ')} (or pass --append)`)
}
for (const flag of ['en', 'zh-cn', 'zh-tw']) {
  if (!args[flag]?.trim()) fail(`--${flag} is required and must not be empty`)
}
const date = args.date ?? today()
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date "${date}" is not YYYY-MM-DD`)

// scripts/ sits directly under frontend/, so the app root is one level up.
const file = path.resolve(
  import.meta.dirname,
  '..',
  'apps',
  args.app,
  'src',
  'changelog.json',
)

const data = JSON.parse(readFileSync(file, 'utf8'))
if (!Array.isArray(data.entries) || data.entries.length === 0) {
  fail(`${file} has no entries to build on`)
}

const change = {
  kind: args.kind,
  text: { 'en-US': args.en, 'zh-CN': args['zh-cn'], 'zh-TW': args['zh-tw'] },
}

let version
if (args.append) {
  data.entries[0].changes.push(change)
  version = data.entries[0].version
} else {
  version = bumpVersion(data.entries[0].version, args.bump)
  data.entries.unshift({ version, date, changes: [change] })
}

writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
console.log(`changelog-add: ${args.app} ${version} (${args.kind}) -> ${file}`)
