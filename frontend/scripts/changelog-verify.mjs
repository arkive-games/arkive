#!/usr/bin/env node
/**
 * Assert every changelog entry pins a commit that is actually reachable from
 * HEAD, so the /changelog compare links resolve on GitHub.
 *
 *   node scripts/changelog-verify.mjs
 *
 * This is a separate script rather than a vitest case because it needs git, and
 * the unit suite must stay runnable without a repo.
 *
 * The failure it exists to catch: you add an entry stamped with HEAD, then rebase
 * before merging. The rebase rewrites that commit's SHA and the entry is left
 * pointing at an orphaned object — the JSON still validates, the tests still
 * pass, and the link 404s only once it is pushed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPS = ['palworld', 'aion2', 'gmzz', 'lostark', 'ro3', 'sts2', 'vrising']
const root = path.resolve(import.meta.dirname, '..')
const histories = [
  ...APPS.map((app) => ({
    name: app,
    file: path.join(root, 'apps', app, 'src', 'changelog.json'),
  })),
  {
    name: 'platform',
    file: path.join(root, 'apps', 'meta', 'src', 'platform-changelog.json'),
  },
]

let failed = 0
for (const { name, file } of histories) {
  const { entries } = JSON.parse(readFileSync(file, 'utf8'))
  const bad = []
  for (const { version, date, commit } of entries) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
        cwd: root,
        stdio: 'ignore',
      })
    } catch {
      bad.push(`${version ?? date} -> ${commit.slice(0, 12)}`)
    }
  }
  if (bad.length > 0) {
    failed += bad.length
    console.error(`changelog-verify: ${name} has ${bad.length} unreachable commit(s):`)
    for (const b of bad) console.error(`  ${b}`)
  } else {
    console.log(`changelog-verify: ${name} ok (${entries.length} entries)`)
  }
}

if (failed > 0) {
  console.error(
    '\nEach version must pin a commit reachable from HEAD. If you rebased after\n' +
      'stamping, re-point the newest entries at their rewritten SHAs.',
  )
  process.exit(1)
}
