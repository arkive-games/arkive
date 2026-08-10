---
description: Arkive monorepo layout, the data-flow contract, and the workspace-wide working conventions every agent must follow
applyTo: "**"
---

**Arkive** — the multi-game interactive-map platform (AION2, Palworld, STS2, V Rising).

**This file is generated — do not edit it.** `CLAUDE.md` and `AGENTS.md` are both compiled by
[APM](https://github.com/microsoft/apm) from `.apm/instructions/*.instructions.md`. Edit the
source there and run `apm compile`; a hand edit to a generated file is silently discarded on the
next compile. One source, two harnesses (Claude reads `CLAUDE.md`, Codex and friends read
`AGENTS.md`), so a convention can no longer drift between them.

Area rules live in their own source files, and **APM decides where each one lands** — a pattern
covering a minority of the tree gets its own file in that directory, one covering most of it stays
at the root. Read the closest `CLAUDE.md`/`AGENTS.md` in addition to this one; don't hand-place
these sections.

- `frontend/**` — pnpm/TypeScript/Vite pins, typography, dev-server ports, version history,
  EdgeOne routes and deploys, Bilibili Toy publishing, `UI/` assets. Currently compiled into
  **this** file (frontend is ~two thirds of the repository's directories).
- `tools/**` — the world→map coordinate transforms (AION2, V Rising) and per-game extractor
  notes. Compiled into `tools/`.

This is the **monorepo** for the platform: `frontend/`, `backend/` and `tools/` live here
together (consolidated 2026-07-06 via history-preserving `git filter-repo` import; commit
messages rescoped to `type(scope):`). The derived-artifact repos `data/` and `resource/` (and
their per-game variants) remain **separate**, pulled over HTTP.

## Layout
- `frontend/` — pnpm workspace: `apps/` (aion2, palworld, sts2, vrising) + `packages/` (ui, map-engine,
  map-shell, data-contract). React 19 / Vite / Tailwind / shadcn / Leaflet.
- `backend/`  — FastAPI + PostgreSQL + S3; dynamic/user data only. One **shared** service
  (auth, comments, uploads, artifact voting) — not per-game.
- `backend-go/` — the Go replacement for `backend/` (huma + sqlc + goose). Serves every game,
  not aion2 alone. `core` (accounts, authentication, avatars on S3) is implemented; comments,
  progress, feedback and the aion2 abyss-artifact module are not yet. See its `README.md` and
  `docs/superpowers/specs/2026-08-08-go-backend-architecture-design.md`.
- `tools/`    — Python (uv): `apps/` (aion2, lostark, palworld, sts2, vrising pipelines) + `packages/` (shared
  framework `tools`, generated `backend-client`). Transforms the raw game export into the
  `data/` + `resource/` artifacts.
- `docs/`, `.apm/`, `apm.yml`, `.claude/`, `BOOTSTRAP.md` — workspace meta (also here).

Separate artifact repos (NOT in this monorepo; served over HTTP):
- `resource/` (+`resource-palworld/`, `resource-sts2/`, `resource-vrising/`) — derived WebP image set under a `UI/` root.
- `data/` (+`data-palworld/`, `data-sts2/`, `data-vrising/`, `data-lostark/`) — derived parsed dataset (markers, regions, tables, locales).

## Data-flow contract
Raw game export (`E:\Exports\AION2\Content\`, Perforce later)
  --tools-->  data/ (text)        --HTTP-->  frontend
  --tools-->  resource/UI (WebP)  --HTTP-->  frontend
backend  --HTTP (auth, comments, feedback, contributors, progress, uploads, artifact voting)-->  frontend

## Conventions
- **Language:** the project language is **English**. Everything written into the repo —
  commit messages, code, identifiers, comments, docs, test names — must be pure English
  (no CJK, no mixed-language text). The only exception is locale/translation data whose
  whole purpose is to carry other languages (`zh-CN`/`zh-TW`/`ko-KR`/… message catalogs,
  `changelog.json` locale strings, game-sourced display names).
  **In session conversation, reply in whatever language the user is writing in** — that
  choice affects chat only, never repo content.
- **All commits must be signed.** Never pass `--no-gpg-sign` or otherwise bypass signing.
  `commit.gpgsign=true` and a valid signing key are configured, so a plain `git commit` signs
  automatically — rely on that. If a commit ever fails to sign, fix the signing setup rather
  than committing unsigned.
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
  # resolve, verify, re-stamp changelog SHAs (see the frontend version-history rules)
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
- **Implementation:** do all coding, design, planning, research, review, and verification
  directly — the build is yours, not another agent's to do. A second model may be used to
  *review* finished work, never to produce it.
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
- Old web admin repo: `C:\Users\liuyh\WebstormProjects\aion2-interactive-map-webadmin`
  (to be ported into `frontend/` in Phase 2, then archived).

See `docs/superpowers/specs/2026-06-27-aion2-map-reconstruction-design.md` for the full design.
