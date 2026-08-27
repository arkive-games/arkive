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
- `frontend/` — pnpm workspace: `apps/` (aion2, palworld, sts2, vrising) + `packages/` (ui,
  map-engine-gl, map-shell, data-contract, auth, api-core, state-memory). React 19 / Vite /
  Tailwind / shadcn, with maps drawn by `map-engine-gl` (three.js) — the only renderer since
  Leaflet was retired.
- `backend/`  — **RETIRED (2026-08-16). Read-only reference; do not deploy it.** The
  FastAPI service that `backend-go` replaced. Its container was removed from the server
  and its published port closed; the last genuine API request was 2026-08-09. The source
  stays because it is the only implementation of the parts not yet ported — abyss-artifact
  voting, comments, progress and feedback — so whoever ports them has something to read.
  Its `aion2` database is **kept and still running**: it holds the legacy data, and the
  same PostgreSQL and Redis containers are what `backend-go` runs on, so that compose
  project must never be brought down as a whole.
- `backend-go/` — the Go backend, and the only one deployed. huma + sqlc + goose, serving
  every game rather than aion2 alone. Accounts, authentication, avatars on S3, and the
  forum (posts, comments, reactions, follows, notifications, moderation, roles) are
  implemented; comments on map markers, progress, feedback and the aion2 abyss-artifact
  module are not yet. See its `README.md` and
  `docs/superpowers/specs/2026-08-08-go-backend-architecture-design.md`.
- `tools/`    — Python (uv): `apps/` (aion2, gmzz, lostark, palworld, sts2, vrising pipelines) + `packages/` (shared
  framework `tools`, generated `backend-client`). Transforms the raw game export into the
  `data/` + `resource/` artifacts.
- `docs/`, `.apm/`, `apm.yml`, `.claude/`, `BOOTSTRAP.md` — workspace meta (also here).

Separate artifact repos (NOT in this monorepo; served over HTTP):
- `resource/` (+`resource-gmzz/`, `resource-palworld/`, `resource-sts2/`, `resource-vrising/`) — derived WebP image set under a `UI/` root.
- `data/` (+`data-gmzz/`, `data-palworld/`, `data-sts2/`, `data-vrising/`, `data-lostark/`) — derived parsed dataset (markers, regions, tables, locales).

