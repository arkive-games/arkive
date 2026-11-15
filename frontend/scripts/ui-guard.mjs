import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const baselinePath = path.join(root, 'scripts/ui-guard-baseline.json')
const tokenOwner = 'packages/map-shell/src/arkive-map-theme.css'
const rules = [
  ['pixel-type', /(?:text-\[\d+(?:\.\d+)?px\]|font-size\s*:\s*\d+(?:\.\d+)?px|fontSize\s*:\s*(?:\d+(?:\.\d+)?\b|['"]\d+(?:\.\d+)?px['"]))/g],
  ['numeric-layer', /(?:\bz-\[-?\d+\]|\bz-(?:10|20|30|40|50)\b|\bz-index\s*:\s*-?\d+|\bzIndex\s*:\s*-?\d+)/g],
  ['custom-radius', /(?:rounded(?:-[trblse]{1,2})?-\[\d+(?:\.\d+)?(?:px|rem)\]|border-radius\s*:\s*\d+(?:\.\d+)?(?:px|rem)|borderRadius\s*:\s*(?:\d+|['"]\d+(?:\.\d+)?(?:px|rem)['"]))/g],
  ['literal-color', /#[\da-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(\s*[\d.]+/g],
]

export function inScope(file) {
  if (/\.(?:test|spec)\.[^.]+$|\/assets\/|\/locales\//.test(file)) return false
  if (!/\.(?:tsx?|css)$/.test(file)) return false
  return /^packages\/(?:ui|map-shell)\/src\//.test(file)
    || /^apps\/(?:meta|aion2|palworld|gmzz|vrising|ro3|pbz)\/src\/components\//.test(file)
}

export function findings(file, source) {
  // Preserve offsets for actionable line numbers; never lint comments as code.
  const code = source.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    value => value.startsWith('/') ? value.replace(/[^\n]/g, ' ') : value)
  const result = []
  for (const [rule, regex] of rules) {
    if (file === tokenOwner) continue
    for (const match of code.matchAll(regex)) {
      const line = source.slice(0, match.index).split('\n').length
      const sample = source.split('\n')[line - 1].trim()
      const id = createHash('sha256').update(`${file}\0${rule}\0${sample}`).digest('hex').slice(0, 20)
      result.push({ id, file, rule, line, sample })
    }
  }
  return result
}

export function newFindings(current, baseline) {
  const remaining = new Map(Object.entries(baseline))
  return current.filter(item => {
    const count = remaining.get(item.id) ?? 0
    if (!count) return true
    remaining.set(item.id, count - 1)
    return false
  })
}

export function checkTokenOwnership(files) {
  const owner = files[tokenOwner] ?? ''
  const declared = new Set([...owner.matchAll(/(--arkive-[\w-]+)\s*:/g)].map(match => match[1]))
  const protectedTokens = ['--arkive-catalog-control-height', '--arkive-catalog-control-inner-height', '--arkive-encyclopedia-rail-expanded', '--arkive-encyclopedia-rail-collapsed']
  const errors = protectedTokens.filter(token => !declared.has(token)).map(token => `${tokenOwner}: missing ${token}`)
  for (const [file, source] of Object.entries(files)) {
    if (file === tokenOwner) continue
    for (const token of protectedTokens) {
      if (source.includes(`${token}:`) || new RegExp(`${token}\\s*:`).test(source)) errors.push(`${file}: ${token} must be defined only in ${tokenOwner}`)
    }
    if (file.endsWith('.css')) {
      for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (block[1].includes('.catalog-search') && /(?:^|;)\s*(?:height|min-height|color|border(?:-radius|-color)?|background(?:-color)?|padding(?:-\w+)?|box-shadow|font-size)\s*:/.test(block[2])) errors.push(`${file}: catalog search styling belongs to ${tokenOwner}`)
      }
    }
  }
  return errors
}

function main() {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--write-baseline')) throw new Error('Usage: ui-guard.mjs [--write-baseline]')
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'packages', 'apps'], { cwd: root, encoding: 'utf8' }).split('\0').filter(inScope)
  const files = Object.fromEntries([...new Set(tracked)].sort().map(file => [file, readFileSync(path.join(root, file), 'utf8')]))
  const current = Object.entries(files).flatMap(([file, source]) => findings(file, source))
  const appCss = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'apps'], { cwd: root, encoding: 'utf8' }).split('\0').filter(file => /^apps\/(?:meta|aion2|palworld|gmzz|vrising|ro3|pbz)\/src\/.*\.css$/.test(file))
  const ownershipFiles = { ...files, ...Object.fromEntries(appCss.map(file => [file, readFileSync(path.join(root, file), 'utf8')])) }
  const errors = checkTokenOwnership(ownershipFiles)
  if (args.includes('--write-baseline')) {
    if (errors.length) throw new Error(errors.join('\n'))
    const counts = {}
    for (const finding of current) counts[finding.id] = (counts[finding.id] ?? 0) + 1
    const exceptions = [...new Map(current.map(item => [item.id, { id: item.id, file: item.file, rule: item.rule, sample: item.sample, reason: 'Review required before accepting this occurrence.' }])).values()]
    writeFileSync(baselinePath, JSON.stringify({ description: 'Reviewed legacy style occurrences. No automatic acceptance; review every baseline change.', scope: 'Shared UI/shell and released-game chrome. Game records, assets, locales and tests are excluded.', occurrences: counts, exceptions }, null, 2) + '\n')
    console.log(`ui-guard: recorded ${current.length} existing occurrences in ${tracked.length} files; review the baseline diff.`)
    return
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  if (baseline.exceptions.some(item => item.reason.startsWith('Review required'))) throw new Error('The legacy baseline still contains unreviewed exceptions.')
  const additions = newFindings(current, baseline.occurrences)
  for (const item of additions) errors.push(`${item.file}:${item.line} [${item.rule}] ${item.sample}`)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`ui-guard: passed (${Object.keys(files).length} chrome files; ${current.length} existing exceptions; protected token ownership checked)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`ui-guard: ${error.message}`); process.exitCode = 1 }
}
