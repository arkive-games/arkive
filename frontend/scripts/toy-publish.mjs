#!/usr/bin/env node
// Upload a built toy package and (optionally) submit it for review:
//   pnpm toy:publish --app palworld            # upload, print preview URL, STOP
//   pnpm toy:publish --app palworld --submit   # upload AND submit for review
//   pnpm toy:publish --app palworld --dry-run  # stop right before the toy CLI upload call
// The two-step flag mirrors the toy CLI's own preview→confirm→review gate:
// without --submit we never pass --yes. --dry-run runs every local/read-only
// check (package self-check, bin discovery, history/mylist lookup, decision,
// poster check, argv assembly) and prints the argv it would run, then exits
// before making the mutating create/update call.
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
try { args = parseArgs(process.argv.slice(2), ['submit', 'dry-run']) } catch (e) { fail(e.message) }
const app = args.app
if (!app) fail('--app is required (e.g. --app palworld)')
if (!/^[a-z0-9-]+$/.test(app)) fail(`invalid app name "${app}"`)
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

// The poster is a create-time argument only. Review submission REQUIRES one
// (server error 307009) even though preview works without it, so a create with
// `poster` configured is the moment it gets set. On update we deliberately do
// not re-send it: `toy update <id> <path> --poster` is unverified, while a
// metadata-only `toy update <id> --poster <file>` is the documented way to
// change a cover — so we print that hint instead of guessing a flag.
let posterPath
if (action.mode === 'create' && cfg.poster) {
  posterPath = path.resolve(appDir, cfg.poster)
  if (!fs.existsSync(posterPath)) fail(`poster not found: ${posterPath}`)
}
if (action.mode === 'update' && cfg.poster) {
  console.log(`toy-publish: note — the poster is not re-sent on update; set/replace it with \`toy update ${action.id} --poster ${path.resolve(appDir, cfg.poster)}\``)
}
const argv = action.mode === 'create'
  ? ['create', distDir,
     '--slug', cfg.slug,
     '--title', cfg.title,
     '--visibility', cfg.visibility,
     ...(posterPath ? ['--poster', posterPath] : [])]
  : ['update', action.id, distDir]
if (args.submit) argv.push('--yes')

console.log(`toy-publish: running toy ${argv.join(' ')}`)
if (args['dry-run']) {
  console.log('toy-publish: dry-run — stopping before the toy CLI call')
  process.exit(0)
}
// The mutation already happened server-side by the time this call returns —
// don't hard-fail on unparseable output, just show it and carry on.
const rawResult = runToy(bin, argv)
let result = null
if (rawResult != null) {
  try { result = JSON.parse(rawResult) } catch { console.log(`toy-publish: could not parse ${argv[0]} output as JSON:\n${rawResult}`) }
}

if (!args.submit) {
  console.log('')
  console.log('='.repeat(72))
  console.log(`  PREVIEW ONLY — nothing was submitted for review.`)
  console.log(`  Preview URL: ${result?.preview_url ?? JSON.stringify(result)}`)
  console.log(`  Check it in a browser, then rerun with --submit to submit for review.`)
  console.log('='.repeat(72))
} else if (result?.id != null) {
  console.log(`toy-publish: submitted for review — id=${result.id} status=${result?.status}`)
  console.log(`toy-publish: share URL once approved: https://www.bilibili.com/toy/${cfg.slug}/index.html`)
} else {
  console.log(`toy-publish: submit response: ${JSON.stringify(result)}`)
}
