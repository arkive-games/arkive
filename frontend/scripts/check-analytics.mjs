// Fail if any app is not measured by Baidu Tongji.
//
// This exists because the prose version of the rule did not hold. `ro3` shipped
// after the six sites then live were wired, nothing said a new app had to be
// wired at all, and its traffic went unrecorded until somebody noticed a missing
// subdomain in the report -- months of visits that no test, build or review could
// have flagged, because an unmeasured app is indistinguishable from a measured
// one at runtime. The invariants this repo encodes as scripts are the ones that
// have not regressed; this moves analytics into that set, so app nine fails in CI
// on the day it is added.
//
// Apps are discovered from the filesystem rather than listed, for the same
// reason: a hardcoded list is one more thing a new app can be missing from.
//
// Usage: node scripts/check-analytics.mjs

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPS = path.join(ROOT, 'apps')

/**
 * Apps exempt from reporting client-side navigation, with the reason.
 *
 * Empty, and hard to earn. `hm.js` counts the page it loads on, so an app is
 * measured by `init` alone only if it never changes its URL in place -- and
 * "no router" does not establish that. `meta` was written down as the one
 * genuine single-page app in the repo, on the strength of its own "no router,
 * only hash-toggled views" comment; those hash-toggled views are `#games`,
 * `#forum`, `#account/…` and a public profile per user, every one of them a
 * page a visitor navigates to and none of them counted. A router is one way to
 * change a URL, not the definition of it.
 *
 * So: before adding an entry here, confirm the app changes neither `pathname`,
 * `search`, nor `hash` after load, and record how you confirmed it.
 */
const NO_NAVIGATION = {}

const SKIP_DIRS = ['node_modules', 'dist', 'dist-toy', '.vite', 'e2e']

/** Files under `dir` matching `match`, recursively, excluding build output. */
function filesUnder(dir, match, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue
      filesUnder(full, match, out)
    } else if (match.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Every .ts/.tsx source under an app, excluding tests and build output. */
function sources(dir) {
  return filesUnder(dir, /\.tsx?$/).filter((file) => !/\.test\.tsx?$/.test(path.basename(file)))
}

/**
 * Where an app's entry module might be.
 *
 * Listing the candidates rather than assuming `src/main.tsx`: keying discovery
 * on one filename would move the "missing from a list" failure this script
 * exists to prevent out of a hardcoded array and into a hardcoded filename, and
 * an app with a differently named entry would be skipped in silence -- passing
 * the check by being invisible to it. Finding none is an error, not a skip.
 */
const ENTRY_CANDIDATES = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts']

/** The `initBaiduAnalytics({ ... })` argument, brace-matched. */
function initCallBody(text) {
  const call = /initBaiduAnalytics\s*\(\s*\{/.exec(text)
  if (!call) return null
  let i = call.index + call[0].length
  const start = i
  let depth = 1
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') depth -= 1
    i += 1
  }
  return depth === 0 ? text.slice(start, i - 1) : null
}

// Every workspace package under apps/, whatever its entry module is called.
const apps = fs.readdirSync(APPS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(APPS, entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort()

const problems = []

for (const app of apps) {
  const dir = path.join(APPS, app)
  const entry = ENTRY_CANDIDATES.map((candidate) => path.join(dir, candidate)).find((file) => fs.existsSync(file))

  if (!entry) {
    problems.push(
      `${app}: no entry module found (looked for ${ENTRY_CANDIDATES.join(', ')}), so this check ` +
      'cannot tell whether the app is measured. Add the real entry to ENTRY_CANDIDATES in this script.',
    )
    continue
  }

  const entryName = path.relative(dir, entry).replaceAll('\\', '/')
  const body = initCallBody(fs.readFileSync(entry, 'utf8'))
  if (body === null) {
    problems.push(
      `${app}: ${entryName} does not call initBaiduAnalytics({ ... }) -- this app's traffic is ` +
      'not measured. See the analytics section of CLAUDE.md.',
    )
  } else {
    // Without `dev` local traffic lands in the production report; without `toy` a
    // Toy build counts a visit that belongs to Bilibili. Both are silent.
    for (const flag of ['dev', 'toy']) {
      if (!new RegExp(`\\b${flag}\\s*:`).test(body)) {
        problems.push(`${app}: initBaiduAnalytics is missing the \`${flag}\` flag`)
      }
    }
    // The flag is only read if the variable is declared: `vite/client` types
    // ImportMetaEnv with an index signature, so an undeclared VITE_* is `any`
    // and typechecks while resolving to undefined.
    if (/\bVITE_TOY\b/.test(body)) {
      const envFile = path.join(dir, 'env.d.ts')
      const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
      if (!/\bVITE_TOY\b/.test(envText)) {
        problems.push(`${app}: reads VITE_TOY but never declares it in env.d.ts`)
      }
    }
  }

  // `hasOwn`, not `in`: `in` walks the prototype chain, so an app directory
  // named `constructor` or `toString` would exempt itself.
  if (!Object.hasOwn(NO_NAVIGATION, app)) {
    const reports = sources(path.join(dir, 'src')).some(
      (file) => /\btrackPageview\s*\(/.test(fs.readFileSync(file, 'utf8')),
    )
    if (!reports) {
      problems.push(
        `${app}: nothing under src/ calls trackPageview() -- hm.js counts only the entry page, ` +
        'so every client-side navigation after it goes unreported. Subscribe to the router ' +
        "(`router.subscribe('onResolved', () => trackPageview())`), or call it after pushState " +
        'and in the popstate handler if the app drives history itself. If the app genuinely ' +
        'never changes its URL in place, add it to NO_NAVIGATION in this script with the reason.',
      )
    }
  }
}

// One site id, owned by the shell. A pasted vendor snippet would count under a
// second id, splitting the report in a way that looks like a traffic drop.
//
// `public/` is scanned as well as `src/`: everything in it is copied to the CDN
// verbatim, so a snippet parked there ships without passing through the bundler
// at all.
const TEXTUAL = /\.(html?|m?[jt]sx?|cjs|json|txt)$/
for (const app of apps) {
  const dir = path.join(APPS, app)
  // A Set because the scans overlap -- `public/index.html` matches both -- and one
  // pasted snippet should be one problem, not two.
  const candidates = new Set([
    ...filesUnder(dir, /^index\.html$/),
    ...sources(path.join(dir, 'src')),
    ...filesUnder(path.join(dir, 'public'), TEXTUAL),
  ])
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    if (/hm\.baidu\.com/.test(fs.readFileSync(file, 'utf8'))) {
      problems.push(
        `${app}: ${path.relative(dir, file).replaceAll('\\', '/')} references hm.baidu.com -- the ` +
        'vendor snippet belongs only in packages/map-shell/src/baiduAnalytics.ts, under the one ' +
        'shared site id.',
      )
    }
  }
}

if (problems.length) {
  console.error('check-analytics: every Arkive app must report its traffic.')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

const exempt = apps.filter((app) => app in NO_NAVIGATION)
console.log(
  `check-analytics: ok (${apps.length} apps init` +
  `${exempt.length ? `, ${exempt.join(', ')} exempt from trackPageview` : ''})`,
)
