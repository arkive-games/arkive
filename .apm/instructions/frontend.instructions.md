---
description: Frontend conventions — pnpm/TypeScript/Vite pins, dev-server ports, typography, per-app version history, EdgeOne routes and deploys, Bilibili Toy publishing, UI assets
applyTo: "frontend/**"
---

**Source: `.apm/instructions/frontend.instructions.md` — edit there, then `apm compile`.**
The workspace-wide conventions apply here too.

## Toolchain pins
- **pnpm 11:** `packageManager` in `frontend/package.json` pins the exact version,
  and CI reads it from there (`pnpm/action-setup` with `package_json_file:`) — bump the two
  together, never one alone. **pnpm 11 ignores the `pnpm` field of `package.json` entirely**
  (it only prints a `[WARN]`, the install still succeeds), so `overrides`, `allowBuilds`,
  `patchedDependencies` and friends all belong in `frontend/pnpm-workspace.yaml` — put one in
  `package.json` and it is quietly not applied. Note also that `allowBuilds` replaced
  `onlyBuiltDependencies`/`neverBuiltDependencies` in 11, and that dependency build scripts do
  not run unless allow-listed there.
- **TypeScript is held at `~5.9.3` deliberately — do not bump it to 7.** TypeScript 7 (the
  native port) ships with **no JS API**; a new one is expected in 7.1. Every tool that consumes
  the compiler API therefore breaks on it, `typescript-eslint` included, which fails hard with
  "does not support TS 7.0" and takes the lint script of all six apps down with it
  (typescript-eslint#10940). The apps *build* fine on 7 — it is only the tooling around it that
  cannot follow yet. Revisit once 7.1 ships a stable API and typescript-eslint supports it.
- **Vite:** the apps track `vite` proper (8.x). The old `vite → rolldown-vite` alias/override is
  gone: Vite 8 ships Rolldown natively, and every `rolldown-vite` release is now deprecated with
  a notice pointing back at Vite 8. Don't reintroduce the alias.

## Dev servers
- **Dev server ports (fixed per app):** meta → `http://localhost:15172`, aion2 →
  `http://localhost:15173`, palworld → `http://localhost:15174`, sts2 →
  `http://localhost:15175`, vrising → `http://localhost:15176`, lostark →
  `http://localhost:15177`, ro3 → `http://localhost:15178`, gmzz →
  `http://localhost:15179`.
  A dev server is often already running; before asking the user to
  start one, probe the app's port first
  (e.g. `curl -s -o /dev/null -w "%{http_code}" http://localhost:15174`). Only ask the user to
  start/set up the server if nothing responds. (Note: `5173`/`5174` may be taken by unrelated
  apps — don't assume those are ours.)

## Typography
- **Never hard-code pixel sizes** (no `text-[13px]`, `font-size: 11px`). Always use the Tailwind
  scale steps (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`)
  so text stays consistent and scales with the root `font-size` set in each app's `index.css`.
  If a needed size isn't on the scale, prefer rem over px. Floor for in-content text is
  `text-xs` (12px).

## Version history (bump right after the feature commit)
Each frontend app owns `frontend/apps/<app>/src/changelog.json`, newest entry first —
`entries[0]` **is** that app's current version, shown in the footer and the top-bar build
hovercard, and rendered at `/changelog`. Every entry pins a full 40-char commit SHA, and the
page links each version to the GitHub compare range since the previous release.
Every current and future game's About panel has its own version history; this
isolation rule applies to all games, not only Palworld. Each history records
only changes to its owning game. Never copy another game's changes into it, and
never stamp site-wide shared UI, homepage, account, forum, or platform-
infrastructure changes into an individual game's changelog.
Shared changes that automatically affect multiple games go once in
`frontend/apps/meta/src/platform-changelog.json`, with an explicit target-game
list. Every game's About panel links both its own `/changelog` and this single
platform history. Platform entries are date-based and never bump a game version.
**Not every commit gets a version.** Bump only when a commit ships something a
visitor would notice:
- **Commit the feature first, then add the entry in a follow-up commit.** The entry
  records the SHA of the commit it describes, and a commit cannot contain its own
  SHA — so this ordering is required, not stylistic.
- `MINOR` — a new user-facing feature or page. `PATCH` — a batch of visible fixes
  or polish. `MAJOR` — a site-level reinvention (rare; aion2 `1.0.0` was the
  Phase-2 rebuild).
- Write all three locales (`en-US`, `zh-CN`, `zh-TW`); other locales fall back to
  English. Describe the **user-visible change**, not the implementation.
- **No entry** for internal-only work: refactors, tooling, tests, docs, CI, or
  data-pipeline plumbing with no visible effect.
- Append mechanically instead of hand-editing JSON (from `frontend/`, after the
  feature commit — `--commit` defaults to `HEAD`):
  `pnpm changelog:add --app palworld --bump minor --kind feature --en "…" --zh-cn "…" --zh-tw "…"`
  where `--kind` ∈ `feature|improvement|fix|data`; add `--append` for a second
  bullet on the version you just created. `pnpm test` validates version ordering,
  dates, SHAs and locale coverage.
- Add a shared entry after its feature commit with
  `pnpm changelog:add --platform --targets aion2,palworld,vrising --kind improvement --en "…" --zh-cn "…" --zh-tw "…"`.
  Use product ownership rather than file location: a shared implementation may
  appear in a game history only when the recorded behavior is intentionally
  specific to that game. Prefer separate shared and game-owned feature commits.
- **Rebasing after stamping invalidates the SHA.** A rebase rewrites the feature
  commit, orphaning the SHA the entry recorded — the JSON still validates and the
  tests still pass, but the compare link 404s once pushed. So after any rebase (in
  particular when integrating a worktree branch), run `pnpm changelog:verify` and
  re-point the newest entries at their rewritten SHAs.

## Routes and `edgeone.json` (update both in the same commit)
Each app owns `frontend/apps/<app>/edgeone.json`, holding the rewrites EdgeOne needs to serve a
client-side route that has no file behind it. **Add a route without adding its rule
and nothing looks broken** — the page works in dev and via in-app navigation, then
404s on reload, deep link, or anything shared. The workflow's post-deploy check
requests a deep link precisely to catch this.
- Rules are **enumerated, never a `/*` catch-all.** EdgeOne rewrites support no
  negation and no filesystem fallback, so a catch-all shadows the static assets. The
  catch-all was tried (`1181cdf7`) and reverted (`ebdc6e04`); see `c0b21212`.
- Every path needs **both** `"/x"` and `"/x*"`, because matching is against path
  **plus query** (`3a6d89c0`) — `/x?tab=1` misses a bare `/x` rule. Nested paths add
  `"/x/*"`, which also covers deeper children (`/dungeons/*` serves
  `/dungeons/:id/layouts/:variant`).
- `meta` needs no **rewrite** — it has no router, only hash-toggled views — but it
  does own an `edgeone.json`, for **headers**: `/fonts/*` needs
  `Access-Control-Allow-Origin: *` (every game loads the self-hosted font
  stylesheet cross-origin from here) plus a long `immutable` cache. So the file is
  not always about routing, and an app having no routes is not a reason to skip it.
- The file sits in the app directory, **not** `public/`. `.github/workflows/deploy.yml`
  copies it into `dist/` at deploy time (EdgeOne reads it from the upload root), while
  `public/` would also copy it into the Toy bundle — which `scripts/toy-build.mjs`
  deliberately excludes it from as host config rather than content.

## Production deploys (EdgeOne, built here)
`.github/workflows/deploy.yml` builds `meta`, `aion2`, `palworld`, `vrising` and `ro3` on a push
touching `frontend/**`, then uploads each `dist/` with `edgeone makers deploy -n <project>`.
EdgeOne itself runs **no build** for this repo — that is the point: its free tier caps builds at
500/month, while this repo is public so standard-runner Actions minutes are unmetered. The
`data`/`resource` repos still use EdgeOne's own Git integration; this is per-project.
Two consequences worth knowing before changing anything here:
- **The target projects must be of the "direct upload" type.** The CLI refuses to
  deploy into a Git-connected project (`edgeone makers deploy -h` says so) and the two
  types cannot be converted — a Git project has to be replaced, not reconfigured. Note
  `-n` **creates** a project when the name is free, so a typo publishes to a new empty
  project rather than failing; the names live in the workflow matrix to be reviewed.
- **`VITE_*` values belong in the workflow, not the console.** Vite inlines them at
  build time, so moving the build moved the config. Only `VITE_DATA_BASE_URL` and
  `VITE_RESOURCE_BASE_URL` are still needed (meta needs neither); everything else has
  an in-code production default. An absent matrix key renders as `""`, which the apps
  resolve with `??` rather than truthiness — that builds green and 404s every fetch, so
  the workflow guards for it explicitly.

## Bilibili Toy publishing
Each app can ship as a single self-contained toy (site + data + resource bundled).
`frontend/apps/<app>/toy.config.json` holds the identity (slug is permanent once published;
palworld is live as `arkive-palworld`). Commands (from `frontend/`):
`pnpm toy:build --app <app>` → `dist-toy/`; `pnpm toy:serve --app <app>` to smoke-test under
`/toy/<slug>/`; `pnpm toy:publish --app <app>` uploads a preview (submits nothing), `--submit`
submits for review, `--dry-run` stops before any mutating CLI call. Review
submission REQUIRES a poster (server error 307009 otherwise) even though preview
works without one. Toy builds use hash routing via `VITE_TOY`. Spec:
`docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md`.

## Assets
Frontend `UI/` assets (game tiles + marker icons) come from the `resource/` repo
(`resource/UI/...`). Dev: a Vite middleware serves `../resource/UI` at `/UI`
(`frontend/vite.config.ts`, `RESOURCE_UI_DIR` override). Prod: set
`VITE_RESOURCE_BASE_URL`. The old `frontend/public/UI` junction is removed.
Non-`UI/` assets (sidebar bg, logo, watermark) still live in `frontend/public/images`.
