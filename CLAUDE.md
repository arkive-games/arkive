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
- `tools/`    — Python (uv): `apps/` (aion2, palworld, sts2, vrising pipelines) + `packages/` (shared
  framework `tools`, generated `backend-client`). Transforms the raw game export into the
  `data/` + `resource/` artifacts.
- `docs/`, `CLAUDE.md`, `.claude/`, `BOOTSTRAP.md` — workspace meta (also here).

Separate artifact repos (NOT in this monorepo; served over HTTP):
- `resource/` (+`resource-palworld/`, `resource-sts2/`, `resource-vrising/`) — derived WebP image set under a `UI/` root.
- `data/` (+`data-palworld/`, `data-sts2/`, `data-vrising/`) — derived parsed dataset (markers, regions, tables, locales).

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
- **New features:** open a git worktree for the work (isolate from the current workspace).
- **Merging back:** integrate with rebase (not merge commits).
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

## Notes
- **Canonical site specifications:** Start with `docs/ARKIVE_SITE_SPEC.yaml` for
  brand identity, cross-site experience rules, and the specification reading
  router. Read `docs/ARKIVE_SITE_COLOR_SYSTEM.yaml` only for color or theme work,
  and `docs/ARKIVE_INTERACTIVE_MAP_UI_SPEC.yaml` only for desktop map UI work.
  Files under `docs/superpowers/plans/` and `docs/superpowers/specs/` are historical
  decision records; they never override these canonical top-level specifications.
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
