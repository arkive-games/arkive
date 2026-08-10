# AION2 Interactive Map — Workspace

This is the **monorepo** for the platform: `frontend/`, `backend/`, and `tools/` live here
together (consolidated 2026-07-06 via history-preserving `git filter-repo` import; commit
messages rescoped to `type(scope):`). The derived-artifact repos `data/` and `resource/` (and
their per-game variants) remain **separate**, pulled over HTTP.

## Layout
- `frontend/` — pnpm workspace: `apps/` (aion2, palworld, sts2, vrising) + `packages/` (ui, map-engine,
  map-shell, data-contract). React 19 / Vite / Tailwind / shadcn / Leaflet.
- `backend/`  — FastAPI + PostgreSQL + S3; dynamic/user data only. One **shared** service
  (auth, comments, uploads, artifact voting) — not per-game.
- `tools/`    — Python (uv): `apps/` (aion2, lostark, palworld, sts2, vrising pipelines) + `packages/` (shared
  framework `tools`, generated `backend-client`). Transforms the raw game export into the
  `data/` + `resource/` artifacts.
- `docs/`, `CLAUDE.md`, `.claude/`, `BOOTSTRAP.md` — workspace meta (also here).

Separate artifact repos (NOT in this monorepo; served over HTTP):
- `resource/` (+`resource-palworld/`, `resource-sts2/`, `resource-vrising/`) — derived WebP image set under a `UI/` root.
- `data/` (+`data-palworld/`, `data-sts2/`, `data-vrising/`, `data-lostark/`) — derived parsed dataset (markers, regions, tables, locales).

