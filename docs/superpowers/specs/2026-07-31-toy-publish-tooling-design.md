# Toy Build & Publish Tooling — Design

**Date:** 2026-07-31
**Status:** Approved
**Scope:** Universal build + publish scripts for shipping frontend apps as Bilibili Toy
packages. Palworld is the first (and initially only) configured app.

## Goal

Publish each frontend app as a **single self-contained toy** on the Bilibili Toy platform
(`https://www.bilibili.com/toy/<slug>/`): site build + `data-<app>` + `resource-<app>`
bundled into one package. One review cycle, no cross-toy hotlinking, site/data/resource
versions always consistent.

Two workspace commands, reusable for every app:

```
pnpm toy:build   --app palworld              # build the package into dist-toy/
pnpm toy:publish --app palworld              # upload, print preview URL, do NOT submit
pnpm toy:publish --app palworld --submit     # same upload, submit for review
```

## Decisions (fixed)

- **One bundle, not three toys.** Separate data/resource toys would be stub-page dumps
  facing independent review cycles that can desync or reject partially; cross-toy
  hotlinking is undocumented and the platform's serving model has changed before.
- **Slug scheme: `arkive-<game>`** — brand-first namespace; all toys sort together.
  Palworld slug: **`arkive-palworld`**. Slugs are immutable after publish.
- **Palworld visibility: `public`.** (Changeable later via update; slug is not.)
- **Publish gate: two-step `--submit` flag.** Default run only uploads for preview —
  matching the toy CLI's own preview→confirm→review contract. Submission for review is
  an explicit re-run with `--submit`.

## Components

### 1. Per-app config — `frontend/apps/<app>/toy.config.json`

```json
{
  "slug": "arkive-palworld",
  "title": "幻兽帕鲁攻略站",
  "visibility": "public",
  "poster": "toy-poster.png",
  "dataDir": "data-palworld",
  "resourceDir": "resource-palworld",
  "dataBase": "data",
  "resourceBase": "palres"
}
```

- `slug` / `title` / `visibility` / `poster` — toy metadata, applied on `create`
  (title/visibility/poster changeable later; slug never). `poster` is optional and
  relative to the app dir; omit until artwork exists.
- `dataDir` / `resourceDir` — sibling artifact repo names, located with the same
  ancestor-walk the dev middleware uses (overridable via `PALWORLD_DATA_DIR`-style env
  vars is **not** replicated; the walk plus `TOY_DATA_DIR`/`TOY_RES_DIR` env overrides
  suffice).
- `dataBase` / `resourceBase` — folder names **inside** the package; passed to the build
  as relative `VITE_DATA_BASE_URL` / `VITE_RESOURCE_BASE_URL`. Relative URLs resolve
  against the document (always `/toy/<slug>/index.html` under hash routing), so fetches
  land inside the package.
- The file is named `toy.config.json`, **not** `toy.yaml` — the toy skill treats
  `toy.yaml` as a legacy read-only artifact and it must never be uploaded. The config
  lives in the app dir (committed); it is not copied into `dist-toy/`.

### 2. Build script — `frontend/scripts/toy-build.mjs`

`pnpm toy:build --app <app>`:

1. Read and validate `toy.config.json` (all required keys present, slug is
   lowercase-hyphen, visibility ∈ {link-only, password, public}).
2. Run `tsc -b`, then `vite build --base ./ --outDir dist-toy --emptyOutDir` in the app
   package with env `VITE_TOY=1`, `VITE_DATA_BASE_URL=<dataBase>`,
   `VITE_RESOURCE_BASE_URL=<resourceBase>`.
3. Copy `dataDir` → `dist-toy/<dataBase>/` and `resourceDir` → `dist-toy/<resourceBase>/`
   with `fs.cp`, filtering out `.git`.
4. Package self-check (fail with non-zero exit on ERROR):
   - `index.html` exists at `dist-toy/` root.
   - No root-absolute `src=`/`href=` references in built `.html` files
     (`/assets/...` etc. white-screen under `/toy/<slug>/`).
   - No `.git`, `node_modules`, `toy.yaml`, `.DS_Store` anywhere in the package.
5. Print package size summary (the platform's upload limit is server-side and dynamic;
   the publish API is the authority — the build script only reports size).

`dist-toy/` is gitignored.

### 3. App code change — toy mode routing (palworld now; same pattern per app later)

In `src/main.tsx`: when `import.meta.env.VITE_TOY` is set, create the router with
`createHashHistory()` and `basepath: '/'`; otherwise keep browser history with
`basepath: import.meta.env.BASE_URL`. Hash routing is the platform's recommended mode —
history-mode deep links 404 on refresh because routes aren't real files in the package.

Add `VITE_TOY` to `env.d.ts`.

**Implementation check:** audit direct `window.location.search` reads (e.g. the
`?engine=` renderer override) — under hash history, search params live inside the hash
fragment, so such reads may need to fall back to parsing `location.hash`.

### 4. Publish script — `frontend/scripts/toy-publish.mjs`

`pnpm toy:publish --app <app> [--submit]`:

1. Verify `dist-toy/` exists and passes the same self-check as the build step.
2. Locate the toy binary: `TOY_BIN` env → `toy` on PATH →
   `%LOCALAPPDATA%\Programs\toy\toy.exe`. All invocations use `--json`.
3. Decide create-vs-update:
   - `toy history <dist-toy> --json` has a record → `update <id> <dist-toy>`.
   - Else slug match in `toy mylist --json` → `update <that id> <dist-toy>`.
   - Else `create <dist-toy> --slug --title --visibility [--poster]` from config.
   - Print which path was chosen and why before running it.
4. Without `--submit`: run **without** `--yes`; print the returned `preview_url`
   prominently and exit. With `--submit`: run **with** `--yes`; print returned
   `id`/`status`.
5. Error handling: on a login-expiry error, print the CLI's message plus a
   `toy login` hint and exit non-zero — never auto-retry or loop. Other business errors:
   surface the CLI message verbatim.

### 5. Workspace wiring

`frontend/package.json`:

```json
"toy:build": "node scripts/toy-build.mjs",
"toy:publish": "node scripts/toy-publish.mjs"
```

Scripts are dependency-free Node (like the existing `changelog-*.mjs`).

## Testing

1. Run `pnpm toy:build --app palworld`; assert `dist-toy/` structure
   (`index.html`, `data/`, `palres/`, relative asset refs, no `.git`).
2. Smoke-test locally **under a subpath**: throwaway static server mounting `dist-toy`
   at `/toy/arkive-palworld/`; verify the app boots, hash routes navigate and survive
   refresh, data/tiles/icons load.
3. Real preview: `pnpm toy:publish --app palworld` (no `--submit`), check the preview
   URL in a browser. Submission for review only after that looks right.

## Out of scope

- aion2 / sts2 / vrising `toy.config.json` + their `main.tsx` toy-mode toggles (same
  pattern, added when each app is published; aion2's differing resource URL scheme is
  handled then).
- Poster artwork (config supports it; a 4:3 ~1200×900 map screenshot when publishing).
- Changelog entry: the toy build is a new distribution channel, not a user-visible site
  feature — no version bump for the tooling itself.
- Trimming the resource set to only-referenced files (revisit only if the platform
  rejects the package for size; palworld payload is ~120 MB uncompressed).