## Data-flow contract
Raw game export (`E:\Exports\AION2\Content\`, Perforce later)
  --tools-->  data/ (text)        --HTTP-->  frontend
  --tools-->  resource/UI (WebP)  --HTTP-->  frontend
backend-go  --HTTP (accounts, authentication, avatars, the forum)-->  frontend

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
  than committing unsigned. Contributors' commits are no longer re-signed on their behalf by a
  forced rebase: the landing workflow requires every commit to arrive already verified, so a
  signature says "I wrote this" rather than "I merged this".
- **Every change starts in a worktree and lands as a PR.** Open a git worktree for the work
  (branched from `origin/master`), commit there, and when the user asks to submit, push the
  branch and open a pull request with `gh pr create`, reporting the URL, then comment `@claude`
  on it to request a review (see below). **Never commit on
  `master`, and never push `master`, unless the user explicitly asks.** Local `master` then
  stays equal to `origin/master`, which also retires the old trap of a worktree branching from
  `origin/master` while unpushed work sat on the local one.
- **Keep branches linear:** rebase onto `master`, never merge it in. A branch containing a
  merge commit cannot be landed — see below.
- **Landing a PR — comment `/fast-forward` on it.** `.github/workflows/fast-forward.yml` moves
  `master` to the PR head. A fast-forward **rewrites nothing**, so every commit keeps its SHA
  and its signature — which is the whole point: each `changelog.json` entry pins a full 40-char
  SHA, and any method that rewrites a commit orphans those pins while the JSON still validates
  and `pnpm test` still passes, leaving the compare links aimed at commits that exist only in
  `refs/pull/N/head`.
  - **"Squash and merge" and "Rebase and merge" are disabled in repository settings**, not
    merely discouraged — both rewrite commits, and "Rebase and merge" additionally lands them
    "without commit signature verification" because GitHub has neither our key nor authorship.
    A merge commit is SHA-safe and stays enabled as the fallback, but it puts a bubble in the
    history, so use the fast-forward.
  - **The ruleset on `master` deliberately does NOT require linear history.** GitHub permits
    that rule only when squash or rebase merging is enabled, which would put a rewriting button
    back on the page. It blocks force pushes and deletions instead — which is what actually
    keeps every pinned SHA reachable.
  - The workflow refuses unless all of these hold, posting the reason as a PR comment: the
    requester has push permission; the PR is open against `master`; **`master` is already an
    ancestor of the head**; the branch contains no merge commits; **every commit is verified**;
    and `changelog:verify` passes against the head.
  - **It never rebases for you.** That would rewrite the commits it exists to preserve, and the
    runner has no signing key. A refusal for being behind means: rebase, re-point any
    `changelog.json` entry the rebase orphaned (`pnpm changelog:verify` finds them), force-push
    with `--force-with-lease`, then comment again.
  - Same-repo branches are deleted after landing, and the EdgeOne deploy fires because the push
    uses `FAST_FORWARD_TOKEN` rather than `GITHUB_TOKEN`. The same workflow has a
    `workflow_dispatch` entry taking a PR number, for when the comment path is unusable.
- **Requesting a review — comment `@claude` on the pull request.**
  `.github/workflows/claude.yml` reviews the diff against these conventions and, finding nothing
  blocking, rebases the branch if it is behind, re-points any `changelog.json` entry the rebase
  orphaned, and comments `/fast-forward` itself. Do this as part of opening the pull request, not
  as a separate favour to ask later.
  - `@claude` reviews and reports; it does **not** edit code on its own judgement. Reply
    `@claude fix` to authorise it to implement its own findings.
  - **It cannot edit the pipeline under either verb** — `.github/**`, `.claude/**`, `.apm/**`,
    `CLAUDE.md`, `AGENTS.md`, `apm.yml`, at any nesting depth. The run fails and pushes nothing
    if it tries. `@claude fix` is consent to change the code under review, not the machinery
    reviewing it, so a finding about one of these files is yours to act on.
  - Like `/fast-forward`, the trigger must be the FIRST characters of the comment — quoting it
    in prose does not fire it. `@claude` needs no `--body-file` workaround (only a *leading
    slash* is mangled by Git Bash), so `gh pr comment N --body '@claude'` is safe.
  - A refusal from the fast-forward gate is handed back to it automatically, three attempts per
    request, then it stops and says so.
  - Fork branches get a review only: a fork's branch cannot be pushed from the runner, so
    nothing is repaired there.
- **Live testing:** the dev server resolves `../data` and `../resource/UI` by relative path, so
  a worktree needs the `RESOURCE_UI_DIR` override (see the frontend rules) to serve them.
  Landing the work early in order to test it is not an option — ask the user instead.
- **Git on Windows:** bash or PowerShell both work. All repo origins are SSH
  (`git@github.com:...`); SSH works via `HOME` set in `~/.claude/settings.json` env plus
  `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` in the global gitconfig.
- **Implementation:** the build is yours. Do the coding, design, planning and research
  directly — not another agent's to do.
  - **A second model reviewing finished work is expressly allowed, and encouraged for
    anything substantial.** An independent reviewer catches what the author cannot see: on the
    forum backend, Codex found a foreign key that did not enforce what its own comment
    claimed, and an integer overflow that turned a query string into a 500. Give it concrete
    artifacts and demand a specific defect list rather than a verdict, then *verify* each
    finding before acting — it asserts confidently wrong things too.
  - What a second model must never do is **produce** the work: write the implementation,
    author the design, or stand in for your own verification.
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

## Project board
Every issue and pull request is tracked on the [Arkive Roadmap](https://github.com/orgs/arkive-games/projects/1),
with two multi-select fields: **Layer** (`frontend` / `backend` / `tools` / `workspace`) and
**App** (`aion2` / `palworld` / `sts2` / `vrising` / `lostark` / `meta` / `shared`). Both accept
several values, because most changes here span more than one — a single-value field would have to
throw most of that away.

`.github/workflows/project-sync.yml` adds the item and sets both fields. **Do not set them by
hand**, and do not restate them in a pull request description:

- **Pull requests** are derived from the changed paths, so there is nothing to do and nothing to
  remember. `frontend/apps/<app>` maps to that app, `frontend/packages/**` to `shared`,
  `tools/apps/<app>` to `tools` plus that app, `backend/` and `backend-go/` to `backend`, and
  anything else to `workspace`.
- **Issues** cannot be derived, so the issue form asks. Blank issues are disabled for that
  reason; the form is the enforcement, not this paragraph.

What automation cannot do, and therefore belongs to you:

- **`Closes #N` in the pull request description.** It is the only thing that fills the Linked
  pull requests field on the issue's row — that field is issue-side, so it reads the closing
  keyword from the pull request body. A keyword in a commit message does not count, and a bare
  `#N` mention does not either. It also only works when the pull request targets `master`, which
  the fast-forward flow does.
- **Adding an option when you add a surface.** A new app under `frontend/apps/` or
  `tools/apps/`, or a new top-level directory, needs the matching **App** option created on the
  project first. The workflow warns and skips an unknown value rather than failing, so a missing
  option shows up as a quietly untagged item — check the run's log after opening the first pull
  request that touches it.
- **App is legitimately empty.** CI, repository meta and backend-only work touch no app. Leave
  it unset rather than choosing something adjacent; the board is read to answer "what touched
  Palworld", and a wrong value is worse than none.

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