## Data-flow contract
Raw game export (`G:\NCSoft\Export\Exports\AION2\Content\`, Perforce later)
  --tools-->  data/ (text)        --HTTP-->  frontend
  --tools-->  resource/UI (WebP)  --HTTP-->  frontend
backend  --HTTP (auth, comments, feedback, contributors, progress, uploads, artifact voting)-->  frontend

## Coordinate transform (world → map pixels)
The game uses 3D world coords (`MapData.json` X,Y); the map PNG/tiles are an N×N pixel grid
(`tilesCount × tileSize`, e.g. World_L_A = 8192×8192). The transform is a **pure linear map**
from the map's `WorldBoundBox` to pixels, read from `Data/WorldMap/<Map>.json`
(`Min`/`Max` and `SectorSize × SectorPlaneSize` = pixel size):

```
px = (worldX - Min.X) / (Max.X - Min.X) * pixelWidth      # X → pixel-x, no flip
py = (worldY - Min.Y) / (Max.Y - Min.Y) * pixelHeight     # Y → pixel-y, no flip
```

**Orientation (verified against `World_L_A.png` 2026-06-27): `px_from=X, flip_x=False,
flip_y=False`** — i.e. the formula above as-is. Ground truth used: Eternal Isle = lower-left,
Dawn Legion Base = upper-left. This matches the raw **map image** (image Y increases downward).

**Caveat — two Y conventions, one flip apart:**
- **Map image / PNG / tiles** (this transform): `flip_y=False` (Y down). Use for drawing on the
  map PNG and for the canonical dataset emitted by `tools`.
- **Current frontend `regions.yaml` (Leaflet `CRS.Simple`, Y up):** `flip_y=True`
  (`py' = pixelHeight - py`). The 1A calibration matched this space. The Phase 2 frontend
  should standardize on the image-space (no-flip) convention to remove the discrepancy.

The orientation is expected to hold for all maps (same engine), but **re-verify per map** via
landmarks/overlay. Implementation: `tools/apps/aion2/tools/maps/` (`WorldMapTransform`).

## Coordinate transform — V Rising
V Rising ships **no** `WorldBoundBox` equivalent, so the transform was **derived**, not read:
the mask rasters are 0.5 world units per pixel (verified 372/372), which fixes the 6080×6080
map image at a 3040×3040 world span and leaves only an offset plus one of 8 orientations. The
offset comes from FFT cross-correlation of the composited region silhouettes against the map's
land mask (argmax correlation == argmax IoU under pure translation). The accepted result lives
in `tools/apps/vrising/maps/calibration.py` along with its IoU, margin and
`CALIBRATION_METHOD` (`fitted` or `by-eye`). Re-derive with
`python -m vrising.maps calibrate`; that stage never writes the accepted values, so a re-run
cannot silently move every marker. **Region names do not exist yet** — localization is keyed by
bare GUID and the real names sit in `.entityheader` subscene names (166 unique, recovered by
`unex coverage` as a tail-plaintext heuristic), so regions ship labelled by `AccessID` and
nothing is invented.

Note the current calibration is `by-eye`: the automated IoU gate was unreachable by
construction (the 372 silhouettes cover only ~41% of the landmass, capping IoU at 0.409), so
acceptance rests on containment 0.9165, 369/372 markers landing inside their own region
polygon, and human review of `calibration/accepted_overlay.png`.

## Conventions
- **Language:** the project language is **English**. Everything written into the repo —
  commit messages, code, identifiers, comments, docs, test names — must be pure English
  (no CJK, no mixed-language text). The only exception is locale/translation data whose
  whole purpose is to carry other languages (`zh-CN`/`zh-TW`/`ko-KR`/… message catalogs,
  `changelog.json` locale strings, game-sourced display names).
  **In session conversation, reply in whatever language the user is writing in** — that
  choice affects chat only, never repo content.
- **pnpm 11 (frontend):** `packageManager` in `frontend/package.json` pins the exact version,
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
- **New features:** open a git worktree for the work (isolate from the current workspace).
- **Merging back:** integrate with rebase (not merge commits).
- **Landing a PR — rebase locally, then fast-forward `master`. Never use GitHub's
  "Rebase and merge" button.** That button breaks two of this repo's invariants at once:
  - It **always rewrites the commits**, even when the branch is already a pure
    fast-forward with nothing to replay ("rebase and merge on GitHub will always update
    the committer information and create new commit SHAs"). Every `changelog.json` entry
    pins a 40-char SHA, so the rewrite orphans them: the JSON still validates, `pnpm test`
    still passes, and the compare links point at commits that live only in
    `refs/pull/N/head`.
  - It merges **"without commit signature verification"** — GitHub rebuilds each commit and
    cannot sign as you — so signed commits land unsigned, against the all-commits-signed
    rule. GitHub's own docs recommend rebasing and merging locally instead.

  The method that keeps SHAs and signatures (`master` is unprotected, so this works):

  ```bash
  git fetch origin master <branch>
  git checkout -B pr<N> origin/<branch>
  git rebase -S origin/master              # add --force-rebase to re-sign an already-based branch
  # resolve, verify, re-stamp changelog SHAs (see the Version history section)
  git push --force-with-lease=<branch>:<their-last-sha> origin pr<N>:<branch>
  git push origin pr<N>:master             # fast-forward; GitHub marks the PR merged
  ```

  Notes that matter in practice:
  - **`--force-rebase` is needed when the branch is already on top of `master`.** A plain
    rebase reports "up to date" and does nothing, so contributor commits keep whatever
    signature they arrived with. Commits from outside contributors are often SSH-signed with
    a key GitHub reports as `unknown_key` (Unverified); re-signing through a forced rebase
    is what makes them `verified: valid` on `master`. Check with
    `gh api repos/arkive-games/arkive/commits/<sha> --jq .commit.verification`.
  - **Always `--force-with-lease`, never a bare `--force`.** Contributors push mid-review;
    the lease is what stops you deleting a commit that arrived while you were working. When
    it rejects, re-fetch and rebase onto their new head rather than overriding.
  - **Re-check `git merge-base --is-ancestor origin/master HEAD` immediately before the
    second push.** If someone landed on `master` in the meantime the fast-forward is gone
    and you must rebase again — and note local `master` being ahead of `origin/master`
    (your own unpushed work) does not block this, since the push is branch→branch.
  - After merging, confirm every changelog SHA survived:
    `git merge-base --is-ancestor <sha> origin/master` for each pinned commit.
- **Live testing:** when work needs live testing, merge it back first (with rebase), then test.
- **Git on Windows:** bash or PowerShell both work. All repo origins are SSH
  (`git@github.com:...`); SSH works via `HOME` set in `~/.claude/settings.json` env plus
  `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` in the global gitconfig.
- **Dev server ports (fixed per app):** aion2 → `http://localhost:15173`, palworld →
  `http://localhost:15174`, sts2 → `http://localhost:15175`, vrising → `http://localhost:15176`. A dev server is often already running; before asking the user to
  start one, probe the app's port first
  (e.g. `curl -s -o /dev/null -w "%{http_code}" http://localhost:15174`). Only ask the user to
  start/set up the server if nothing responds. (Note: `5173`/`5174` may be taken by unrelated
  apps — don't assume those are ours.)
- **Implementation:** do all coding, design, planning, research, review, and
  verification directly. Codex delegation is disabled — do NOT delegate to Codex.
- **Efficient execution:** treat unexpected task latency as a workflow defect to investigate,
  document, and prevent from recurring. Follow this sequence for every task:
  1. Preflight the repository with `git rev-parse --show-toplevel`, `git status --short --branch`,
     and `git worktree list`; never infer the active repository from an old directory name.
  2. Use one worktree for one coherent feature or review cycle and reuse it for small follow-up
     adjustments. Do not create a new worktree for each button, label, spacing, or color change.
  3. Route cross-game chrome changes through the shared packages first. Keep only game-owned
     navigation, language, data, and assets in app code.
  4. Scope discovery to tracked source with `rg`, `git grep`, or `git ls-files`; exclude
     `node_modules`, build output, browser artifacts, caches, and old worktrees from broad scans.
  5. Validate incrementally: related typecheck/tests while editing, the affected app build after
     a coherent batch, cross-game browser smoke tests only for shared UI changes, and the complete
     regression suite once before handoff or PR update.
  6. Reuse existing fixed-port dev servers and one browser session. Keep only final QA evidence;
     remove intermediate Playwright snapshots, logs, and generated output at closeout.
  7. Before removing a worktree, verify its HEAD is contained in the integration branch and that
     it has no tracked changes. Remove generated dependencies and artifacts first, then unregister
     the worktree and delete its merged local branch.
  8. Before a remote handoff, verify the signed commit, run a lightweight GitHub connectivity
     check, push once, and read the PR back from GitHub.
  9. Classify the requested delivery before doing work: research summary, visual preview only,
     code change, browser verification, or remote handoff. Do not silently expand one mode into
     another. In particular, preview-only work must not modify production source, and research
     requests must not turn into implementation.
  10. Time-box open-ended design research to 15 minutes or six strong references, whichever
      comes first. Report the useful patterns at that point and ask before widening the search.
      Give a brief progress update at least every five minutes during any task that is not yet at
      a verifiable milestone.
  11. Use the follow-up fast path for a small fix inside the current coherent worktree: inspect
      the owning file, make the smallest shared-first edit, run the affected app build or focused
      test, then verify the exact user flow once. Do not create another worktree, rebuild every
      app, or repeat full-page visual audits for a one-link, one-label, or one-state correction.
      Run the complete suite once at closeout only when the accumulated change set warrants it.
  12. Keep exactly one named Playwright session per active verification task. Reuse that session
      for all routes, close it before handoff, and confirm that no task-owned `cliDaemon.js`
      process remains; use `playwright-cli close-all`, then `playwright-cli kill-all` only for
      stale daemons. On Windows, call `playwright-cli.cmd` or `npx.cmd` directly when PowerShell
      script execution policy blocks the `.ps1` shims.
  13. Treat browser snapshots, screenshots, traces, build output, generated previews, and dev
      logs as disposable artifacts. Store them only in ignored locations, keep only the final
      evidence needed for the current review, and remove it after verification. Never accumulate
      dated preview variants or research captures at the repository root.
  14. Keep local and production navigation explicit. The homepage is the single local browsing
      entry at `http://localhost:15172`; in development its game cards must resolve to the fixed
      local app ports, while production builds must continue to use production URLs. Environment
      overrides retain highest priority.
  15. Before deleting artifacts, prove that each target is ignored or generated, resolve its
      absolute path inside this workspace, and check that no active dev server still owns it.
      Never delete source assets or user-authored references merely because they are old.
- **Typography / font sizes:** never hard-code pixel sizes (no `text-[13px]`,
  `font-size: 11px`). Always use the Tailwind scale steps (`text-xs`, `text-sm`,
  `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`) so text stays consistent
  and scales with the root `font-size` set in each app's `index.css`. If a needed size
  isn't on the scale, prefer rem over px. Floor for in-content text is `text-xs` (12px).
- **Version history (bump right after the feature commit):** each frontend app owns
  `frontend/apps/<app>/src/changelog.json`, newest entry first — `entries[0]` **is** that
  app's current version, shown in the footer and the top-bar build hovercard, and
  rendered at `/changelog`. Every entry pins a full 40-char commit SHA, and the page
  links each version to the GitHub compare range since the previous release.
  Every current and future game's About panel has its own version history; this
  isolation rule applies to all games, not only Palworld. Each history records
  only changes to its owning game. Never copy another game's changes into it, and
  never stamp site-wide shared UI, homepage, account, forum, or platform-
  infrastructure changes into an individual game's changelog.
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
  - **Rebasing after stamping invalidates the SHA.** A rebase rewrites the feature
    commit, orphaning the SHA the entry recorded — the JSON still validates and the
    tests still pass, but the compare link 404s once pushed. So after any rebase (in
    particular when integrating a worktree branch), run `pnpm changelog:verify` and
    re-point the newest entries at their rewritten SHAs.
- **Routes and `edgeone.json` (update both in the same commit):** each app owns
  `frontend/apps/<app>/edgeone.json`, holding the rewrites EdgeOne needs to serve a
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

## Lost Ark — no first-party extractor
Lost Ark is the one game whose extractor we do **not** own. uex/unex/gdex exist because Unreal,
Unity and Godot ship containers needing a decoder written; Lost Ark's `.lpk`/`.ipk`/`.upk` are
already handled by **`lostark-explorer`** (`D:\lostark-explorer`, .NET). Its output is **908
plain SQLite databases** at `D:\lostark-extracted\EFGame\...\ClientData\TableData`, so
`tools/apps/lostark` reads them directly and no fourth extractor is warranted.

Combat power lives in `EFTable_BattlePoint` (16,707 rows): `PrimaryKey` 1 = damage dealer,
2 = support; `Type` selects the coefficient. Decoded so far: 1 = base rate, 2 = heal rate,
3 = per-combat-level amp (55–70), 4 = per-weapon-quality amp (0–100, DPS only),
5/6/7/9 = evolution/enlightenment/leap/leap-karma, 8 = karma stage step, 17 = accessory affix
lines, 22 = gem tier×level, 23 = chosen weapon, 27 = card sets, 28 = pet ranch, 29 = per-Ark-core
values, 31 = gem-option group×level, 33/34 = paradise orb. Rates are scaled integers — **the
divisor varies by Type** (1e6 for Type 1, 1e4 for the rest). Still undecoded: 11–16, 19–21,
24–26, 30 (engravings, bracelet, transcendence, avatars and roster bonuses live among them).

**The method that works** is matching a system's distinctive *value set* against the table — e.g.
`{700, 1100, 1500}` for cards. Matching single values, or id columns against other tables'
PrimaryKeys, both produce false positives; see the plan for the write-ups.

Two traps in the decoded ones. Type 29's `ValueB` is an **option index 1–6**, not a point total —
`ArkGridCore.ReqOptionPoint1..6` maps it to the 10/14/17/18/19/20 the UI shows. Types 33 and 34
are **not symmetric**: 33 puts the amp in `ValueC`, 34 in `ValueB`.

**The fan site's formulas are fits, not the real tables.** Six divergences found so far: it pins
combat level at 70 and calls it a constant (the game tables 55–70); it fits
`(10 + 0.002·q²)/100` to the weapon-quality table, agreeing at only 21 of 101 values and
deviating up to 0.0599%; it self-documents its Esther weapon values as estimates (absent from the
client, so genuinely unreleased); it grants the 0.013 orb heal amp to one orb where the game
grants it to four; it mistranscribes the middle pet-ranch tier as 0.00539 rather than 0.0054; and
it models cards as one global table when the game gives each of 38 sets its own curve. Prefer the
table every time.

Gear stats are `EFTable_ItemLevelOption` keyed by
`SecondaryKey` = item level, with `Str`/`Agi`/`Int` carrying the same main stat once per class
stat. Names come from `EFTable_GameMsg` (`GameMsg_Chinese`, `GameMsg_Korean` — **no English**;
en-US needs an NAEU extraction).

Beware: BattlePoint Type 29 references 72 Ark-core ids that exist in **no other table** (a `…7xx`
suffix series). They are dropped and the count reported in `version.json`.

**Correction (2026-08-05): `Type 10` is the engraving table, not a per-item-group honing table.**
All 28 of its `ValueA` ids exist in `EFTable_Ability` and none in `EFTable_ItemLevelOption`.
`ValueA` is a *reworked* ("S3") ability id — join the roster id through `EFTable_AbilityMapping`,
which stores its 47 pairs both ways — `ValueB` is a growth code and `ValueC` the amp ×1e-4.
Type 11 is the same shape for the support **heal** channel (one occupant, 妙手回春). The growth
code composes the two dials the UI exposes:

```
code = 20 * stone_level + 1 + 4 * grade_step + book_level     # epic/legend/relic = 0/1/2
```

The stone is a second independent axis, **not** extra engraving levels, and the grid is exactly
additive over the two axes (verified at every checkable cell of all 31 grids). Raw tooltip values
live separately in `EFTable_AbilitySpecification` and are *not* the amps: 尖刺重锤 grants 36% crit
damage but scores 0.1141. Class engravings (52 of the 95) have **no** per-level table and no amp
anywhere — only the 43 general ones are covered.

## Notes
- **Canonical site specifications:** Start with `docs/ARKIVE_SITE_SPEC.yaml` for
  brand identity, cross-site experience rules, and the specification reading
  router. Read `docs/ARKIVE_UI_FOUNDATIONS_SPEC.yaml` for framework-facing design,
  typography, spacing, shape, responsive, motion, layer, and shared component work.
  Read `docs/ARKIVE_SITE_COLOR_SYSTEM.yaml` for color or theme work,
  `docs/ARKIVE_MOBILE_EXPERIENCE_SPEC.yaml` for below-`md` composition,
  `docs/ARKIVE_INTERACTIVE_MAP_UI_SPEC.yaml` for desktop map UI, and
  `docs/ARKIVE_STATE_MEMORY_SPEC.yaml` for persistence behavior.
  Files under `docs/superpowers/plans/` and `docs/superpowers/specs/` are historical
  decision records; they never override these canonical top-level specifications.
- **Production deploys (EdgeOne, built here):** `.github/workflows/deploy.yml` builds
  `meta`, `aion2`, `palworld` and `vrising` on a push touching `frontend/**`, then
  uploads each `dist/` with `edgeone makers deploy -n <project>`. EdgeOne itself runs
  **no build** for this repo — that is the point: its free tier caps builds at 500/month,
  while this repo is public so standard-runner Actions minutes are unmetered. The
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
- **Bilibili Toy publishing:** each app can ship as a single self-contained toy
  (site + data + resource bundled). `frontend/apps/<app>/toy.config.json` holds the
  identity (slug is permanent once published; palworld is live as `arkive-palworld`).
  Commands (from `frontend/`): `pnpm toy:build --app <app>` → `dist-toy/`;
  `pnpm toy:serve --app <app>` to smoke-test under `/toy/<slug>/`;
  `pnpm toy:publish --app <app>` uploads a preview (submits nothing), `--submit`
  submits for review, `--dry-run` stops before any mutating CLI call. Review
  submission REQUIRES a poster (server error 307009 otherwise) even though preview
  works without one. Toy builds use hash routing via `VITE_TOY`. Spec:
  `docs/superpowers/specs/2026-07-31-toy-publish-tooling-design.md`.
- Frontend `UI/` assets (game tiles + marker icons) come from the `resource/` repo
  (`resource/UI/...`). Dev: a Vite middleware serves `../resource/UI` at `/UI`
  (`frontend/vite.config.ts`, `RESOURCE_UI_DIR` override). Prod: set
  `VITE_RESOURCE_BASE_URL`. The old `frontend/public/UI` junction is removed.
  Non-`UI/` assets (sidebar bg, logo, watermark) still live in `frontend/public/images`.
- Old web admin repo: `C:\Users\liuyh\WebstormProjects\aion2-interactive-map-webadmin`
  (to be ported into `frontend/` in Phase 2, then archived).

See `docs/superpowers/specs/2026-06-27-aion2-map-reconstruction-design.md` for the full design.
