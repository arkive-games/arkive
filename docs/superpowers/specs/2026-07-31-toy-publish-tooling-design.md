# Toy Build & Publish Tooling — Design

**Date:** 2026-07-31
**Status:** Approved
**Scope:** Universal build + publish scripts for shipping frontend apps as Bilibili Toy
packages. Palworld is the first configured app; the `meta` portal is the second
(added 2026-07-31, slug `arkive`, see "Portal toy" below).

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
  "title": "幻兽帕鲁 · Arkive",
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
  relative to the app dir; omit until artwork exists — but **review submission fails
  without one** (server error 307009), so in practice every publishable app has one.
- `dataDir` / `resourceDir` / `dataBase` / `resourceBase` are **an all-or-nothing
  group**: present for a game app that bundles artifacts, absent for a site-only toy
  (the portal ships no data and fetches nothing). A partial set is rejected by
  `validateToyConfig` — e.g. a `dataBase` with no `dataDir` would inject
  `VITE_DATA_BASE_URL` pointing at a folder the build never copies. `bundlesArtifacts(cfg)`
  is the single predicate the scripts branch on.
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

The site-only shape, `frontend/apps/meta/toy.config.json`:

```json
{
  "slug": "arkive",
  "title": "藏舟攻略网 · Arkive",
  "visibility": "public",
  "poster": "toy-poster.png"
}
```

### 2. Build script — `frontend/scripts/toy-build.mjs`

`pnpm toy:build --app <app>`:

1. Read and validate `toy.config.json` (required keys present, artifact group complete
   or wholly absent, slug is lowercase-hyphen, visibility ∈ {link-only, password,
   public}).
2. Run `tsc -b`, then `vite build --base ./ --outDir dist-toy --emptyOutDir` in the app
   package with env `VITE_TOY=1` plus, **only when the config bundles artifacts**,
   `VITE_DATA_BASE_URL=<dataBase>` and `VITE_RESOURCE_BASE_URL=<resourceBase>`. A
   site-only toy gets neither variable: there is no folder for them to point at.
3. Copy `dataDir` → `dist-toy/<dataBase>/` and `resourceDir` → `dist-toy/<resourceBase>/`
   with `fs.cp`, filtering out `.git`. Skipped, along with the `dataBase`/`resourceBase`
   output-collision checks, for a site-only toy.
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
"toy:publish": "node scripts/toy-publish.mjs",
"toy:serve": "node scripts/toy-serve.mjs"
```

Scripts are dependency-free Node (like the existing `changelog-*.mjs`).
`toy-serve.mjs` mounts `dist-toy` at the real `/toy/<slug>/` prefix with no SPA
fallback — it is package-shape agnostic, so a site-only toy needs no special casing.

### 6. Portal toy — `apps/meta`, slug `arkive` (added 2026-07-31)

The `meta` app (the site portal / hub page) is published as its own toy so that every
game toy has a "home" to link to. It is the first **site-only** toy: no router (single
page, so no hash-history change needed), no data, no resource — just the built site.

**Cross-toy links.** A toy is a *sealed same-origin directory*: `/toy/<slug>/` on
`www.bilibili.com`, with no way out to the public web and no index redirect. Two
consequences, both implemented behind `import.meta.env.VITE_TOY`:

- **Links between toys are same-origin paths** spelled out to the file:
  `/toy/<toySlug>/index.html`. Each `SITES` entry in `apps/meta/src/sites.ts` carries
  an optional `toySlug` (`arkive-palworld`; aion2 has no toy yet). In a toy build a
  card links to that path and navigates **in place** — no `target="_blank"`, since
  popping tabs out of Bilibili's page chrome is jarring and unreliable. Palworld links
  back the same way (`apps/palworld/src/lib/brand.ts` → `/toy/arkive/index.html`).
- **A game with no toy is dropped from the grid entirely** rather than shipping a link
  to `https://<game>.tc-imba.com` that leaves the platform. Same reasoning strips the
  shared `SiteFooter` in the toy build: its links (portal, GitHub org, ICP filing) all
  point off-platform, and the ICP record describes *our* hosting, which says nothing
  about a page served by Bilibili. The toy renders that footer band as plain text.
  `BuildInfo` stays in both builds — its only link is a commit page inside a
  hovercard, matching what the live palworld toy already ships.

**Asset paths.** Root-absolute asset URLs are the silent killer here: the package
self-check only greps HTML, so a `/palworld-bg.webp` in TS/TSX 404s at runtime with no
build-time complaint. The portal's artwork therefore moved from `apps/meta/public/` to
`apps/meta/src/assets/` and is **imported**, so Vite hashes it and rewrites the URL
against the build's base (`--base ./`). Prefer an import over
`${import.meta.env.BASE_URL}…` for the same reason: a missing file fails the build.

**Poster.** `apps/meta/toy-poster.png`, 1200×900 (4:3, 8-bit truecolor) to match
palworld's. Composed from the portal's own two key-art files in a throwaway HTML page
(dual-panel montage under a dark scrim, brand + tagline + game chips) and captured with
a 1200×900 headless-browser screenshot. No generator script is kept in the repo — it
needs a browser and would be dead weight; re-shoot by hand if the artwork changes.

## Testing

1. Run `pnpm toy:build --app palworld`; assert `dist-toy/` structure
   (`index.html`, `data/`, `palres/`, relative asset refs, no `.git`).
2. Smoke-test locally **under a subpath**: throwaway static server mounting `dist-toy`
   at `/toy/arkive-palworld/`; verify the app boots, hash routes navigate and survive
   refresh, data/tiles/icons load.
3. Real preview: `pnpm toy:publish --app palworld` (no `--submit`), check the preview
   URL in a browser. Submission for review only after that looks right.

Portal toy (same three steps, `--app meta`): the package has only `index.html` +
`assets/`; under `pnpm toy:serve --app meta` the card artwork must load (a 404 there
means an asset path escaped the package), the palworld card must point at
`/toy/arkive-palworld/index.html`, the aion2 card must be absent, and the footer must
carry no links.

## Out of scope

- aion2 / sts2 / vrising `toy.config.json` + their `main.tsx` toy-mode toggles (same
  pattern, added when each app is published; aion2's differing resource URL scheme is
  handled then). When aion2 does get one, add its slug as `toySlug` on the portal's
  `SITES` entry so the portal starts showing it.
- Changelog entry: the toy build is a new distribution channel, not a user-visible site
  feature — no version bump for the tooling itself.
- Trimming the resource set to only-referenced files (revisit only if the platform
  rejects the package for size; palworld payload is ~120 MB uncompressed).
