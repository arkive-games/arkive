# V Rising Map App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `vrising`, the fourth frontend app in the arkive monorepo: an interactive map of V Rising's Vardoran built from the single 6080×6080 `ZoneMap_Wilderness_VRisingWorld` texture and the 372 georeferenced region collections, plus the `tools/apps/vrising` pipeline that produces the `data-vrising` / `resource-vrising` artifacts.

**Architecture:** Structurally isomorphic to the existing apps. `tools/apps/vrising` (Python/uv) reads a `unex` export and emits a `@gamemap/data-contract` v1 dataset into `data-vrising` plus WebP tiles/icons into `resource-vrising`; `frontend/apps/vrising` (React 19 / Vite / Tailwind) fetches both over HTTP and renders them through `@gamemap/map-engine` (`GameMapView`) inside `@gamemap/map-shell` (`ShellLayout`, `FilterPanel`, `SearchPanel`). The shared packages are storage-free and i18n-free by contract, so the app injects every adapter: `ThemeStorage`, `MapViewStore`, `MapAssets`, `labels`, and pre-localized `EngineMarker[]`.

**Tech Stack:** TypeScript 5.9, React 19.2, Vite (rolldown-vite 7.2.2), Tailwind 4.1, `@tanstack/react-router` 1.170 (code-defined routes, **no** generated route tree), Leaflet 1.9 + react-leaflet 5, i18next 25 / react-i18next 16, Playwright 1.61, Vitest 4; Python 3.11+ with Pillow, NumPy, SciPy, OpenCV, Shapely (all already in `tools/pyproject.toml`).

**Spec:** the extractor side is `docs/superpowers/specs/2026-07-30-unex-unity-exporter-design.md` (§3.7 map-relevant assets, §5.4 export tree). This plan consumes that exporter's output; it does not modify `unex`.

**Repo:** all paths below are relative to `E:/arkive-games/arkive` (the monorepo) unless prefixed. The artifact repos `E:/arkive-games/data-vrising` and `E:/arkive-games/resource-vrising` are created in Task 4 and are **not** part of this repo.

---

## Work in a git worktree

Per `CLAUDE.md`, feature work happens in an isolated worktree and is integrated back with **rebase**, never a merge commit.

**Critical trap:** `EnterWorktree` branches from `origin/master`, **not** from your local `master`. At the time this plan was written the monorepo had local commits ahead of `origin/master` (local `HEAD` `fd4249fe…` vs `origin/master` `dba9f92a…`). Entering a worktree without dealing with that silently reverts every unpushed local commit inside the worktree, and the loss only surfaces when the branch is rebased back. Task 1, Step 1 handles it: push local `master` (or record its SHA and rebase the worktree branch onto it) **before** creating the worktree.

---

## Critical context for the implementer

Read these before starting. Most of the risk in this plan is in two places: the coordinate transform (Task 7) and the shared-package contracts (Task 10).

1. **`frontend/apps/sts2/` is the template for the app scaffold.** It is the newest app (added 2026-07-30) and the cleanest: code-defined TanStack routes in `main.tsx`, a sibling-repo-walking Vite dev middleware, a three-locale `i18n.ts`, and a `ContentPage`/`TopNav` pair. Copy its shape.
2. **`frontend/apps/palworld/` is the template for the map page.** sts2 has no map at all. `apps/palworld/src/App.tsx` (927 lines) is the reference `GameMapView` host: it shows exactly which adapters an app injects and in what order data is loaded. `apps/palworld/src/lib/{assets,data,urls}.ts` are the three small files to mirror.
3. **`frontend/apps/aion2/` is the ONLY app with a generated route tree** (`src/routeTree.gen.ts` + `@tanstack/router-plugin`). palworld and sts2 declare routes in code with `createRoute`. vrising follows palworld/sts2, so **`tsr generate` is not needed and `@tanstack/router-plugin` must not be added** — `tsc -b` passes without any generation step. (Task 3, Step 8 verifies this.)
4. **Markers carry raw WORLD coordinates; regions carry PIXEL coordinates.** This asymmetry is real and load-bearing. When `maps.json` supplies `worldBounds` + `orientation`, `MarkerInstance.x/y` are raw world units and the engine derives pixels via `worldToPixel()`. `RegionInstance.borders` are **already** map-pixel polygons — the `tools` pipeline applies the transform (see `tools/apps/palworld/maps/emit.py::_volume_polygon`). Anything comparing a marker to a region must project the marker first (`worldToPixel`), exactly as `App.tsx::subzoneAt` does.
5. **One native zoom level.** `GameMapTiles` sets `minNativeZoom: 0, maxNativeZoom: 0`; there is no tile pyramid. A map is a single flat `tilesCountX × tilesCountY` grid of `tileWidth`-px tiles at `<res>/tiles/<MapId>/<MapId>_<xx>_<yy>.webp`, `(0,0)` = top-left, `y` increasing downward. Leaflet scales for zoom. Do **not** invent a `{z}/{x}/{y}` pyramid.
6. **`6080 = 1216 × 5`.** 6080 is not divisible by 1024, so this map uses `tileWidth = tileHeight = 1216`, `tilesCountX = tilesCountY = 5` (25 tiles, no padding). Non-1024 tile sizes are established precedent — aion2's `Abyss_Battlefield_A` ships `tileWidth: 1020`. Padding the image to 6144 is explicitly rejected: it would put a fudge factor into `worldBounds`.
7. **`check:engine` / `check:shell` are grep gates, not lint suggestions.** `packages/map-engine/src` may not contain `react-i18next`, `@tanstack/react-router`, `import.meta.env`, `localStorage`, `@/`, or a literal `UI/` path; `packages/map-shell/src` may not contain `i18next`, `useTranslation`, `react-router`, `import.meta.env`, `localStorage`, `fetch(`, or `@/`. **This plan adds nothing to either package.** Everything game-specific lives in `apps/vrising`.
8. **The changelog's first entry cannot be created by `pnpm changelog:add`** — the script fails with "has no entries to build on" when `entries` is empty. The launch entry is hand-written. It must pin a real 40-char SHA reachable from `HEAD`, so Task 2 seeds it with the current `origin/master` SHA and Task 12 re-points it at the actual launch commit (a separate commit, per the repo rule that a feature commit precedes its changelog entry).

**Five facts about the game data that will save you days:**

- There is **exactly one** map image: `ZoneMap_Wilderness_VRisingWorld`, 6080×6080, DXT1, no mipmaps (~50 MB as PNG). There are **no** tiles and **no** per-region map images in the game. `ZoneMap_StartGraveyard_VRisingWorld` / `ZoneMap_StartCrypt_VRisingWorld` are small tutorial-instance maps, not part of Vardoran — ignore them.
- The 372 regions come from two MonoBehaviours, readable with **no DOTS parsing at all**: `ZoneMap_VRisingWorld_POIPolygonTextureCollection` (226 entries) and `ZoneMap_VRisingWorld_TerritoryTextureCollection` (146). Each entry is `{ PPtr MainTex, int3 AccessID, float2 CenterPosWS, float2 AspectRatio, float2 MaxUV, float2 MinUV }`.
- **Despite the name, `MinUV`/`MaxUV` are world-space axis-aligned bounding boxes.** Verified arithmetically: `CenterPosWS == midpoint(MinUV, MaxUV)` for 226/226 and 146/146, and `AspectRatio == MaxUV − MinUV`. Scale is 0.5 world units per mask pixel. Do not re-derive this.
- The masks (`POIPolygon_N`, `Territory_N`, RGBA32) are **rasterized filled silhouettes with antialiased edges**. There is no vertex data. Polygons must be recovered by contour tracing (Task 8).
- **No region names exist anywhere you can currently reach.** Localization is 19 plain-JSON files keyed by bare GUID with no names. The 229 real names (`Dunley_Mid02_Colosseum_Territory`, `Farbane_Mid11_Quarry_Territory`, `Curse_SpiderCave01_Territory`, …) live only in `.entityheader` subscene names, which is a later `unex` phase. This plan ships regions with generated ids and `AccessID`-derived labels, and **never invents names**.

**Absolute rule on tests:** no unit test may require game files or an artifact repo. Every Python test in this plan builds synthetic fixtures in `tmp_path`. Real-data verification lives in the pipeline's own printed diagnostics and in the Playwright e2e suite (which runs against the dev server + real artifacts).

**The unsolved problem, stated plainly:** the world→pixel transform for this map is **not known**. aion2 reads an explicit `WorldBoundBox` out of `Data/WorldMap/<Map>.json`; V Rising has no such file identified. Task 7 derives it and *verifies* it with a stated numeric acceptance criterion, and Task 7's final step defines the fallback (a by-eye affine recorded in `calibration.py` and flagged as such) so the app can ship either way. Do not skip Task 7's verification and do not let Task 9 emit `worldBounds` that Task 7 did not accept.

---

## File structure

| file | responsibility |
|---|---|
| **frontend/apps/vrising/** | |
| `package.json` | app manifest; deps mirror palworld (map engine + leaflet) not sts2 |
| `vite.config.ts` | port **15176**, `/data` + `/vrisingres` dev middleware, build-time defines |
| `index.html`, `env.d.ts` | document shell; `__BUILD_*__` and `VITE_*` declarations |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | project references, copied from sts2 verbatim |
| `eslint.config.js`, `.gitignore`, `playwright.config.ts` | lint config; e2e on port **5190** |
| `src/main.tsx` | code-defined routes (`/`, `/changelog`), `ThemeProvider` + `ThemeStorage` adapter |
| `src/index.css` | Tailwind v4 entry, `@source` for shared packages, V Rising palette, root `font-size` |
| `src/i18n.ts` | `LANGUAGES` (en-US, zh-CN, zh-TW), `LANGUAGE_LABELS`, inline UI strings |
| `src/lib/urls.ts` | `DATA_BASE`/`RES_BASE`, `initDataVersion()`, `dataUrl()` cache-busting |
| `src/lib/data.ts` | typed fetchers for maps/types/markers/regions + locale namespaces |
| `src/lib/assets.ts` | `MapAssets` adapter: `tileUrl`, `markerIconUrl` |
| `src/lib/storage.ts` | `ThemeStorage` + `MapViewStore` + visible-subtype localStorage adapters |
| `src/lib/siteVersion.ts` | `changelog` + `SITE_VERSION` (breaks the ContentPage↔ChangelogPage cycle) |
| `src/theme.ts` | `MapTheme` override for engine chrome |
| `src/changelog.json` | version history; launch entry `1.0.0` |
| `src/changelog.test.ts` | validates structure, SHAs, launch entry |
| `src/components/TopNav.tsx` | `ShellTopBar` + language/theme switchers + `BuildInfo` |
| `src/components/ContentPage.tsx` | non-map page chrome + `SiteFooter` |
| `src/features/map/MapPage.tsx` | the map: `ShellLayout` + `GameMapView` + `FilterPanel` + `SearchPanel` |
| `src/features/map/popup.tsx` | `renderPopupContent` body (`MarkerPopupCard`) |
| `src/features/map/subzone.ts` | point-in-polygon + smallest-containing-region lookup |
| `src/features/map/subzone.test.ts` | unit tests for the above |
| `src/features/changelog/ChangelogPage.tsx` | `/changelog` page |
| `e2e/smoke.spec.ts` | tiles render, markers render, filter toggle, `?v=` cache-buster |
| `e2e/regions.spec.ts` | region overlay toggle draws polygons |
| **tools/apps/vrising/** | |
| `__init__.py`, `env.py`, `common.py`, `version.py` | package init; env-only paths; JSON writers; `version.json` stamp |
| `data_src/types.yaml` | hand-authored marker taxonomy + locale labels |
| `maps/__init__.py`, `maps/__main__.py` | `python -m vrising.maps <extract\|calibrate\|regions\|emit\|tiles>` |
| `maps/extract.py` | unex export → `parsed/parsed.json` (372 entries + mask paths) |
| `maps/transform.py` | world↔pixel transform (mirrors palworld's) |
| `maps/calibration.py` | the **accepted** `WORLD_BOUNDS` + `ORIENTATION` + provenance |
| `maps/calibrate.py` | FFT offset search over 16 candidates + overlay renders |
| `maps/masks.py` | mask raster → simplified pixel polygon rings |
| `maps/tiles.py` | 6080² PNG → 5×5 1216px WebP tiles; `MapIcon_*` → `icons/` |
| `maps/emit.py` | contract-v1 dataset writer |
| `tests/test_extract.py` | collection parsing + PPtr resolution, synthetic |
| `tests/test_transform.py` | round-trip + orientation cases |
| `tests/test_calibrate.py` | offset recovery on a synthetic scene |
| `tests/test_masks.py` | contour → ring simplification |
| `tests/test_emit.py` | emitted dataset shape |
| **modified files** | |
| `frontend/package.json` | `dev:vrising` / `build:vrising` / `lint:vrising` / `preview:vrising` / `e2e:vrising` |
| `frontend/scripts/changelog-add.mjs` | add `'vrising'` to `APPS` |
| `frontend/scripts/changelog-verify.mjs` | add `'vrising'` to `APPS` |
| `tools/pyproject.toml` | add `apps/vrising` to the wheel packages list |
| `tools/.env.example` | `VRISING_RAW` / `VRISING_DATA_OUT` / `VRISING_RES_OUT` |
| `CLAUDE.md` | app list, artifact repos, port table |

---

## Task 1: Worktree and environment

**Files:** none (setup only).

- [ ] **Step 1: Deal with unpushed local commits BEFORE creating the worktree**

`EnterWorktree` branches from `origin/master`. Find out whether local `master` is ahead:

```bash
cd E:/arkive-games/arkive && git fetch origin && git rev-list --count origin/master..master
```

Expected: `0`. If it prints anything else, local `master` has unpushed commits that the worktree would not contain. Record the local SHA now:

```bash
git rev-parse master
```

Either push (`git push origin master`) so `origin/master` catches up, or keep that SHA and, immediately after Step 2, run `git rebase <sha>` inside the worktree. Do not proceed until `git rev-list --count origin/master..master` is `0` **or** the SHA is written down.

- [ ] **Step 2: Create and enter the worktree**

Use the `EnterWorktree` tool with `name: vrising-app`. It creates `.claude/worktrees/vrising-app` on a new branch and switches the session into it.

Then confirm you are in it and that the branch base is what you expect:

```bash
git rev-parse --show-toplevel && git log --oneline -1
```

Expected: a path under `.claude/worktrees/vrising-app`, and the `HEAD` commit equals `origin/master` (or the local SHA from Step 1 after rebasing).

- [ ] **Step 3: Verify the toolchains respond**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm --version
cd ../tools && uv --version
```

Expected: pnpm `9.12.0` or later, and a `uv` version line. If `pnpm` is missing, `corepack enable` first.

- [ ] **Step 4: Confirm port 15176 is free**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15176
```

Expected: `000` (nothing listening). `15173` (aion2), `15174` (palworld) and `15175` (sts2) may well be in use — that is fine and expected; only `15176` must be free.

- [ ] **Step 5: Locate the unex export root**

The pipeline's input is a `unex` export tree (spec §5.4): `<outputDir>/Texture2D/*.png`, `<outputDir>/MonoBehaviour/*.json`, `<outputDir>/guid-index.json`.

```bash
ls "D:/SteamLibrary/steamapps/common/VRising/Exports" 2>/dev/null || echo "no export yet"
```

If the export does not exist yet, `unex` is still being built in parallel at `E:/arkive-games/unex`. Tasks 2, 3, 4, 8, 10, 11 and 12 do not need it. Tasks 5, 6, 7 and 9 do. Note the path you will use for `VRISING_RAW`; **never** walk `D:/SteamLibrary/steamapps/common/VRising/v3/` (a second, older install).

---

## Task 2: Frontend app scaffold on port 15176

**Files:**
- Create: `frontend/apps/vrising/{package.json,vite.config.ts,index.html,env.d.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,eslint.config.js,.gitignore,playwright.config.ts}`
- Modify: `frontend/package.json`, `frontend/scripts/changelog-add.mjs`, `frontend/scripts/changelog-verify.mjs`

- [ ] **Step 1: Create the directory tree**

```bash
cd .claude/worktrees/vrising-app/frontend
mkdir -p apps/vrising/src/lib apps/vrising/src/components apps/vrising/src/features/map apps/vrising/src/features/changelog apps/vrising/e2e
```

- [ ] **Step 2: Write `apps/vrising/package.json`**

Dependencies follow **palworld** (it renders a map), not sts2. `@gamemap/map-engine-gl` is deliberately absent: the WebGL engine is palworld's optimisation and adds ~1.5 MB of three.js; vrising ships the Leaflet engine only.

```json
{
  "name": "vrising",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@gamemap/data-contract": "workspace:*",
    "@gamemap/map-engine": "workspace:*",
    "@gamemap/map-shell": "workspace:*",
    "@gamemap/ui": "workspace:*",
    "@tanstack/react-router": "^1.170.16",
    "i18next": "^25.6.2",
    "i18next-browser-languagedetector": "^8.2.0",
    "leaflet": "^1.9.4",
    "lucide-react": "^1.21.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-i18next": "^16.3.3",
    "react-leaflet": "^5.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@playwright/test": "^1.61.1",
    "@tailwindcss/vite": "^4.1.17",
    "@types/leaflet": "^1.9.21",
    "@types/node": "^24.10.0",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.1.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "tailwindcss": "^4.1.17",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.3",
    "vite": "npm:rolldown-vite@7.2.2"
  }
}
```

- [ ] **Step 3: Write `apps/vrising/vite.config.ts`**

Port **15176** (aion2 15173, palworld 15174, sts2 15175). The sibling-repo walk is copied from sts2 so it keeps working from inside a worktree, which is several directories deeper than a normal checkout.

```ts
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// Serve the sibling `data-vrising` / `resource-vrising` artifact repos in dev.
// Walk ancestor directories until the sibling repo is found, so this keeps
// working from a git worktree. Override with VRISING_DATA_DIR / VRISING_RES_DIR.
// In prod the frontend reads VITE_DATA_BASE_URL / VITE_RESOURCE_BASE_URL instead.
function siblingRepo(name: string): string {
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    const p = path.resolve(dir, name)
    if (fs.existsSync(p)) return p
    dir = path.dirname(dir)
  }
  return path.resolve(__dirname, '../../../..', name)
}
const DATA_DIR = process.env.VRISING_DATA_DIR ?? siblingRepo('data-vrising')
const RES_DIR = process.env.VRISING_RES_DIR ?? siblingRepo('resource-vrising')

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
}

function staticDirPlugin(name: string, urlPrefix: string, rootDir: string): Plugin {
  const root = path.resolve(rootDir)
  return {
    name,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0])
        const file = path.resolve(path.join(root, rel))
        if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { next(); return }
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  server: { host: '0.0.0.0', port: 15176, strictPort: true, allowedHosts: true },
  plugins: [
    react(),
    tailwindcss(),
    staticDirPlugin('vrising-data', '/data', DATA_DIR),
    staticDirPlugin('vrising-res', '/vrisingres', RES_DIR),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: {
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? Date.now().toString()),
    __BUILD_GIT_COMMIT__: JSON.stringify(execSync('git rev-parse HEAD').toString().trim()),
  },
})
```

- [ ] **Step 4: Write `apps/vrising/index.html` and `apps/vrising/env.d.ts`**

`index.html`:

```html
<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>V Rising Interactive Map</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`env.d.ts`:

```ts
/// <reference types="vite/client" />
declare const __BUILD_TIME__: string
declare const __BUILD_GIT_COMMIT__: string

interface ImportMetaEnv {
  readonly VITE_DATA_BASE_URL?: string
  readonly VITE_RESOURCE_BASE_URL?: string
  readonly VITE_HOME_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_ICP_BEIAN?: string
}
```

- [ ] **Step 5: Copy the three tsconfigs and the eslint config from sts2 verbatim**

They are identical across apps and there is no reason to diverge.

```bash
cd .claude/worktrees/vrising-app/frontend
cp apps/sts2/tsconfig.json apps/sts2/tsconfig.app.json apps/sts2/tsconfig.node.json apps/sts2/eslint.config.js apps/vrising/
```

Verify:

```bash
grep -c . apps/vrising/tsconfig.app.json apps/vrising/eslint.config.js
```

Expected: two non-zero line counts.

- [ ] **Step 6: Write `apps/vrising/.gitignore` and `apps/vrising/playwright.config.ts`**

`.gitignore`:

```gitignore
/test-results/
/playwright-report/
/.playwright/
/.screenshots/
```

`playwright.config.ts` — e2e port **5190**:

```ts
import { defineConfig, devices } from '@playwright/test'

// Distinct from the other apps' e2e ports (aion2 5173, palworld 5188,
// sts2 5189) so suites can run side by side without fighting over a server.
const port = Number(process.env.E2E_PORT ?? 5190)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 7: Register the app in the workspace root scripts**

In `frontend/package.json`, add these five lines to `"scripts"`, directly after the `e2e:sts2` entry:

```json
    "dev:vrising": "pnpm --filter vrising dev",
    "build:vrising": "pnpm --filter vrising build",
    "lint:vrising": "pnpm --filter vrising lint",
    "preview:vrising": "pnpm --filter vrising preview",
    "e2e:vrising": "pnpm --filter vrising e2e",
```

`frontend/pnpm-workspace.yaml` already globs `apps/*`, so no change is needed there.

- [ ] **Step 8: Teach both changelog scripts about the new app**

In `frontend/scripts/changelog-add.mjs`:

```js
const APPS = ['palworld', 'aion2', 'sts2', 'vrising']
```

In `frontend/scripts/changelog-verify.mjs`:

```js
const APPS = ['palworld', 'aion2', 'sts2', 'vrising']
```

Both files currently read `['palworld', 'aion2', 'sts2']`. `changelog-verify` reads every app's `changelog.json` unconditionally, so it will fail until Task 3 creates `apps/vrising/src/changelog.json` — that is expected and is fixed in the next task.

- [ ] **Step 9: Install and confirm the workspace resolves the new package**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm install
```

Expected: the install summary lists `apps/vrising` among the projects, and `apps/vrising/node_modules/@gamemap/map-engine` exists as a link.

```bash
ls -l apps/vrising/node_modules/@gamemap/
```

Expected: symlinks for `data-contract`, `map-engine`, `map-shell`, `ui`.

- [ ] **Step 10: Commit**

```bash
cd .claude/worktrees/vrising-app
git add frontend/apps/vrising frontend/package.json frontend/pnpm-lock.yaml \
        frontend/scripts/changelog-add.mjs frontend/scripts/changelog-verify.mjs
git commit -m "feat(vrising): scaffold the app on port 15176"
```

---

## Task 3: App shell — palette, i18n, routes, changelog page

**Files:**
- Create: `frontend/apps/vrising/src/{index.css,i18n.ts,main.tsx,theme.ts,changelog.json,changelog.test.ts}`
- Create: `frontend/apps/vrising/src/lib/{urls.ts,storage.ts,siteVersion.ts}`
- Create: `frontend/apps/vrising/src/components/{TopNav.tsx,ContentPage.tsx}`
- Create: `frontend/apps/vrising/src/features/changelog/ChangelogPage.tsx`
- Create: `frontend/apps/vrising/src/features/map/MapPage.tsx` (placeholder; filled in Task 10)

- [ ] **Step 1: Write `src/index.css`**

The palette follows V Rising's own look: blood-red primary, cold stone neutrals, a parchment-lit day theme and a night theme close to the game's UI. Per `CLAUDE.md`, the only place a pixel font size may appear is the root `font-size`; everything else uses Tailwind scale steps.

```css
@import "tailwindcss";
@source "../../../packages/ui/src";
@source "../../../packages/map-shell/src";

@custom-variant dark (&:is(.dark *));

/* Palette follows the game's own look: aged parchment and iron by day, cold
   crypt stone by night, with the blood crimson of the vampire UI as the
   primary and the pale gold of its gothic filigree as the accent. */
:root {
  --radius: 0.5rem;
  --background: #F2ECE1;  --foreground: #1C1714;
  --card: #FBF7F0;        --card-foreground: #1C1714;
  --popover: #FBF7F0;     --popover-foreground: #1C1714;
  --primary: #8E1B22;     --primary-foreground: #FBF2EA;
  --secondary: #E2D8C7;   --secondary-foreground: #332A22;
  --muted: #E8E0D2;       --muted-foreground: #665A4C;
  --accent: #A8853C;      --accent-foreground: #FBF2EA;
  --destructive: #A6212A; --destructive-foreground: #ffffff;
  --border: rgba(28, 23, 20, 0.16);
  --input: #E2D8C7;       --ring: #8E1B22;
}

.dark {
  --background: #100E0F;  --foreground: #E6DED4;
  --card: #1A1718;        --card-foreground: #E6DED4;
  --popover: #1A1718;     --popover-foreground: #E6DED4;
  --primary: #D6404A;     --primary-foreground: #120E0F;
  --secondary: #272223;   --secondary-foreground: #E6DED4;
  --muted: #221E1F;       --muted-foreground: #9A8D80;
  --accent: #D8B45E;      --accent-foreground: #120E0F;
  --destructive: #D6404A; --destructive-foreground: #120E0F;
  --border: rgba(230, 222, 212, 0.16);
  --input: #272223;       --ring: #D6404A;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* Desktop readability: raise the rem base from the browser default 16px. This
   is the ONLY hard-coded pixel size in the app — every text size elsewhere is
   a Tailwind scale step so it scales with this value. */
html { font-size: 17px; }

/* The map image's own parchment is warm; the Leaflet void behind it is themed
   so the cleared out-of-border area reads correctly in both themes. */
.leaflet-container { background: var(--muted); }
```

- [ ] **Step 2: Write `src/i18n.ts`**

Three locales only. V Rising ships 19 language files, but they are keyed by bare GUID with no names, so none of the game's own text can be joined to anything yet — offering 19 half-empty languages would be a lie. Region labels are `AccessID`-derived and identical in every locale by design.

```ts
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

/**
 * Languages offered in the switcher.
 *
 * Only three, deliberately. V Rising's localization ships as 19 plain-JSON
 * files keyed by bare GUID with no names, so no game text can be joined to the
 * map data yet — every extra language would show English data under a
 * translated switcher label. When the GUID keys are resolved, add languages
 * here and in the pipeline's `data_src/types.yaml` together.
 */
export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const en = {
  title: 'V Rising Interactive Map',
  siteTitle: 'V Rising Map',
  loadError: 'Failed to load data. Please try again later.',
  loading: 'Loading…',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  collapse: 'Collapse',
  expand: 'Expand',
  filter: 'Filters',
  search: 'Search',
  showAll: 'Show all',
  hideAll: 'Hide all',
  showTooltip: 'Always show labels',
  showRegions: 'Show regions',
  resultsCount: '{{count}} results',
  unnamed: 'Unnamed',
  noDescription: 'No description.',
  scopeName: 'Name',
  scopeAll: 'All fields',
  copyPosition: 'Copy position',
  noMapSelected: 'No map selected.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  nav: { map: 'Map', changelog: 'Changelog' },
  region: { accessId: 'Access ID', area: 'Area' },
  changelog: {
    title: 'Changelog',
    current: 'Current',
    empty: 'No entries yet.',
    kind: { feature: 'Feature', improvement: 'Improvement', fix: 'Fix', data: 'Data' },
  },
}

type Strings = typeof en

const zhCN: Strings = {
  title: '夜族崛起互动地图',
  siteTitle: '夜族崛起地图',
  loadError: '数据加载失败，请稍后重试。',
  loading: '加载中…',
  themeAuto: '自动',
  themeLight: '浅色',
  themeDark: '深色',
  themeMenu: '主题',
  languageMenu: '语言',
  collapse: '收起',
  expand: '展开',
  filter: '筛选',
  search: '搜索',
  showAll: '全部显示',
  hideAll: '全部隐藏',
  showTooltip: '始终显示名称',
  showRegions: '显示区域',
  resultsCount: '{{count}} 个结果',
  unnamed: '未命名',
  noDescription: '暂无描述。',
  scopeName: '名称',
  scopeAll: '全部字段',
  copyPosition: '复制坐标',
  noMapSelected: '未选择地图。',
  zoomIn: '放大',
  zoomOut: '缩小',
  nav: { map: '地图', changelog: '更新日志' },
  region: { accessId: '访问 ID', area: '面积' },
  changelog: {
    title: '更新日志',
    current: '当前版本',
    empty: '暂无记录。',
    kind: { feature: '新功能', improvement: '改进', fix: '修复', data: '数据' },
  },
}

const zhTW: Strings = {
  ...zhCN,
  title: '夜族崛起互動地圖',
  siteTitle: '夜族崛起地圖',
  loadError: '資料載入失敗，請稍後再試。',
  loading: '載入中…',
  themeAuto: '自動',
  themeLight: '淺色',
  themeDark: '深色',
  themeMenu: '主題',
  languageMenu: '語言',
  collapse: '收起',
  expand: '展開',
  filter: '篩選',
  search: '搜尋',
  showAll: '全部顯示',
  hideAll: '全部隱藏',
  showTooltip: '一律顯示名稱',
  showRegions: '顯示區域',
  resultsCount: '{{count}} 個結果',
  unnamed: '未命名',
  noDescription: '暫無描述。',
  scopeName: '名稱',
  scopeAll: '全部欄位',
  copyPosition: '複製座標',
  noMapSelected: '未選擇地圖。',
  zoomIn: '放大',
  zoomOut: '縮小',
  nav: { map: '地圖', changelog: '更新日誌' },
  region: { accessId: '存取 ID', area: '面積' },
  changelog: {
    title: '更新日誌',
    current: '目前版本',
    empty: '暫無紀錄。',
    kind: { feature: '新功能', improvement: '改進', fix: '修復', data: '資料' },
  },
}

const UI: Partial<Record<Language, Strings>> = { 'en-US': en, 'zh-CN': zhCN, 'zh-TW': zhTW }

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: Object.fromEntries(
    LANGUAGES.map((lng) => [lng, { translation: UI[lng] ?? en }]),
  ),
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

export default i18n
```

While typing this file, keep the `CLAUDE.md` language rule in mind: every string in a locale catalog must be wholly in that locale's language. A mixed-language value (English words inside a `zh-TW` string) is a violation even though nothing will fail to compile.

- [ ] **Step 3: Write `src/lib/urls.ts`**

```ts
export const DATA_BASE = import.meta.env.VITE_DATA_BASE_URL ?? '/data'
export const RES_BASE = import.meta.env.VITE_RESOURCE_BASE_URL ?? '/vrisingres'

// Data-artifact content version (version.json, stamped by tools). Appended to
// every data URL as ?v=<version> so browsers can cache the files long-term yet
// pick up new data the moment a deploy changes the version. Resolved once
// before first render (main.tsx); when absent (unstamped artifact, fetch
// failure) data URLs stay bare and caching falls back to revalidation.
let dataVersion: string | undefined

// Game client version the data artifact was exported from. Shown in the top-bar
// build-info hovercard; undefined hides the row.
let gameVersion: string | undefined

export async function initDataVersion(timeoutMs = 2500): Promise<void> {
  try {
    // Race a timeout so a hung CDN can't block first render — the app then
    // proceeds unversioned, which is correct, just less cacheable.
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('version.json timeout')), timeoutMs)
    })
    const r = await Promise.race([
      fetch(`${DATA_BASE}/version.json`, { cache: 'no-cache' }),
      timeout,
    ])
    if (r.ok) {
      const body = (await r.json()) as { version?: unknown; gameVersion?: unknown }
      if (typeof body.version === 'string' && body.version) dataVersion = body.version
      if (typeof body.gameVersion === 'string' && body.gameVersion) gameVersion = body.gameVersion
    }
  } catch {
    /* unversioned artifact or unreachable — fall back to bare URLs */
  }
}

/** Game client version of the data artifact (resolved by initDataVersion). */
export function getGameVersion(): string | undefined {
  return gameVersion
}

/** URL of a data-artifact file (path relative to the artifact root). */
export function dataUrl(path: string): string {
  const url = `${DATA_BASE}/${path}`
  return dataVersion ? `${url}?v=${dataVersion}` : url
}
```

- [ ] **Step 4: Write `src/lib/storage.ts`**

`@gamemap/map-shell` is storage-free by contract (`pnpm check:shell` greps for `localStorage`), so every persisted setting is injected from here.

```ts
import type { Theme, ThemeStorage, MapViewStore } from '@gamemap/map-shell'

const THEME_KEY = 'vrising.theme'
const VISIBLE_KEY = 'vrising.map.visibleSubtypes'
const VIEW_KEY = 'vrising.map.view'

/** Theme persistence, injected into ThemeProvider (map-shell owns no storage). */
export const themeStorage: ThemeStorage = {
  get: () => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' || v === 'auto' ? (v as Theme) : null
    } catch {
      return null
    }
  },
  set: (t) => {
    try { localStorage.setItem(THEME_KEY, t) } catch { /* no storage */ }
  },
}

/** Per-map camera + selection persistence, injected into useMapViewMemory. */
export const mapViewStore: MapViewStore = {
  get: () => {
    try { return localStorage.getItem(VIEW_KEY) } catch { return null }
  },
  set: (raw) => {
    try { localStorage.setItem(VIEW_KEY, raw) } catch { /* no storage */ }
  },
}

/** Visible marker subtypes; null when the user has never chosen (use defaults). */
export function readVisibleSubtypes(): Set<string> | null {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr as string[]) : null
  } catch {
    return null
  }
}

export function writeVisibleSubtypes(ids: Set<string>): void {
  try { localStorage.setItem(VISIBLE_KEY, JSON.stringify([...ids])) } catch { /* no storage */ }
}
```

- [ ] **Step 5: Write `src/theme.ts`**

```ts
import { DEFAULT_MAP_THEME, type MapTheme } from '@gamemap/map-engine'

/**
 * Engine-chrome colours. The defaults are AION2's blue Lanhu palette; V Rising's
 * map is warm parchment, so the pin disc and status pill go to dark iron and the
 * accent dot to the game's blood crimson.
 */
export const vrisingTheme: MapTheme = {
  ...DEFAULT_MAP_THEME,
  pinDiscBg: '#221E1F',
  pinBorder: '#D8B45E',
  pinDot: '#D6404A',
  completedAccent: '#D8B45E',
  zoomGlyph: '#E6DED4',
  statusPillBg: 'rgba(16, 14, 15, 0.82)',
}
```

Before writing this, confirm the field names against the package — `MapTheme` is `PinTheme` plus chrome tokens:

```bash
cd .claude/worktrees/vrising-app/frontend && cat packages/map-engine/src/theme.ts
```

Expected: a `MapTheme` interface containing `pinDiscBg`, `pinBorder`, `pinDot`, `completedAccent`, `zoomGlyph`, `statusPillBg`. Drop or rename any field the file does not declare.

- [ ] **Step 6: Seed `src/changelog.json` with the launch entry**

`pnpm changelog:add` cannot create the first entry (it errors with "has no entries to build on"), so the launch entry is hand-written. It must pin a **real 40-char SHA reachable from HEAD** or `changelog:verify` and `changelog.test.ts` fail — so seed it with the current branch point and re-point it at the real launch commit in Task 12.

```bash
cd .claude/worktrees/vrising-app && git rev-parse HEAD
```

Use that SHA below (replace `<HEAD_SHA>`), and today's date:

```json
{
  "entries": [
    {
      "version": "1.0.0",
      "date": "2026-07-30",
      "commit": "<HEAD_SHA>",
      "changes": [
        {
          "kind": "feature",
          "text": {
            "en-US": "New V Rising interactive map: the full Vardoran world map with all 372 game regions outlined, searchable and filterable.",
            "zh-CN": "全新夜族崛起互动地图：完整的瓦尔多兰世界地图，标出全部 372 个游戏区域，支持搜索与筛选。",
            "zh-TW": "全新夜族崛起互動地圖：完整的瓦爾多蘭世界地圖，標出全部 372 個遊戲區域，支援搜尋與篩選。"
          }
        }
      ]
    }
  ]
}
```

- [ ] **Step 7: Write `src/lib/siteVersion.ts` and `src/changelog.test.ts`**

`siteVersion.ts`:

```ts
import { type ChangelogFile } from '@gamemap/ui'
import raw from '../changelog.json'

export const changelog = raw as ChangelogFile

/**
 * Current site version — the newest changelog entry. Read from here (not from
 * the page component) so ContentPage / TopNav / ChangelogPage don't form an
 * import cycle.
 */
export const SITE_VERSION = changelog.entries[0].version
```

`changelog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateChangelog, type ChangelogFile } from '@gamemap/ui'
import raw from './changelog.json'

const file = raw as ChangelogFile

describe('vrising changelog.json', () => {
  it('is structurally valid', () => {
    expect(validateChangelog(file)).toEqual([])
  })

  it('pins every version to a distinct real commit', () => {
    for (const entry of file.entries) {
      expect(entry.commit, entry.version).toMatch(/^[0-9a-f]{40}$/)
    }
    expect(new Set(file.entries.map((e) => e.commit)).size).toBe(file.entries.length)
  })

  it('starts at the launch entry', () => {
    expect(file.entries.at(-1)).toMatchObject({ version: '1.0.0' })
  })
})
```

- [ ] **Step 8: Write `src/components/TopNav.tsx` and `src/components/ContentPage.tsx`**

`TopNav.tsx`:

```tsx
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ShellTopBar, useTheme, type Theme } from '@gamemap/map-shell'
import { BuildInfo } from '@gamemap/ui'
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '../i18n'
import { SITE_VERSION } from '../lib/siteVersion'
import { getGameVersion } from '../lib/urls'

export type NavKey = '/' | '/changelog'

const ITEMS: { key: NavKey; labelKey: string }[] = [{ key: '/', labelKey: 'nav.map' }]

export function TopNav({ active }: { active: NavKey }) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <ShellTopBar
      classNames={{ root: 'border-b border-border bg-card' }}
      leftSlot={
        <Link to="/" className="text-base font-bold tracking-tight text-primary">
          {t('siteTitle')}
        </Link>
      }
      nav={{
        items: ITEMS.map((item) => ({
          key: item.key,
          label: t(item.labelKey),
          active: active === item.key,
        })),
        renderItem: (item, className) => (
          <Link to={item.key} className={className}>
            {item.label}
          </Link>
        ),
      }}
      languageSwitcher={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code as Language] })),
        current: i18n.resolvedLanguage ?? 'en-US',
        onChange: (code) => void i18n.changeLanguage(code),
        menuLabel: t('languageMenu'),
      }}
      themeSwitcher={{
        options: [
          { value: 'auto', label: t('themeAuto') },
          { value: 'light', label: t('themeLight') },
          { value: 'dark', label: t('themeDark') },
        ],
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        menuLabel: t('themeMenu'),
      }}
      rightExtras={
        <BuildInfo
          commit={__BUILD_GIT_COMMIT__}
          buildTime={__BUILD_TIME__}
          dev={import.meta.env.DEV}
          gameVersion={getGameVersion()}
          siteVersion={<Link to="/changelog">v{SITE_VERSION}</Link>}
        />
      }
    />
  )
}
```

`ContentPage.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn, SiteFooter } from '@gamemap/ui'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'

export interface ContentPageProps {
  active: NavKey
  /** Mobile header text, and the desktop <h1> when `heading` is set. */
  title: ReactNode
  heading?: boolean
  /** Widen past the default for dense grids. */
  wide?: boolean
  children: ReactNode
}

export function ContentPage({ active, title, heading = false, wide = false, children }: ContentPageProps) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} />
      <header
        className="flex h-12 shrink-0 items-center border-b border-border bg-card px-4 text-base font-semibold text-card-foreground md:hidden"
        data-testid="mobile-header"
      >
        {title}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className={cn('mx-auto w-full flex-1 px-4 py-6', wide ? 'max-w-7xl' : 'max-w-6xl')}>
            {heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
            {children}
          </div>
          <SiteFooter
            className="pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Write `src/features/changelog/ChangelogPage.tsx`**

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { VersionHistory, resolveChangelog } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { changelog } from '../../lib/siteVersion'

export default function ChangelogPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const entries = useMemo(() => resolveChangelog(changelog, lng), [lng])

  return (
    <ContentPage active="/changelog" title={t('changelog.title')} heading>
      <VersionHistory
        entries={entries}
        labels={{
          current: t('changelog.current'),
          empty: t('changelog.empty'),
          kinds: {
            feature: t('changelog.kind.feature'),
            improvement: t('changelog.kind.improvement'),
            fix: t('changelog.kind.fix'),
            data: t('changelog.kind.data'),
          },
        }}
      />
    </ContentPage>
  )
}
```

- [ ] **Step 10: Write a placeholder `src/features/map/MapPage.tsx`**

Task 10 replaces this entirely. It exists now so `main.tsx` typechecks and the route tree is complete from the first commit.

```tsx
import { useTranslation } from 'react-i18next'

/** Placeholder — replaced by the real map in Task 10. */
export default function MapPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
      {t('loading')}
    </div>
  )
}
```

- [ ] **Step 11: Write `src/main.tsx`**

Routes are declared in code — **no** `routeTree.gen.ts`, **no** `@tanstack/router-plugin`, so nothing has to be generated before `tsc -b`.

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { ThemeProvider } from '@gamemap/map-shell'
import 'leaflet/dist/leaflet.css'
import '@gamemap/map-engine/engine.css'
import './index.css'
import './i18n'
import MapPage from './features/map/MapPage'
import ChangelogPage from './features/changelog/ChangelogPage'
import { themeStorage } from './lib/storage'
import { initDataVersion } from './lib/urls'

const rootRoute = createRootRoute({ component: () => <Outlet /> })

export interface MapSearch {
  /** Prefill the marker search box. */
  q?: string
}
const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): MapSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
  component: MapPage,
})

// Site version history. Not a nav item — reached from the footer version link
// and the top-bar build hovercard.
const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/changelog',
  component: ChangelogPage,
})

const routeTree = rootRoute.addChildren([mapRoute, changelogRoute])

const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

// Resolve the data-artifact version before first render so every data fetch
// carries its ?v= cache-buster (initDataVersion never rejects and times out
// internally, so a slow data host can't block the app).
void initDataVersion().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="auto" storage={themeStorage}>
        <RouterProvider router={router} />
      </ThemeProvider>
    </StrictMode>,
  )
})
```

- [ ] **Step 12: Verify the build, the tests, the lint and the package gates**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm --filter vrising build
```
Expected: `tsc -b` emits nothing and `vite build` prints a bundle summary ending in `built in …`. If `tsc -b` complains about a missing `routeTree.gen`, you added the router plugin by mistake — remove it.

```bash
pnpm test
```
Expected: all suites pass, including a new `apps/vrising/src/changelog.test.ts` with 3 passing tests.

```bash
pnpm --filter vrising lint && pnpm check:engine && pnpm check:shell
```
Expected: no output from any of the three (exit 0). The `check:*` gates must stay clean — this task touched no shared package.

```bash
node scripts/changelog-verify.mjs
```
Expected: four `ok` lines, one per app, including `changelog-verify: vrising ok (1 versions)`.

- [ ] **Step 13: Confirm no generated route tree is needed anywhere in this app**

```bash
cd .claude/worktrees/vrising-app/frontend && grep -rn "router-plugin\|routeTree" apps/vrising || echo "clean: code-defined routes only"
```
Expected: `clean: code-defined routes only`.

- [ ] **Step 14: Commit**

```bash
cd .claude/worktrees/vrising-app
git add frontend/apps/vrising/src
git commit -m "feat(vrising): app shell with palette, i18n, routes and changelog page"
```

---

## Task 4: tools pipeline scaffold and artifact repos

**Files:**
- Create: `tools/apps/vrising/{__init__.py,env.py,common.py,version.py}`
- Create: `tools/apps/vrising/maps/{__init__.py,__main__.py}`
- Create: `tools/apps/vrising/tests/__init__.py`
- Modify: `tools/pyproject.toml`, `tools/.env.example`
- Create (outside the repo): `E:/arkive-games/data-vrising`, `E:/arkive-games/resource-vrising`

- [ ] **Step 1: Create the package tree**

```bash
cd .claude/worktrees/vrising-app/tools
mkdir -p apps/vrising/maps apps/vrising/tests apps/vrising/data_src
touch apps/vrising/__init__.py apps/vrising/maps/__init__.py apps/vrising/tests/__init__.py
```

- [ ] **Step 2: Write `apps/vrising/env.py`**

Environment only, no defaults — the palworld pipeline's hardcoded paths were removed on purpose (2026-07-09) and a missing variable must raise rather than silently write to a stale directory.

```python
"""Per-machine paths for the V Rising pipeline — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  VRISING_RAW       unex export root (Texture2D/, MonoBehaviour/, guid-index.json)
  VRISING_DATA_OUT  data-vrising repo (dataset the frontend fetches)
  VRISING_RES_OUT   resource-vrising repo (WebP tiles + icons)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env — anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def require_dir(name: str) -> Path:
    """The directory configured under ``name``; raises when unset."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set: add it to tools/.env (see tools/.env.example) or export it"
        )
    return Path(value)


def optional_dir(name: str) -> Path | None:
    """Like :func:`require_dir` but ``None`` when unset (for skippable tests
    and genuinely optional inputs)."""
    value = os.environ.get(name)
    return Path(value) if value else None
```

- [ ] **Step 3: Write `apps/vrising/common.py`**

Byte-compatible with the other pipelines' JSON so artifact diffs stay reviewable.

```python
"""Shared helpers for the V Rising pipeline.

The JSON writers are deliberately byte-compatible with the other pipelines'
output (``JSON.stringify(obj, null, 1)``): raw UTF-8, 1-space indent, and no
``.0`` on integral numbers.
"""

from __future__ import annotations

import json
import math
from pathlib import Path


def round2(v: float) -> float:
    """2-decimal round matching JS ``Math.round(v*100)/100`` (half toward +Inf)."""
    return math.floor(v * 100 + 0.5) / 100


def _canon(o):
    # Render integral floats as ints (JS: `1.0` serializes as `1`).
    if isinstance(o, bool):
        return o
    if isinstance(o, float):
        return int(o) if o.is_integer() else o
    if isinstance(o, dict):
        return {k: _canon(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_canon(v) for v in o]
    return o


def dumps(obj) -> str:
    """JSON string matching ``JSON.stringify(obj, null, 1)``."""
    return json.dumps(_canon(obj), ensure_ascii=False, indent=1)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(obj), encoding="utf-8")


def read_json(path: Path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
```

- [ ] **Step 4: Write `apps/vrising/version.py`**

```python
"""Content-version stamp for the data artifact (browser cache busting).

The frontend fetches ``version.json`` first (served ``max-age=0,
must-revalidate``) and appends ``?v=<version>`` to every other data URL
(served long-cache), so a data-only deploy reaches browsers immediately.
The version is a digest of the artifact's contents: byte-identical re-runs
keep the same version and don't bust caches for nothing.

Every pipeline entrypoint that writes into ``VRISING_DATA_OUT`` re-stamps on
exit; the digest always covers the whole directory, so whichever stage runs
last leaves a correct stamp.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .common import read_json, write_json
from .env import optional_dir

VERSION_FILE = "version.json"


def read_game_version(raw: Path) -> str | None:
    """The game build the export came from, out of unex's ``meta.json``.

    ``None`` when the export predates version stamping or the file is
    unreadable. Never invented — an unknown build must read as unknown.
    """
    meta_path = Path(raw) / "meta.json"
    if not meta_path.is_file():
        return None
    try:
        meta = read_json(meta_path)
    except (ValueError, OSError):
        return None
    game = meta.get("game")
    if isinstance(game, dict):
        version = game.get("version")
        if isinstance(version, str) and version:
            return version
    return None


def stamp_version(data_out: Path) -> str:
    """Digest the artifact directory and (re)write ``version.json``.

    Excludes ``version.json`` itself (so re-stamping is stable) and any
    dot-path (``.git``, ``.gitignore`` — the artifact dirs are git repos).
    """
    data_out = Path(data_out)
    h = hashlib.sha256()
    for p in sorted(data_out.rglob("*"), key=lambda p: p.relative_to(data_out).as_posix()):
        if not p.is_file():
            continue
        rel = p.relative_to(data_out).as_posix()
        if rel == VERSION_FILE or any(part.startswith(".") for part in rel.split("/")):
            continue
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(p.read_bytes())
    version = h.hexdigest()[:12]
    payload: dict[str, str] = {"version": version}
    raw = optional_dir("VRISING_RAW")
    game_version = read_game_version(raw) if raw else None
    if game_version:
        payload["gameVersion"] = game_version
    write_json(data_out / VERSION_FILE, payload)
    print(f"version: {version}" + (f" (game {game_version})" if game_version else ""))
    return version
```

- [ ] **Step 5: Write `apps/vrising/maps/__main__.py`**

The stage list is fixed now; each stage's implementation lands in a later task. Stages not yet written raise `ImportError` — that is fine and expected until then.

```python
"""CLI: ``python -m vrising.maps <extract|calibrate|regions|emit|tiles>``.

Paths come from env vars / ``tools/.env`` — required per stage, no defaults
(see ``vrising.env``):
  VRISING_RAW       unex export root
  VRISING_DATA_OUT  data-vrising repo
  VRISING_RES_OUT   resource-vrising repo

Stage order for a cold build:
  extract -> calibrate (once, human-reviewed) -> regions -> emit -> tiles
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ..env import require_dir

PARSED_DIR = Path(__file__).resolve().parent.parent / "parsed"


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m vrising.maps")
    ap.add_argument("stage", choices=["extract", "calibrate", "regions", "emit", "tiles"])
    args = ap.parse_args()

    if args.stage == "extract":
        from .extract import write_parsed
        write_parsed(require_dir("VRISING_RAW"), PARSED_DIR)
        print(f"extract: wrote {PARSED_DIR}")
    elif args.stage == "calibrate":
        from .calibrate import run_calibrate
        run_calibrate(require_dir("VRISING_RAW"), PARSED_DIR)
    elif args.stage == "regions":
        from .masks import run_regions
        run_regions(require_dir("VRISING_RAW"), PARSED_DIR)
    elif args.stage == "emit":
        from ..version import stamp_version
        from .emit import run_emit
        run_emit(PARSED_DIR, require_dir("VRISING_DATA_OUT"))
        stamp_version(require_dir("VRISING_DATA_OUT"))
    elif args.stage == "tiles":
        from ..version import stamp_version
        from .tiles import run_tiles
        run_tiles(
            require_dir("VRISING_RAW"),
            require_dir("VRISING_DATA_OUT"),
            require_dir("VRISING_RES_OUT"),
        )
        stamp_version(require_dir("VRISING_DATA_OUT"))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Add the package to `tools/pyproject.toml`**

Change the wheel packages line from

```toml
packages = ["apps/aion2", "apps/palworld", "apps/sts2", "packages/tools"]
```

to

```toml
packages = ["apps/aion2", "apps/palworld", "apps/sts2", "apps/vrising", "packages/tools"]
```

- [ ] **Step 7: Add the env block to `tools/.env.example`**

Append:

```dotenv
# --- V Rising ---

# unex export root (Texture2D/ + MonoBehaviour/ + guid-index.json).
# Produced by: unex export --profile vrising
VRISING_RAW=D:/SteamLibrary/steamapps/common/VRising/Exports
# Output repos the frontend reads over HTTP (siblings of this monorepo).
VRISING_DATA_OUT=E:/arkive-games/data-vrising
VRISING_RES_OUT=E:/arkive-games/resource-vrising
```

Then add the same three variables to your own `tools/.env` (gitignored).

- [ ] **Step 8: Bootstrap the two artifact repos**

These live **outside** the monorepo and are pulled over HTTP in production. Their EdgeOne header configs are copied from the sts2 artifacts (data = long-cache with a `must-revalidate` override for `version.json`; resource = 1 hour + stale-while-revalidate).

```bash
mkdir -p E:/arkive-games/data-vrising E:/arkive-games/resource-vrising
cd E:/arkive-games/data-vrising && git init -b master
cp E:/arkive-games/data-sts2/edgeone.json .
cd E:/arkive-games/resource-vrising && git init -b master
cp E:/arkive-games/resource-sts2/edgeone.json .
```

Verify the header rule shape (the specific `/version.json` rule must beat the `/*` rule — this is verified live behaviour on EdgeOne):

```bash
cat E:/arkive-games/data-vrising/edgeone.json
```
Expected: two `headers` entries, `/*` with `max-age=31536000` and `/version.json` with `max-age=0, must-revalidate`.

- [ ] **Step 9: Verify the package imports and pytest still collects**

```bash
cd .claude/worktrees/vrising-app/tools && uv run python -c "import vrising.env, vrising.common, vrising.version; print('ok')"
```
Expected: `ok`.

```bash
uv run pytest -q
```
Expected: the existing suites pass; `apps/vrising/tests` collects 0 tests (none written yet).

- [ ] **Step 10: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising tools/pyproject.toml tools/.env.example
git commit -m "feat(vrising): scaffold the tools pipeline package and stage CLI"
```

---

## Task 5: Extract stage — the 372 region entries

**Files:**
- Create: `tools/apps/vrising/maps/extract.py`
- Test: `tools/apps/vrising/tests/test_extract.py`

The input is a `unex` export tree. The two collections land at
`<RAW>/MonoBehaviour/ZoneMap_VRisingWorld_POIPolygonTextureCollection.json` and
`…_TerritoryTextureCollection.json`; the mask rasters at `<RAW>/Texture2D/POIPolygon_<N>.png`
and `…/Territory_<N>.png`; the world map at `<RAW>/Texture2D/ZoneMap_Wilderness_VRisingWorld.png`.
`MainTex` is a `PPtr`, so each entry's mask is resolved through `guid-index.json`
(which carries `pathId` and `outputPath` per object) rather than by guessing that
entry *i* is `POIPolygon_i`.

- [ ] **Step 1: Write the failing test**

```python
from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from vrising.maps.extract import build_parsed, resolve_mask_paths, scale_check


def _write_export(root, entries, guid_rows, mask_sizes):
    (root / "MonoBehaviour").mkdir(parents=True)
    (root / "Texture2D").mkdir(parents=True)
    (root / "MonoBehaviour" / "ZoneMap_VRisingWorld_POIPolygonTextureCollection.json").write_text(
        json.dumps({"m_Name": "ZoneMap_VRisingWorld_POIPolygonTextureCollection", "Entries": entries}),
        encoding="utf-8",
    )
    (root / "MonoBehaviour" / "ZoneMap_VRisingWorld_TerritoryTextureCollection.json").write_text(
        json.dumps({"m_Name": "ZoneMap_VRisingWorld_TerritoryTextureCollection", "Entries": []}),
        encoding="utf-8",
    )
    (root / "guid-index.json").write_text(json.dumps({"objects": guid_rows}), encoding="utf-8")
    for name, (w, h) in mask_sizes.items():
        Image.new("RGBA", (w, h), (255, 255, 255, 255)).save(root / "Texture2D" / f"{name}.png")


def _entry(path_id, ax, ay, cx, cy):
    """One collection entry; MinUV/MaxUV are world AABBs (not UVs)."""
    return {
        "MainTex": {"m_FileID": 0, "m_PathID": path_id},
        "AccessID": {"x": 1, "y": 2, "z": 3},
        "CenterPosWS": {"x": cx, "y": cy},
        "AspectRatio": {"x": ax, "y": ay},
        "MinUV": {"x": cx - ax / 2, "y": cy - ay / 2},
        "MaxUV": {"x": cx + ax / 2, "y": cy + ay / 2},
    }


def test_resolves_mask_paths_through_the_guid_index(tmp_path):
    _write_export(
        tmp_path,
        [_entry(101, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    resolved = resolve_mask_paths(tmp_path)
    assert resolved[101] == "Texture2D/POIPolygon_7.png"


def test_unresolved_pptr_raises_and_names_the_entry(tmp_path):
    _write_export(
        tmp_path,
        [_entry(999, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    with pytest.raises(RuntimeError, match="999"):
        build_parsed(tmp_path)


def test_center_is_the_aabb_midpoint_and_aspect_is_the_span(tmp_path):
    _write_export(
        tmp_path,
        [_entry(101, 100.0, 50.0, -500.0, -300.0)],
        [{"pathId": 101, "name": "POIPolygon_7", "typeName": "Texture2D", "outputPath": "Texture2D/POIPolygon_7.png"}],
        {"POIPolygon_7": (200, 100)},
    )
    parsed = build_parsed(tmp_path)
    (e,) = parsed["entries"]
    assert e["kind"] == "poi"
    assert e["center"] == [-500.0, -300.0]
    assert e["min"] == [-550.0, -325.0]
    assert e["max"] == [-450.0, -275.0]
    assert e["mask"] == "Texture2D/POIPolygon_7.png"
    assert e["maskSize"] == [200, 100]


def test_scale_check_reports_units_per_pixel_and_axis_order(tmp_path):
    # 100 world units over 200 mask px = 0.5 u/px, no axis swap.
    entries = [
        {"min": [-550.0, -325.0], "max": [-450.0, -275.0], "maskSize": [200, 100]},
        {"min": [0.0, 0.0], "max": [40.0, 20.0], "maskSize": [80, 40]},
    ]
    report = scale_check(entries)
    assert report["direct"] == 2
    assert report["swapped"] == 0
    assert report["unitsPerPixel"] == pytest.approx(0.5)


def test_scale_check_detects_a_swapped_axis_order():
    entries = [{"min": [0.0, 0.0], "max": [40.0, 20.0], "maskSize": [40, 80]}]
    report = scale_check(entries)
    assert report["direct"] == 0
    assert report["swapped"] == 1


def test_union_bounds_cover_every_entry():
    from vrising.maps.extract import union_bounds

    entries = [
        {"min": [-100.0, -50.0], "max": [-40.0, 10.0]},
        {"min": [-200.0, -30.0], "max": [-150.0, 60.0]},
    ]
    assert union_bounds(entries) == {"min": [-200.0, -50.0], "max": [-40.0, 60.0]}


def test_mask_alpha_is_read_as_a_boolean_silhouette(tmp_path):
    from vrising.maps.extract import load_mask

    img = np.zeros((4, 4, 4), dtype=np.uint8)
    img[1:3, 1:3, 3] = 255
    img[0, 0, 3] = 8  # antialiased fringe, below threshold
    Image.fromarray(img, "RGBA").save(tmp_path / "m.png")
    m = load_mask(tmp_path / "m.png")
    assert m.shape == (4, 4)
    assert m.sum() == 4
    assert not m[0, 0]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_extract.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.extract'`.

- [ ] **Step 3: Write `apps/vrising/maps/extract.py`**

```python
"""Extract stage: unex export -> ``parsed/parsed.json``.

Reads the two georeferenced region collections and the world map's pixel size,
and resolves each entry's ``MainTex`` PPtr to an exported mask PNG through
``guid-index.json``. Nothing here needs DOTS parsing.

Verified facts this stage relies on (see the plan's "Critical context"):
  * ``MinUV``/``MaxUV`` are WORLD-space AABBs despite the name — ``CenterPosWS``
    is their midpoint (372/372) and ``AspectRatio`` is their span (372/372).
  * Masks are rasterized filled silhouettes with antialiased edges. There is no
    vertex data and there are no names.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from ..common import read_json, write_json

Image.MAX_IMAGE_PIXELS = None  # the world map is 6080x6080

WORLD_MAP = "Texture2D/ZoneMap_Wilderness_VRisingWorld.png"
COLLECTIONS = {
    "poi": "MonoBehaviour/ZoneMap_VRisingWorld_POIPolygonTextureCollection.json",
    "territory": "MonoBehaviour/ZoneMap_VRisingWorld_TerritoryTextureCollection.json",
}
# Entry counts measured on the shipped game. A drift here means the game changed
# its region set (or the export is partial) — worth a loud warning, not a crash.
EXPECTED_COUNTS = {"poi": 226, "territory": 146}
# Alpha at/above this counts as "inside the silhouette". The rasters are
# antialiased, so a mid-level threshold keeps the edge stable without eating
# thin features.
ALPHA_THRESHOLD = 128
# Mask raster scale, verified during the survey.
UNITS_PER_PIXEL = 0.5


def _f2(v) -> list[float]:
    """A serialized Unity ``float2``/``Vector2`` as ``[x, y]``."""
    return [float(v["x"]), float(v["y"])]


def _entries_of(doc) -> list[dict]:
    """The entry array of a collection MonoBehaviour.

    unex serializes MonoBehaviour fields under their real names (bundles carry
    embedded TypeTrees), but the array's field name is not guaranteed, so accept
    the first list-of-dicts field that carries ``MainTex``.
    """
    for key in ("Entries", "entries", "Textures", "textures", "Items", "items"):
        val = doc.get(key)
        if isinstance(val, list) and (not val or isinstance(val[0], dict)):
            return val
    for val in doc.values():
        if isinstance(val, list) and val and isinstance(val[0], dict) and "MainTex" in val[0]:
            return val
    raise RuntimeError(
        "no entry array found in the collection MonoBehaviour; inspect it with "
        "`unex preview --profile vrising <vfs-path>` and add its field name to _entries_of"
    )


def resolve_mask_paths(raw: Path) -> dict[int, str]:
    """``PathID -> export-relative PNG path`` for every exported Texture2D.

    unex's ``guid-index.json`` is the bridge from a PPtr to a file on disk: the
    export tree is type-first and name-based, so a PPtr cannot be turned into a
    path any other way.
    """
    index = read_json(Path(raw) / "guid-index.json")
    rows = index.get("objects") if isinstance(index, dict) else index
    if not isinstance(rows, list):
        raise RuntimeError("guid-index.json has no `objects` array")
    out: dict[int, str] = {}
    for row in rows:
        path = row.get("outputPath")
        pid = row.get("pathId")
        if path and pid is not None and str(path).lower().endswith(".png"):
            out[int(pid)] = str(path).replace("\\", "/")
    return out


def load_mask(path: Path) -> np.ndarray:
    """A mask PNG as a boolean silhouette (True = inside), row 0 = top."""
    with Image.open(path) as im:
        alpha = np.array(im.convert("RGBA"))[:, :, 3]
    return alpha >= ALPHA_THRESHOLD


def union_bounds(entries: list[dict]) -> dict[str, list[float]]:
    """AABB covering every entry's world box."""
    xs_min = min(e["min"][0] for e in entries)
    ys_min = min(e["min"][1] for e in entries)
    xs_max = max(e["max"][0] for e in entries)
    ys_max = max(e["max"][1] for e in entries)
    return {"min": [xs_min, ys_min], "max": [xs_max, ys_max]}


def scale_check(entries: list[dict], tol_px: float = 2.0) -> dict:
    """Which axis order the mask rasters use, and at what world-units-per-pixel.

    For each entry the world span (``max - min``) and the mask raster size are
    both known, so the scale is over-determined 372 times. ``direct`` counts
    entries where span-x matches raster width; ``swapped`` counts entries where
    span-x matches raster height instead. One of the two should win outright —
    that resolves the mask's own axis order before any image search runs.
    """
    direct = swapped = 0
    ratios: list[float] = []
    for e in entries:
        span_x = e["max"][0] - e["min"][0]
        span_y = e["max"][1] - e["min"][1]
        mw, mh = e["maskSize"]
        if mw and abs(span_x / UNITS_PER_PIXEL - mw) <= tol_px and mh and abs(span_y / UNITS_PER_PIXEL - mh) <= tol_px:
            direct += 1
            ratios.append(span_x / mw)
        elif mh and abs(span_x / UNITS_PER_PIXEL - mh) <= tol_px and mw and abs(span_y / UNITS_PER_PIXEL - mw) <= tol_px:
            swapped += 1
            ratios.append(span_x / mh)
    return {
        "direct": direct,
        "swapped": swapped,
        "total": len(entries),
        "unitsPerPixel": (sum(ratios) / len(ratios)) if ratios else None,
    }


def build_parsed(raw: Path) -> dict:
    """The parsed payload: world-map size, region entries, union bounds, checks."""
    raw = Path(raw)
    masks = resolve_mask_paths(raw)

    entries: list[dict] = []
    for kind, rel in COLLECTIONS.items():
        doc = read_json(raw / rel)
        raw_entries = _entries_of(doc)
        if len(raw_entries) != EXPECTED_COUNTS[kind]:
            print(
                f"extract: WARNING {kind} has {len(raw_entries)} entries, "
                f"expected {EXPECTED_COUNTS[kind]} — the game's region set changed"
            )
        for i, e in enumerate(raw_entries):
            path_id = int(e["MainTex"]["m_PathID"])
            rel_mask = masks.get(path_id)
            if not rel_mask:
                raise RuntimeError(
                    f"{kind} entry {i}: MainTex PathID {path_id} is not in guid-index.json. "
                    "Re-run `unex export --profile vrising` so the mask textures are exported."
                )
            with Image.open(raw / rel_mask) as im:
                mask_size = [im.width, im.height]
            access = e["AccessID"]
            entries.append({
                "id": f"{'poi' if kind == 'poi' else 'terr'}_{i:03d}",
                "kind": kind,
                "index": i,
                "accessId": [int(access["x"]), int(access["y"]), int(access["z"])],
                "center": _f2(e["CenterPosWS"]),
                "min": _f2(e["MinUV"]),
                "max": _f2(e["MaxUV"]),
                "aspect": _f2(e["AspectRatio"]),
                "mask": rel_mask,
                "maskSize": mask_size,
            })

    with Image.open(raw / WORLD_MAP) as im:
        map_size = [im.width, im.height]

    per_kind = {k: union_bounds([e for e in entries if e["kind"] == k]) for k in COLLECTIONS}
    return {
        "mapImage": WORLD_MAP,
        "mapSize": map_size,
        "entries": entries,
        "unionBounds": union_bounds(entries),
        "unionBoundsByKind": per_kind,
        "scaleCheck": scale_check(entries),
    }


def write_parsed(raw: Path, parsed_dir: Path) -> None:
    parsed = build_parsed(raw)
    write_json(Path(parsed_dir) / "parsed.json", parsed)
    sc = parsed["scaleCheck"]
    ub = parsed["unionBounds"]
    print(f"extract: {len(parsed['entries'])} regions, map {parsed['mapSize'][0]}x{parsed['mapSize'][1]}")
    print(f"extract: union world bounds x[{ub['min'][0]:.0f}..{ub['max'][0]:.0f}] y[{ub['min'][1]:.0f}..{ub['max'][1]:.0f}]")
    print(f"extract: mask axis order direct={sc['direct']} swapped={sc['swapped']} of {sc['total']}, "
          f"units/px={sc['unitsPerPixel']}")


def read_parsed(parsed_dir: Path) -> dict:
    return read_json(Path(parsed_dir) / "parsed.json")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_extract.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the stage against the real export**

Run: `cd .claude/worktrees/vrising-app/tools && uv run python -m vrising.maps extract`

Expected output shape (the exact numbers are the measured ones, so they should reproduce):

```
extract: 372 regions, map 6080x6080
extract: union world bounds x[-2623..-37] y[-1923..368]
extract: mask axis order direct=372 swapped=0 of 372, units/px=0.5
```

Three things to read off this run:
- `372 regions` and `6080x6080` confirm the export is complete.
- `direct=372 swapped=0` (or `direct=0 swapped=372`) resolves the mask axis order. A **mixed** result means the 0.5 u/px assumption is wrong for some entries — stop and investigate before Task 7; a split result would make the offset search meaningless.
- `units/px=0.5` confirms the mask scale, which is what pins the world span of the map image to `6080 × 0.5 = 3040` world units in Task 7.

If the run fails inside `_entries_of`, inspect the real field names and add the correct key:

```bash
unex preview --profile vrising "serialized/resources.assets/MonoBehaviour/ZoneMap_VRisingWorld_POIPolygonTextureCollection" | head -40
```

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/maps/extract.py tools/apps/vrising/tests/test_extract.py
git commit -m "feat(vrising): extract the 372 georeferenced region entries from the zone-map collections"
```

---

## Task 6: Tiles stage — 6080² image into a 5×5 grid, plus map icons

**Files:**
- Create: `tools/apps/vrising/maps/tiles.py`
- Test: `tools/apps/vrising/tests/test_tiles.py`

Reuses palworld's convention exactly (`tools/apps/palworld/maps/tiles.py`): one native zoom level, tiles at `<res>/tiles/<MapId>/<MapId>_<xx>_<yy>.webp` with zero-padded 2-digit `col_row` indices, `(0,0)` top-left, `y` down. The only difference is the tile size: `6080 = 1216 × 5`, so `TILE = 1216`, `COUNT = 5`. No padding, no pyramid.

- [ ] **Step 1: Write the failing test**

```python
from __future__ import annotations

from PIL import Image

from vrising.maps.tiles import COUNT, MAP_ID, TILE, slice_tiles, tile_grid


def test_tile_grid_divides_6080_exactly():
    assert TILE * COUNT == 6080
    assert tile_grid(6080) == (1216, 5)


def test_tile_grid_rejects_a_size_it_cannot_divide():
    # A non-divisible size must raise rather than silently pad: padding would
    # put a fudge factor into worldBounds.
    try:
        tile_grid(6081)
    except ValueError as exc:
        assert "6081" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_slice_tiles_writes_a_full_named_grid(tmp_path):
    src = tmp_path / "map.png"
    # A tiny stand-in grid: 4 px per tile, 5 tiles per side.
    Image.new("RGBA", (20, 20), (10, 20, 30, 255)).save(src)
    res_out = tmp_path / "res"
    written = slice_tiles(src, res_out, tile=4, count=5)
    assert written == 25
    names = sorted(p.name for p in (res_out / "tiles" / MAP_ID).iterdir())
    assert names[0] == f"{MAP_ID}_00_00.webp"
    assert names[-1] == f"{MAP_ID}_04_04.webp"
    assert len(names) == 25


def test_slice_tiles_indexes_column_then_row(tmp_path):
    # Column index comes first in the filename; row second. Paint one tile a
    # unique colour and check it lands in the file the engine will request.
    img = Image.new("RGB", (8, 8), (0, 0, 0))
    for x in range(4, 8):
        for y in range(0, 4):
            img.putpixel((x, y), (255, 0, 0))   # column 1, row 0
    src = tmp_path / "map.png"
    img.save(src)
    res_out = tmp_path / "res"
    slice_tiles(src, res_out, tile=4, count=2)
    with Image.open(res_out / "tiles" / MAP_ID / f"{MAP_ID}_01_00.webp") as t:
        assert t.convert("RGB").getpixel((1, 1)) == (255, 0, 0)
    with Image.open(res_out / "tiles" / MAP_ID / f"{MAP_ID}_00_00.webp") as t:
        assert t.convert("RGB").getpixel((1, 1)) == (0, 0, 0)


def test_convert_icons_copies_every_map_icon(tmp_path):
    from vrising.maps.tiles import convert_icons

    src = tmp_path / "Texture2D"
    src.mkdir(parents=True)
    for name in ("MapIcon_Player", "MapIcon_CavePassage", "MiniMapMask", "NotAnIcon"):
        Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(src / f"{name}.png")
    res_out = tmp_path / "res"
    written = convert_icons(tmp_path, res_out)
    names = sorted(p.stem for p in (res_out / "icons").iterdir())
    assert names == ["MapIcon_CavePassage", "MapIcon_Player", "MiniMapMask"]
    assert written == 3
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_tiles.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.tiles'`.

- [ ] **Step 3: Write `apps/vrising/maps/tiles.py`**

```python
"""Tiles stage: the single 6080x6080 world map into a WebP tile grid, plus the
``MapIcon_*`` sprites the marker pins use.

Convention is palworld's, unchanged (``tools/apps/palworld/maps/tiles.py``):
ONE native zoom level, tiles at ``<res>/tiles/<MapId>/<MapId>_<xx>_<yy>.webp``
with zero-padded 2-digit ``col_row`` indices, ``(0,0)`` top-left, ``y`` down.
``GameMapTiles`` pins ``minNativeZoom = maxNativeZoom = 0`` and Leaflet scales
for zoom, so there is deliberately no ``{z}/{x}/{y}`` pyramid.

Tile size: 6080 is not divisible by 1024, so this map uses 1216 x 5 = 6080
exactly. Non-1024 tile sizes are established (aion2's Abyss_Battlefield_A ships
1020). Padding to 6144 is rejected on purpose — it would put a fudge factor into
``worldBounds`` and every marker would inherit the error.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from .extract import WORLD_MAP

Image.MAX_IMAGE_PIXELS = None  # the source map is 6080x6080 (~37 MPx)

MAP_ID = "Vardoran"
MAP_SIZE = 6080
TILE = 1216
COUNT = 5
# Marker-pin sources: every sprite whose stem starts with one of these. The
# whole set is converted even though types.yaml references only a couple, so a
# later taxonomy addition needs no resource re-run.
ICON_PREFIXES = ("MapIcon_", "MiniMapMask")
# A preview render of the whole map, handy for calibration review and for a
# future site card. Long edge in px.
PREVIEW_EDGE = 1520


def tile_grid(size: int, tile: int = TILE) -> tuple[int, int]:
    """``(tile, count)`` for a square map of ``size`` px.

    Raises when ``tile`` does not divide ``size``: a partial edge tile would
    make the pixel grid disagree with ``tileWidth * tilesCountX``, which is the
    denominator of the world->pixel transform.
    """
    if size % tile:
        raise ValueError(
            f"map size {size} is not divisible by tile size {tile}; pick a divisor "
            f"(6080 = 1216x5 = 760x8 = 1520x4) instead of padding the image"
        )
    return tile, size // tile


def _save_webp(img: Image.Image, dest: Path) -> None:
    img.save(dest, "WEBP", quality=90, method=6)


def slice_tiles(src: Path, res_out: Path, tile: int = TILE, count: int = COUNT) -> int:
    """Slice ``src`` into ``count`` x ``count`` ``tile``-px WebP tiles. Returns the count."""
    src, res_out = Path(src), Path(res_out)
    out_dir = res_out / "tiles" / MAP_ID
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    with Image.open(src) as img:
        img = img.convert("RGBA")
        for x in range(count):
            for y in range(count):
                box = (x * tile, y * tile, (x + 1) * tile, (y + 1) * tile)
                _save_webp(img.crop(box), out_dir / f"{MAP_ID}_{x:02d}_{y:02d}.webp")
                written += 1
    return written


def write_preview(src: Path, res_out: Path) -> None:
    """A downscaled whole-map WebP (``preview/Vardoran.webp``) for review."""
    src, res_out = Path(src), Path(res_out)
    out = res_out / "preview"
    out.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        scale = PREVIEW_EDGE / max(img.size)
        small = img.convert("RGB").resize(
            (round(img.width * scale), round(img.height * scale)), Image.LANCZOS
        )
        _save_webp(small, out / f"{MAP_ID}.webp")


def convert_icons(raw: Path, res_out: Path) -> int:
    """Convert every map-icon sprite to ``<res>/icons/<stem>.webp``. Returns the count."""
    raw, res_out = Path(raw), Path(res_out)
    icon_dir = res_out / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for src in sorted((raw / "Texture2D").glob("*.png")):
        if not src.stem.startswith(ICON_PREFIXES):
            continue
        with Image.open(src) as im:
            _save_webp(im.convert("RGBA"), icon_dir / f"{src.stem}.webp")
        written += 1
    return written


def run_tiles(raw: Path, data_out: Path, res_out: Path) -> None:
    """Full resource build. ``data_out`` is unused today (no data-driven icon
    list — the whole MapIcon set is converted) but kept in the signature so the
    stage matches the other pipelines' shape."""
    raw, res_out = Path(raw), Path(res_out)
    src = raw / WORLD_MAP
    with Image.open(src) as img:
        if img.width != img.height:
            raise RuntimeError(f"world map is {img.width}x{img.height}, expected a square image")
        tile, count = tile_grid(img.width)
    n = slice_tiles(src, res_out, tile=tile, count=count)
    print(f"tiles: {MAP_ID} {n} tiles of {tile}px ({tile * count}x{tile * count})")
    write_preview(src, res_out)
    print(f"tiles: preview {PREVIEW_EDGE}px")
    icons = convert_icons(raw, res_out)
    print(f"icons: {icons} converted")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_tiles.py -q`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the stage against the real export**

Run: `cd .claude/worktrees/vrising-app/tools && uv run python -m vrising.maps tiles`

Expected:

```
tiles: Vardoran 25 tiles of 1216px (6080x6080)
tiles: preview 1520px
icons: 13 converted
version: <12 hex chars>
```

The icon count should be around 13 (Player, ClanMember, Trader, Coffin01, GatewayUnlocked, DroppedLoot, CavePassage, the SoulShard variants, PlayerCastle, PlayerCastle_Tier5, MiniMapMask). An icon count of 0 means the sprites were not part of the export — re-run `unex export` before continuing, because Task 9's taxonomy references two of them.

- [ ] **Step 6: Verify the artifact on disk**

```bash
ls E:/arkive-games/resource-vrising/tiles/Vardoran | head -3
ls E:/arkive-games/resource-vrising/tiles/Vardoran | wc -l
du -sh E:/arkive-games/resource-vrising/tiles
```
Expected: `Vardoran_00_00.webp`, `Vardoran_00_01.webp`, `Vardoran_00_02.webp`; `25`; a total in the low tens of MB.

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/maps/tiles.py tools/apps/vrising/tests/test_tiles.py
git commit -m "feat(vrising): slice the 6080px world map into a 5x5 1216px tile grid and convert map icons"
```

---

## Task 7: World↔pixel transform module

**Files:**
- Create: `tools/apps/vrising/maps/transform.py`
- Test: `tools/apps/vrising/tests/test_transform.py`

The transform is the same shape the whole platform already uses: a pure linear map from a world AABB onto the full pixel grid, with an axis choice (`pxAxis`) and two flips. `@gamemap/data-contract` can express exactly this and nothing more (`MapOrientation` = `{pxAxis, flipX, flipY}`), and the frontend's `worldToPixel()` in `packages/map-engine/src/coords.ts` is its mirror image. **A rotation cannot be expressed** — if Task 8's search finds one, the rotation must be baked into the tile slicing instead (see Task 8, Step 8).

- [ ] **Step 1: Write the failing test**

```python
from __future__ import annotations

import pytest

from vrising.maps.transform import (
    Orientation,
    make_inverse_transform,
    make_transform,
    translate_bounds_by_pixels,
)

BOUNDS = {"min": [-2850.0, -2297.5], "max": [190.0, 742.5]}
SIZE = 6080.0


def test_identity_orientation_maps_min_to_origin_and_max_to_the_far_corner():
    t = make_transform(BOUNDS, Orientation("X", False, False), SIZE, SIZE)
    assert t(-2850.0, -2297.5) == pytest.approx((0.0, 0.0))
    assert t(190.0, 742.5) == pytest.approx((6080.0, 6080.0))


def test_flip_y_mirrors_the_vertical_axis():
    t = make_transform(BOUNDS, Orientation("X", False, True), SIZE, SIZE)
    assert t(-2850.0, -2297.5) == pytest.approx((0.0, 6080.0))
    assert t(-2850.0, 742.5) == pytest.approx((0.0, 0.0))


def test_px_axis_y_swaps_which_world_axis_drives_pixel_x():
    t = make_transform(BOUNDS, Orientation("Y", False, False), SIZE, SIZE)
    # world y drives pixel x, world x drives pixel y
    assert t(-2850.0, 742.5) == pytest.approx((6080.0, 0.0))


def test_inverse_round_trips_every_orientation():
    for px_axis in ("X", "Y"):
        for flip_x in (False, True):
            for flip_y in (False, True):
                o = Orientation(px_axis, flip_x, flip_y)
                t = make_transform(BOUNDS, o, SIZE, SIZE)
                inv = make_inverse_transform(BOUNDS, o, SIZE, SIZE)
                for wx, wy in ((-2000.0, -1000.0), (0.0, 500.0), (-2850.0, -2297.5)):
                    px, py = t(wx, wy)
                    assert inv(px, py) == pytest.approx((wx, wy)), o


def test_translate_bounds_by_pixels_moves_content_the_requested_way():
    """Shifting bounds so the rendered content moves +dpx/+dpy on the canvas.

    This is the operation the offset search needs: it finds a pixel shift and
    must convert it back into a worldBounds change without hand-deriving signs
    per orientation.
    """
    o = Orientation("X", False, False)
    moved = translate_bounds_by_pixels(BOUNDS, o, SIZE, SIZE, 152.0, -76.0)
    t0 = make_transform(BOUNDS, o, SIZE, SIZE)
    t1 = make_transform(moved, o, SIZE, SIZE)
    p0 = t0(-2000.0, -1000.0)
    p1 = t1(-2000.0, -1000.0)
    assert (p1[0] - p0[0], p1[1] - p0[1]) == pytest.approx((152.0, -76.0))


def test_translate_bounds_by_pixels_is_correct_under_a_swapped_flipped_orientation():
    o = Orientation("Y", True, True)
    moved = translate_bounds_by_pixels(BOUNDS, o, SIZE, SIZE, -40.0, 25.0)
    t0 = make_transform(BOUNDS, o, SIZE, SIZE)
    t1 = make_transform(moved, o, SIZE, SIZE)
    p0 = t0(-1500.0, -800.0)
    p1 = t1(-1500.0, -800.0)
    assert (p1[0] - p0[0], p1[1] - p0[1]) == pytest.approx((-40.0, 25.0))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_transform.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.transform'`.

- [ ] **Step 3: Write `apps/vrising/maps/transform.py`**

```python
"""World<->pixel coordinate transform for the Vardoran map.

Same shape as palworld's (``tools/apps/palworld/maps/transform.py``) and as the
frontend's ``worldToPixel`` in ``packages/map-engine/src/coords.ts``: a pure
linear map from a world AABB onto the full pixel grid, with an axis choice and
two flips. That is exactly what ``@gamemap/data-contract``'s ``MapOrientation``
can carry — no rotation, no shear. Keep the three implementations in agreement:
the pipeline emits the bounds, the contract transports them, the engine replays
the transform on every marker.

Coordinates here are positional ``(x, y)`` floats rather than palworld's
``{"X": …, "Y": …}`` dicts because V Rising's source values are ``float2``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

Bounds = dict  # {"min": [x, y], "max": [x, y]}


@dataclass(frozen=True)
class Orientation:
    px_axis: str  # "X" or "Y": which world coordinate drives pixel-x
    flip_x: bool
    flip_y: bool

    def as_json(self) -> dict:
        return {"pxAxis": self.px_axis, "flipX": self.flip_x, "flipY": self.flip_y}


ALL_ORIENTATIONS: list[Orientation] = [
    Orientation(px_axis, flip_x, flip_y)
    for px_axis in ("X", "Y")
    for flip_x in (False, True)
    for flip_y in (False, True)
]


def _axes(o: Orientation) -> tuple[int, int]:
    """Indices into ``[x, y]`` for (the axis driving pixel-x, the one driving pixel-y)."""
    return (0, 1) if o.px_axis == "X" else (1, 0)


def make_transform(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float
) -> Callable[[float, float], tuple[float, float]]:
    """World ``(x, y)`` -> pixel ``(px, py)``, pixel row 0 at the top."""
    mn, mx = bounds["min"], bounds["max"]
    ix, iy = _axes(o)

    def to_pixel(wx: float, wy: float) -> tuple[float, float]:
        world = (wx, wy)
        px = (world[ix] - mn[ix]) / (mx[ix] - mn[ix]) * pixel_w
        py = (world[iy] - mn[iy]) / (mx[iy] - mn[iy]) * pixel_h
        if o.flip_x:
            px = pixel_w - px
        if o.flip_y:
            py = pixel_h - py
        return px, py

    return to_pixel


def make_inverse_transform(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float
) -> Callable[[float, float], tuple[float, float]]:
    """Pixel ``(px, py)`` -> world ``(x, y)``. Exact inverse of :func:`make_transform`."""
    mn, mx = bounds["min"], bounds["max"]
    ix, iy = _axes(o)

    def to_world(px: float, py: float) -> tuple[float, float]:
        fx, fy = px, py
        if o.flip_x:
            fx = pixel_w - fx
        if o.flip_y:
            fy = pixel_h - fy
        world = [0.0, 0.0]
        world[ix] = fx / pixel_w * (mx[ix] - mn[ix]) + mn[ix]
        world[iy] = fy / pixel_h * (mx[iy] - mn[iy]) + mn[iy]
        return world[0], world[1]

    return to_world


def translate_bounds_by_pixels(
    bounds: Bounds, o: Orientation, pixel_w: float, pixel_h: float, dpx: float, dpy: float
) -> Bounds:
    """Bounds whose rendered content sits ``(dpx, dpy)`` px further along.

    The offset search finds a shift in PIXELS and has to express it as a change
    to ``worldBounds``. Deriving the signs by hand per orientation is exactly the
    kind of thing that produces a mirrored map, so instead measure the world
    displacement of that pixel delta with the inverse transform and subtract it:
    moving the window back moves the content forward.
    """
    inv = make_inverse_transform(bounds, o, pixel_w, pixel_h)
    w0 = inv(0.0, 0.0)
    w1 = inv(dpx, dpy)
    dwx, dwy = w1[0] - w0[0], w1[1] - w0[1]
    mn, mx = bounds["min"], bounds["max"]
    return {
        "min": [mn[0] - dwx, mn[1] - dwy],
        "max": [mx[0] - dwx, mx[1] - dwy],
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_transform.py -q`
Expected: PASS, 6 tests.

- [ ] **Step 5: Cross-check the Python transform against the TypeScript one**

They must agree exactly or markers land in the wrong place. Compare the two implementations side by side:

```bash
cd .claude/worktrees/vrising-app
sed -n '/export function worldToPixel/,/^}/p' frontend/packages/map-engine/src/coords.ts
```
Expected: the TS body normalizes with `(world[pxAxis] - min[pxAxis]) / (max[pxAxis] - min[pxAxis]) * W`, then applies `flipX`/`flipY` as `W - px` / `H - py` — identical to `make_transform` above. If they differ, the Python side is wrong; the engine is the shipped authority.

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/maps/transform.py tools/apps/vrising/tests/test_transform.py
git commit -m "feat(vrising): world-to-pixel transform mirroring the map-engine contract"
```

---

## Task 8: Coordinate calibration — derive and VERIFY the transform

**Files:**
- Create: `tools/apps/vrising/maps/calibrate.py`
- Create: `tools/apps/vrising/maps/calibration.py`
- Test: `tools/apps/vrising/tests/test_calibrate.py`

This is the task the whole plan hinges on. **The world→pixel transform for this map is not known.** aion2 reads an explicit `WorldBoundBox` from `Data/WorldMap/<Map>.json`; V Rising ships no such file that anyone has identified. What we do have is unusually good lever:

- The map image is **6080 × 6080**, and the mask rasters are **0.5 world units per pixel** (verified 372 times over in Task 5). If the map image shares that scale — the obvious hypothesis, since the masks are drawn to be composited onto it — then the world span of the image is exactly **3040 × 3040 world units**, and the *scale is not a free parameter*. Only the **offset** (2 unknowns) and the **orientation** (8 discrete candidates) remain, plus the mask raster's own row order (2 more) if Task 5's `direct/swapped` check left it open.
- The 372 region AABBs are themselves georeferenced, and their masks are filled silhouettes. Composite them and you get a synthetic picture of where the landmass is. Correlate that against where the landmass actually is in the map image, and the offset falls out.

**Why correlation is the right search and not a hack:** with the scale fixed, candidate offsets differ by pure translation, so the composited coverage area `A` and the map's land area `B` are both constant. `IoU = I / (A + B − I)` is therefore strictly monotonic in the intersection `I`, so **the offset that maximises cross-correlation is exactly the offset that maximises IoU** — and an FFT gives every offset at once. 16 candidates × one FFT each, instead of a nested loop over thousands of offsets.

**Seed estimate** (used as the correlation's starting window; the search then finds the true shift): centre the region-AABB union inside the 3040-unit box. The measured union is x `[-2623, -37]` (span 2586), y `[-1923, 368]` (span 2291), so midpoints are x `-1330`, y `-777.5` and the seed bounds are `min = [-2850, -2297.5]`, `max = [190, 742.5]`. The ~450 × 750 unit of slack is consistent with the map's decorative parchment border, which is a good sign rather than a discrepancy.

- [ ] **Step 1: Write the failing test — offset recovery on a synthetic scene**

No game files. The fixture plants three known boxes at a known offset and asserts the search recovers both the offset and the orientation.

```python
from __future__ import annotations

import numpy as np
import pytest

from vrising.maps.calibrate import (
    best_candidate,
    composite_coverage,
    find_shift,
    iou,
    land_mask_from_flood,
)
from vrising.maps.transform import Orientation


def _boxes():
    """Three region entries in world units, 0.5 units per mask pixel."""
    return [
        {"id": "a", "min": [10.0, 10.0], "max": [30.0, 20.0], "maskSize": [40, 20]},
        {"id": "b", "min": [40.0, 30.0], "max": [70.0, 50.0], "maskSize": [60, 40]},
        {"id": "c", "min": [15.0, 55.0], "max": [25.0, 75.0], "maskSize": [20, 40]},
    ]


def _masks(boxes):
    """Fully-filled silhouettes, one per entry."""
    return {b["id"]: np.ones((b["maskSize"][1], b["maskSize"][0]), dtype=bool) for b in boxes}


def test_iou_is_one_for_identical_masks():
    m = np.zeros((8, 8), dtype=bool)
    m[2:6, 2:6] = True
    assert iou(m, m) == pytest.approx(1.0)


def test_iou_is_zero_for_disjoint_masks():
    a = np.zeros((8, 8), dtype=bool)
    b = np.zeros((8, 8), dtype=bool)
    a[0:2, 0:2] = True
    b[6:8, 6:8] = True
    assert iou(a, b) == 0.0


def test_composite_coverage_paints_every_box():
    boxes = _boxes()
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    cov = composite_coverage(boxes, _masks(boxes), bounds, Orientation("X", False, False),
                             100, 100, mask_rows_down=True)
    assert cov.shape == (100, 100)
    # 20x10 + 30x20 + 10x20 world units at 1 px per unit here.
    assert cov.sum() == pytest.approx(200 + 600 + 200, rel=0.05)


def test_find_shift_recovers_a_known_translation():
    boxes = _boxes()
    masks = _masks(boxes)
    o = Orientation("X", False, False)
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    truth = composite_coverage(boxes, masks, bounds, o, 100, 100, mask_rows_down=True)
    # Shift the "land" by (+12, -7) px and check the search finds it back.
    land = np.zeros_like(truth)
    land[0:93, 12:100] = truth[7:100, 0:88]
    dpx, dpy, score = find_shift(truth, land)
    assert (dpx, dpy) == (12, -7)
    assert score > 0


def test_best_candidate_picks_the_right_orientation_and_reports_a_margin():
    boxes = _boxes()
    masks = _masks(boxes)
    o = Orientation("Y", False, True)
    seed = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    land = composite_coverage(boxes, masks, seed, o, 100, 100, mask_rows_down=True)
    result = best_candidate(boxes, masks, land, seed, 100, 100)
    assert result["orientation"] == o
    assert result["iou"] > 0.95
    assert result["margin"] > 0.0
    assert result["shift"] == (0, 0)


def test_land_mask_from_flood_clears_an_edge_connected_border():
    img = np.zeros((10, 10, 3), dtype=np.uint8)   # black frame colour
    img[2:8, 2:8] = (200, 180, 140)               # parchment interior
    land, fraction = land_mask_from_flood(img, tol=30)
    assert land[5, 5]
    assert not land[0, 0]
    assert fraction == pytest.approx(36 / 100)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_calibrate.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.calibrate'`.

- [ ] **Step 3: Write `apps/vrising/maps/calibrate.py`**

```python
"""Calibrate stage: derive AND verify the world->pixel transform.

The problem: the map image is 6080x6080 and the 372 region AABBs are in world
units, but nothing in the game files (as far as anyone has found) states how the
two relate. aion2 reads an explicit ``WorldBoundBox``; V Rising has no
equivalent identified.

The leverage: the mask rasters are 0.5 world units per pixel (verified 372/372 in
the extract stage). If the map image shares that scale, its world span is exactly
6080 * 0.5 = 3040 units on each axis, so the SCALE IS NOT FREE. That leaves the
offset (2 continuous unknowns), the orientation (8 discrete candidates) and the
mask raster's row order (2 more).

The method: composite all 372 silhouettes into a synthetic coverage image per
candidate, extract the map's own land mask from the image, and cross-correlate.
Because candidates differ by pure TRANSLATION, coverage area and land area are
both constant, so IoU = I / (A + B - I) is strictly monotonic in the intersection
I — maximising correlation therefore maximises IoU exactly, and one FFT yields
every offset at once.

Output: a printed candidate table plus overlay renders for human review. The
accepted result is copied by hand into ``calibration.py``; this module never
writes it, so a rerun can never silently move every marker on the map.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.signal import fftconvolve

from ..common import write_json
from .extract import load_mask, read_parsed
from .transform import (
    ALL_ORIENTATIONS,
    Orientation,
    make_transform,
    translate_bounds_by_pixels,
)

Image.MAX_IMAGE_PIXELS = None

# Verified mask scale; fixes the map's world span at MAP_PX * UNITS_PER_PIXEL.
UNITS_PER_PIXEL = 0.5
# The search runs at 1/8 scale (6080 -> 760): plenty for a coastline-sized
# signal, and it keeps each FFT well under a second.
SEARCH_DIV = 8
# Colour distance (Manhattan, 0..765) from the corner pixel below which a pixel
# counts as "frame/void" for the edge-connected flood fill.
FLOOD_TOL = 60
# A land fraction outside this range means the flood fill did not find the
# coastline; fall back to the gradient method (see land_mask_from_gradient).
LAND_FRACTION_RANGE = (0.35, 0.95)
# Acceptance thresholds (see the plan's acceptance criterion).
MIN_IOU = 0.75
MIN_MARGIN = 0.10
# Scale sweep used only when no candidate clears MIN_IOU at 0.5 u/px.
SCALE_SWEEP = [round(0.40 + 0.005 * i, 3) for i in range(41)]


def iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = int(np.count_nonzero(a & b))
    union = int(np.count_nonzero(a | b))
    return inter / union if union else 0.0


def land_mask_from_flood(rgb: np.ndarray, tol: int = FLOOD_TOL) -> tuple[np.ndarray, float]:
    """The map's landmass, by clearing the edge-connected frame/void.

    Same idea as palworld's ``_clear_void``: take the corner colour, find every
    pixel within ``tol`` of it, keep the connected components that touch an image
    edge, and call the complement land. Returns ``(land, land_fraction)``.
    """
    border = rgb[0, 0, :3].astype(np.int16)
    dist = np.abs(rgb[:, :, :3].astype(np.int16) - border).sum(axis=2)
    close = dist <= tol
    labels, _ = ndimage.label(close)
    edge = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    edge = edge[edge != 0]
    void = np.isin(labels, edge)
    land = ~void
    return land, float(np.count_nonzero(land)) / land.size


def land_mask_from_gradient(rgb: np.ndarray, thresh: int = 18) -> tuple[np.ndarray, float]:
    """Fallback land mask: where the map has drawn detail.

    Used when the flood fill's land fraction is implausible (a decorative border
    whose colour is close to the interior parchment defeats the flood). Sobel
    magnitude -> threshold -> close -> fill -> largest component.
    """
    grey = rgb[:, :, :3].mean(axis=2)
    gx = ndimage.sobel(grey, axis=1)
    gy = ndimage.sobel(grey, axis=0)
    edges = np.hypot(gx, gy) > thresh
    closed = ndimage.binary_closing(edges, structure=np.ones((9, 9)))
    filled = ndimage.binary_fill_holes(closed)
    labels, n = ndimage.label(filled)
    if n:
        sizes = ndimage.sum(filled, labels, range(1, n + 1))
        filled = labels == (int(np.argmax(sizes)) + 1)
    return filled, float(np.count_nonzero(filled)) / filled.size


def composite_coverage(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    bounds: dict,
    o: Orientation,
    width: int,
    height: int,
    mask_rows_down: bool,
) -> np.ndarray:
    """Union of every region silhouette, painted at ``width`` x ``height``.

    Each mask is placed by transforming its world AABB corners through ``o``,
    then resampling the silhouette into the resulting pixel rectangle.
    ``mask_rows_down`` selects the mask raster's own row order: True means mask
    row 0 corresponds to the box's MAX world-y edge (image-style, y down).
    """
    canvas = np.zeros((height, width), dtype=bool)
    t = make_transform(bounds, o, width, height)
    for e in entries:
        mask = masks.get(e["id"])
        if mask is None:
            continue
        if not mask_rows_down:
            mask = mask[::-1, :]
        (x0, y0) = t(e["min"][0], e["min"][1])
        (x1, y1) = t(e["max"][0], e["max"][1])
        left, right = sorted((x0, x1))
        top, bottom = sorted((y0, y1))
        w = int(round(right - left))
        h = int(round(bottom - top))
        if w < 1 or h < 1:
            continue
        # A swapped pxAxis means the mask's own axes swap with it.
        src = mask.T if o.px_axis == "Y" else mask
        small = np.array(
            Image.fromarray(src.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)
        ) >= 128
        li, ti = int(round(left)), int(round(top))
        # Clip to the canvas (a candidate offset can push a box off the edge).
        sl = max(0, -li)
        st = max(0, -ti)
        el = min(w, width - li)
        et = min(h, height - ti)
        if el <= sl or et <= st:
            continue
        canvas[ti + st: ti + et, li + sl: li + el] |= small[st:et, sl:el]
    return canvas


def find_shift(coverage: np.ndarray, land: np.ndarray) -> tuple[int, int, float]:
    """Pixel shift ``(dpx, dpy)`` maximising the overlap of coverage with land.

    Cross-correlation via FFT: every candidate offset is evaluated at once.
    Because the two areas are translation-invariant, argmax of the correlation is
    argmax of IoU (union = A + B - I).
    """
    a = coverage.astype(np.float32)
    b = land.astype(np.float32)
    corr = fftconvolve(b, a[::-1, ::-1], mode="same")
    idx = int(np.argmax(corr))
    cy, cx = np.unravel_index(idx, corr.shape)
    dpy = int(cy) - corr.shape[0] // 2
    dpx = int(cx) - corr.shape[1] // 2
    return dpx, dpy, float(corr[cy, cx])


def best_candidate(
    entries: list[dict],
    masks: dict[str, np.ndarray],
    land: np.ndarray,
    seed_bounds: dict,
    width: int,
    height: int,
) -> dict:
    """Evaluate all 16 candidates (8 orientations x 2 mask row orders).

    Returns the winner plus the IoU margin over the runner-up — the margin is
    half the acceptance criterion, because a transform that is only marginally
    better than its own mirror image has not actually been determined.
    """
    rows: list[dict] = []
    for o in ALL_ORIENTATIONS:
        for rows_down in (True, False):
            cov = composite_coverage(entries, masks, seed_bounds, o, width, height, rows_down)
            dpx, dpy, _ = find_shift(cov, land)
            shifted = translate_bounds_by_pixels(seed_bounds, o, width, height, dpx, dpy)
            cov2 = composite_coverage(entries, masks, shifted, o, width, height, rows_down)
            rows.append({
                "orientation": o,
                "maskRowsDown": rows_down,
                "shift": (dpx, dpy),
                "bounds": shifted,
                "iou": iou(cov2, land),
            })
    rows.sort(key=lambda r: r["iou"], reverse=True)
    winner = dict(rows[0])
    winner["margin"] = rows[0]["iou"] - (rows[1]["iou"] if len(rows) > 1 else 0.0)
    winner["table"] = rows
    return winner


def _overlay(base: Image.Image, coverage: np.ndarray, entries, bounds, o, size, rows_down) -> Image.Image:
    """The base map with the composited silhouettes in translucent red and every
    AABB outlined — the render a human actually judges."""
    img = base.convert("RGB").copy()
    tint = np.array(img, dtype=np.float32)
    tint[coverage] = tint[coverage] * 0.55 + np.array([214.0, 64.0, 74.0]) * 0.45
    img = Image.fromarray(tint.astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    t = make_transform(bounds, o, size, size)
    for e in entries:
        x0, y0 = t(e["min"][0], e["min"][1])
        x1, y1 = t(e["max"][0], e["max"][1])
        draw.rectangle(
            [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)],
            outline=(216, 180, 94),
        )
    return img


def run_calibrate(raw: Path, parsed_dir: Path) -> None:
    """Search, report and render. Writes NOTHING that the pipeline consumes —
    the accepted numbers are copied into ``calibration.py`` by a human."""
    raw, parsed_dir = Path(raw), Path(parsed_dir)
    parsed = read_parsed(parsed_dir)
    entries = parsed["entries"]
    map_px = int(parsed["mapSize"][0])
    size = map_px // SEARCH_DIV

    with Image.open(raw / parsed["mapImage"]) as im:
        base = im.convert("RGB").resize((size, size), Image.LANCZOS)
    rgb = np.array(base)

    land, fraction = land_mask_from_flood(rgb)
    method = "flood"
    if not (LAND_FRACTION_RANGE[0] <= fraction <= LAND_FRACTION_RANGE[1]):
        print(f"calibrate: flood land fraction {fraction:.3f} implausible — using the gradient mask")
        land, fraction = land_mask_from_gradient(rgb)
        method = "gradient"
    print(f"calibrate: land mask via {method}, fraction {fraction:.3f}")

    masks: dict[str, np.ndarray] = {}
    for e in entries:
        masks[e["id"]] = load_mask(raw / e["mask"])

    span = map_px * UNITS_PER_PIXEL
    union = parsed["unionBounds"]
    mid_x = (union["min"][0] + union["max"][0]) / 2
    mid_y = (union["min"][1] + union["max"][1]) / 2
    seed = {
        "min": [mid_x - span / 2, mid_y - span / 2],
        "max": [mid_x + span / 2, mid_y + span / 2],
    }
    print(f"calibrate: seed bounds min={seed['min']} max={seed['max']} (span {span:.0f} world units)")

    result = best_candidate(entries, masks, land, seed, size, size)

    print("calibrate: candidates (best first)")
    for r in result["table"][:6]:
        o = r["orientation"]
        print(
            f"  IoU {r['iou']:.4f}  pxAxis={o.px_axis} flipX={int(o.flip_x)} flipY={int(o.flip_y)} "
            f"maskRowsDown={int(r['maskRowsDown'])} shift={r['shift']}"
        )
    o = result["orientation"]
    print(f"calibrate: BEST IoU {result['iou']:.4f}, margin {result['margin']:.4f}")
    print(f"calibrate: bounds min={[round(v, 2) for v in result['bounds']['min']]} "
          f"max={[round(v, 2) for v in result['bounds']['max']]}")
    accepted = result["iou"] >= MIN_IOU and result["margin"] >= MIN_MARGIN
    print(f"calibrate: ACCEPTED={accepted} (need IoU>={MIN_IOU}, margin>={MIN_MARGIN})")

    out_dir = parsed_dir.parent / "calibration"
    out_dir.mkdir(parents=True, exist_ok=True)
    for rank, r in enumerate(result["table"][:2]):
        cov = composite_coverage(
            entries, masks, r["bounds"], r["orientation"], size, size, r["maskRowsDown"]
        )
        img = _overlay(base, cov, entries, r["bounds"], r["orientation"], size, r["maskRowsDown"])
        o2 = r["orientation"]
        name = (f"rank{rank}_iou{r['iou']:.3f}_px{o2.px_axis}"
                f"_fx{int(o2.flip_x)}_fy{int(o2.flip_y)}_rd{int(r['maskRowsDown'])}.png")
        img.save(out_dir / name)
    write_json(out_dir / "result.json", {
        "accepted": accepted,
        "iou": result["iou"],
        "margin": result["margin"],
        "landMaskMethod": method,
        "landFraction": fraction,
        "unitsPerPixel": UNITS_PER_PIXEL,
        "mapSize": parsed["mapSize"],
        "orientation": result["orientation"].as_json(),
        "maskRowsDown": result["maskRowsDown"],
        "worldBounds": result["bounds"],
        "candidates": [
            {"iou": r["iou"], "orientation": r["orientation"].as_json(),
             "maskRowsDown": r["maskRowsDown"], "shift": list(r["shift"])}
            for r in result["table"]
        ],
    })
    print(f"calibrate: wrote {out_dir}")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_calibrate.py -q`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the search against the real map**

Run: `cd .claude/worktrees/vrising-app/tools && uv run python -m vrising.maps calibrate`

Expected output shape:

```
calibrate: land mask via flood, fraction 0.7xx
calibrate: seed bounds min=[-2850.0, -2297.5] max=[190.0, 742.5] (span 3040 world units)
calibrate: candidates (best first)
  IoU 0.8xxx  pxAxis=X flipX=0 flipY=0 maskRowsDown=1 shift=(…, …)
  IoU 0.6xxx  …
calibrate: BEST IoU 0.8xxx, margin 0.1xxx
calibrate: bounds min=[…, …] max=[…, …]
calibrate: ACCEPTED=True (need IoU>=0.75, margin>=0.1)
```

- [ ] **Step 6: Judge the acceptance criterion — this is a gate, not a formality**

The transform is **accepted** only when all three hold:

1. **`ACCEPTED=True`** in the run above — best IoU ≥ **0.75** and the margin over the runner-up ≥ **0.10**. The margin matters as much as the absolute number: a candidate that beats its own mirror by 0.01 has not been determined, it has been guessed.
2. **The overlay render looks right.** Open `tools/apps/vrising/calibration/rank0_*.png`. The red silhouettes must sit on the map's drawn features, not beside them. Judge three specific regions, chosen mechanically so the check is repeatable: the **largest-area** POI polygon, the **most eccentric** one (highest span-x/span-y ratio), and the one whose centre is **nearest a map corner**. Each must overlap its visibly-corresponding feature with no more than **30 px** of apparent offset at full resolution (≈4 px in the 760 px render). Corner and eccentric regions are included on purpose: a wrong flip or a swapped axis is nearly invisible near the centre and glaring at the edges.
3. **`rank1` is visibly wrong.** Open `rank1_*.png` too. If the runner-up also looks plausible, the search has not discriminated — treat criterion 1 as failed regardless of the numbers.

Record the numbers you observed; they go into `calibration.py`'s docstring in Step 7.

A later, stronger check becomes available for free once `unex` lands its `.entityheader` phase: the 229 subscene names include distinctive shapes (`Dunley_Mid02_Colosseum_Territory` is a ring, `Farbane_Mid11_Quarry_Territory` a quarry pit). When those names can be joined to `AccessID`s, replace the mechanical three-region check with named-landmark spot checks and re-verify.

- [ ] **Step 7: Write `apps/vrising/maps/calibration.py` with the accepted result**

The pipeline reads **this file**, never `calibration/result.json`. That is deliberate: a re-run of the search must never be able to silently move every marker on the map. Fill in the numbers from Step 5 and the observations from Step 6.

```python
"""The ACCEPTED world->pixel calibration for the Vardoran map.

Derived 2026-07-30 by ``python -m vrising.maps calibrate`` — see that module for
the method. The emit stage reads this file and nothing else; the search's own
``calibration/result.json`` is a review artifact, so re-running the search can
never silently move every marker on the map.

Provenance (fill in from the accepted run):
  scale        0.5 world units per pixel, giving a 3040-unit span over 6080 px.
               Verified 372/372 against the mask rasters in the extract stage,
               so the scale was NOT fitted — only the offset and orientation.
  method       composited region silhouettes vs. the map's land mask, offset by
               FFT cross-correlation (argmax correlation == argmax IoU under pure
               translation).
  IoU          <observed>            (acceptance threshold 0.75)
  margin       <observed>            (acceptance threshold 0.10 over runner-up)
  land mask    <flood|gradient>, land fraction <observed>
  eyeball      largest / most eccentric / nearest-corner region each within
               30 px of its drawn feature in rank0_*.png; rank1 visibly wrong.

CALIBRATION_METHOD is "fitted" when the automated search was accepted, and
"by-eye" when the fallback was used (see the plan, Task 8 Step 9). Downstream
code does not branch on it — it exists so the next reader knows how much to
trust these numbers.
"""

from __future__ import annotations

from .transform import Orientation

MAP_ID = "Vardoran"
MAP_PX = 6080
UNITS_PER_PIXEL = 0.5

CALIBRATION_METHOD = "fitted"
CALIBRATION_DATE = "2026-07-30"
CALIBRATION_IOU = 0.0  # <-- replace with the accepted IoU
CALIBRATION_MARGIN = 0.0  # <-- replace with the accepted margin

# World AABB that maps onto the FULL 6080x6080 pixel grid.
WORLD_BOUNDS = {
    "min": [0.0, 0.0],  # <-- replace with the accepted bounds
    "max": [0.0, 0.0],  # <-- replace with the accepted bounds
}

ORIENTATION = Orientation("X", False, False)  # <-- replace with the accepted orientation

# Mask raster row order: True means mask row 0 is the box's MAX world-y edge.
MASK_ROWS_DOWN = True


def world_bounds_json() -> dict:
    """``worldBounds`` in the shape ``@gamemap/data-contract`` expects."""
    return {
        "min": {"x": WORLD_BOUNDS["min"][0], "y": WORLD_BOUNDS["min"][1]},
        "max": {"x": WORLD_BOUNDS["max"][0], "y": WORLD_BOUNDS["max"][1]},
    }
```

- [ ] **Step 8: If the search found a ROTATION rather than an axis swap, stop and bake it into the tiles**

`@gamemap/data-contract`'s `MapOrientation` is axis-choice plus two flips — a **diagonal** transform. It cannot express a rotation by an arbitrary angle. If no axis/flip candidate clears the criterion but the overlay makes it obvious that the masks are rotated relative to the map art, do **not** extend the contract. Instead:

1. Rotate the source image in the tiles stage (`Image.rotate(angle, resample=Image.BICUBIC, expand=True)`), crop back to a square divisible by a tile size, and record the angle in `calibration.py`.
2. Re-run `extract` (the map size may change) and `calibrate` against the rotated image.
3. The emitted transform then stays diagonal and the engine needs no change.

This keeps the rotation in exactly one place — the pixels — instead of spreading it across the contract, the engine and three pipelines.

- [ ] **Step 9: If the criterion cannot be met at all, take the documented fallback**

In order:

1. **Sweep the scale.** The 0.5 u/px figure is verified for the *mask* rasters, not proven for the *map* image. Re-run the search over `SCALE_SWEEP` (0.40…0.60 in 0.005 steps → spans 2432…3648 units), taking the best (scale, orientation, offset) triple. Add a `--sweep-scale` flag to the stage rather than editing the constant.
2. **Ship a by-eye affine.** Open the overlay render, drag the numbers until the silhouettes line up, and record the result in `calibration.py` with `CALIBRATION_METHOD = "by-eye"`, the date, the shortfall (`CALIBRATION_IOU` as measured, even if below threshold), and a one-line note in the docstring saying which features were aligned. The frontend is entirely unaffected: `maps.json` simply carries whatever numbers this file holds, so a by-eye calibration ships a usable map and is trivially replaceable later.
3. **Never ship an unreviewed transform.** `CALIBRATION_METHOD` must be either `"fitted"` (criterion met) or `"by-eye"` (a human aligned it). There is no third state, and Task 10's emit stage asserts the field is one of the two.

- [ ] **Step 10: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/maps/calibrate.py tools/apps/vrising/maps/calibration.py \
        tools/apps/vrising/tests/test_calibrate.py
git commit -m "feat(vrising): derive and verify the world-to-pixel calibration from the region silhouettes"
```

---

## Task 9: Region mask vectorization

**Files:**
- Create: `tools/apps/vrising/maps/masks.py`
- Test: `tools/apps/vrising/tests/test_masks.py`

`RegionInstance.borders` is `number[][][]` — a list of closed rings of `[x, y]` **pixel** pairs. The game gives filled antialiased rasters, so rings are recovered by contour tracing (`cv2.findContours`) and simplified (`cv2.approxPolyDP`). Remember the asymmetry from the critical context: **regions are emitted in pixel space** (the pipeline applies the transform), while markers are emitted in raw world coordinates.

- [ ] **Step 1: Write the failing test**

```python
from __future__ import annotations

import numpy as np
import pytest

from vrising.maps.masks import mask_to_rings, ring_area, rings_to_pixels
from vrising.maps.transform import Orientation


def _square_mask(n=40, pad=8):
    m = np.zeros((n, n), dtype=bool)
    m[pad:n - pad, pad:n - pad] = True
    return m


def test_a_filled_square_becomes_one_four_point_ring():
    rings = mask_to_rings(_square_mask())
    assert len(rings) == 1
    # Closed ring: first point repeated at the end.
    assert rings[0][0] == rings[0][-1]
    assert len(rings[0]) == 5


def test_two_blobs_become_two_rings_largest_first():
    m = np.zeros((60, 60), dtype=bool)
    m[5:15, 5:15] = True     # 100 px
    m[30:55, 30:55] = True   # 625 px
    rings = mask_to_rings(m)
    assert len(rings) == 2
    assert ring_area(rings[0]) > ring_area(rings[1])


def test_specks_below_the_area_floor_are_dropped():
    m = np.zeros((60, 60), dtype=bool)
    m[30:55, 30:55] = True
    m[1, 1] = True           # 1 px speck
    rings = mask_to_rings(m, min_area_px=16)
    assert len(rings) == 1


def test_an_empty_mask_yields_no_rings():
    assert mask_to_rings(np.zeros((20, 20), dtype=bool)) == []


def test_simplification_reduces_a_circle_but_keeps_it_convex_and_closed():
    yy, xx = np.mgrid[0:120, 0:120]
    circle = ((yy - 60) ** 2 + (xx - 60) ** 2) < 50 ** 2
    rings = mask_to_rings(circle)
    assert len(rings) == 1
    ring = rings[0]
    assert 8 <= len(ring) <= 64          # far fewer points than the raw contour
    assert ring[0] == ring[-1]
    assert ring_area(ring) == pytest.approx(np.pi * 50 ** 2, rel=0.1)


def test_rings_to_pixels_places_a_mask_inside_its_world_box():
    """A ring in mask-raster coords maps into map-pixel coords via the entry's
    world AABB and the map transform."""
    entry = {"min": [0.0, 0.0], "max": [100.0, 100.0], "maskSize": [50, 50]}
    bounds = {"min": [0.0, 0.0], "max": [200.0, 200.0]}
    o = Orientation("X", False, False)
    # Mask ring covering the whole raster -> the box's full extent in world
    # units (0..100), which on a 200-unit map at 400 px is pixels 0..200.
    ring = [[0.0, 0.0], [50.0, 0.0], [50.0, 50.0], [0.0, 50.0], [0.0, 0.0]]
    out = rings_to_pixels([ring], entry, bounds, o, 400, 400, mask_rows_down=True)
    xs = [p[0] for p in out[0]]
    ys = [p[1] for p in out[0]]
    assert min(xs) == pytest.approx(0.0, abs=0.01)
    assert max(xs) == pytest.approx(200.0, abs=0.01)
    assert min(ys) == pytest.approx(200.0, abs=0.01)   # box sits at world y 0..100
    assert max(ys) == pytest.approx(400.0, abs=0.01)   # -> pixel y 200..400


def test_rings_to_pixels_honours_the_mask_row_order():
    entry = {"min": [0.0, 0.0], "max": [100.0, 100.0], "maskSize": [50, 50]}
    bounds = {"min": [0.0, 0.0], "max": [100.0, 100.0]}
    o = Orientation("X", False, False)
    ring = [[0.0, 0.0], [50.0, 0.0], [50.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
    down = rings_to_pixels([ring], entry, bounds, o, 100, 100, mask_rows_down=True)
    up = rings_to_pixels([ring], entry, bounds, o, 100, 100, mask_rows_down=False)
    # The same mask rows land on opposite halves of the box.
    assert max(p[1] for p in down[0]) < 50.0
    assert min(p[1] for p in up[0]) > 50.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_masks.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.masks'`.

- [ ] **Step 3: Write `apps/vrising/maps/masks.py`**

```python
"""Region silhouettes -> simplified polygon rings in map-pixel space.

The game ships no vertex data for regions: each of the 372 entries is a
rasterized filled silhouette with antialiased edges. So rings come from contour
tracing, then Douglas-Peucker simplification, then a two-step coordinate change
(mask raster -> world -> map pixels).

``RegionInstance.borders`` in ``@gamemap/data-contract`` is PIXEL space. Markers
are the other way round (raw world coordinates, projected by the engine) — that
asymmetry is the contract's, not this module's.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from ..common import round2, write_json
from .calibration import MASK_ROWS_DOWN, MAP_PX, ORIENTATION, WORLD_BOUNDS
from .extract import load_mask, read_parsed
from .transform import Orientation, make_transform

# Contour rings smaller than this are raster noise / antialiasing crumbs.
MIN_AREA_PX = 24
# Douglas-Peucker epsilon as a fraction of the ring's perimeter. 0.004 keeps
# coastline character while cutting a 2,000-point traced contour to a few dozen
# points — the frontend draws these as Leaflet polygons on every pan.
SIMPLIFY_EPS_FRACTION = 0.004
# Hard cap so one pathological silhouette cannot ship a 5,000-point polygon.
MAX_POINTS_PER_RING = 256


def ring_area(ring: list[list[float]]) -> float:
    """Absolute shoelace area of a closed ring."""
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def mask_to_rings(
    mask: np.ndarray,
    min_area_px: int = MIN_AREA_PX,
    eps_fraction: float = SIMPLIFY_EPS_FRACTION,
) -> list[list[list[float]]]:
    """Closed, simplified rings in MASK-RASTER coordinates, largest area first.

    Only outer contours are kept: a region with a hole is drawn as a filled
    outline anyway, and Leaflet polygon holes would need a ring-winding contract
    the data format does not define.
    """
    img = (mask.astype(np.uint8)) * 255
    contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rings: list[list[list[float]]] = []
    for c in contours:
        if cv2.contourArea(c) < min_area_px:
            continue
        eps = eps_fraction * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        if len(approx) < 3:
            continue
        pts = [[float(p[0][0]), float(p[0][1])] for p in approx]
        if len(pts) > MAX_POINTS_PER_RING:
            step = len(pts) / MAX_POINTS_PER_RING
            pts = [pts[int(i * step)] for i in range(MAX_POINTS_PER_RING)]
        pts.append([pts[0][0], pts[0][1]])  # close the ring
        rings.append(pts)
    rings.sort(key=ring_area, reverse=True)
    return rings


def rings_to_pixels(
    rings: list[list[list[float]]],
    entry: dict,
    bounds: dict,
    o: Orientation,
    width: int,
    height: int,
    mask_rows_down: bool,
) -> list[list[list[float]]]:
    """Mask-raster rings -> map-pixel rings, via the entry's world AABB.

    Mask column -> world x across ``[min.x, max.x]``. Mask row -> world y, from
    ``max.y`` downward when ``mask_rows_down`` (image-style), from ``min.y``
    upward otherwise. The map transform then takes world to pixels.
    """
    mw, mh = entry["maskSize"]
    mnx, mny = entry["min"]
    mxx, mxy = entry["max"]
    span_x = mxx - mnx
    span_y = mxy - mny
    t = make_transform(bounds, o, width, height)
    out: list[list[list[float]]] = []
    for ring in rings:
        pixels: list[list[float]] = []
        for col, row in ring:
            wx = mnx + (col / mw) * span_x
            wy = (mxy - (row / mh) * span_y) if mask_rows_down else (mny + (row / mh) * span_y)
            px, py = t(wx, wy)
            pixels.append([round2(px), round2(py)])
        out.append(pixels)
    return out


def build_regions(raw: Path, parsed: dict) -> list[dict]:
    """One ``RegionInstance``-shaped dict per entry that traced to a ring."""
    raw = Path(raw)
    o = ORIENTATION
    regions: list[dict] = []
    empty: list[str] = []
    total_points = 0
    for e in parsed["entries"]:
        mask = load_mask(raw / e["mask"])
        rings = mask_to_rings(mask)
        if not rings:
            empty.append(e["id"])
            continue
        borders = rings_to_pixels(rings, e, WORLD_BOUNDS, o, MAP_PX, MAP_PX, MASK_ROWS_DOWN)
        total_points += sum(len(r) for r in borders)
        a = e["accessId"]
        regions.append({
            "id": e["id"],
            # No region names exist in any reachable game file (localization is
            # keyed by bare GUID; the 229 real names live in .entityheader
            # subscene names, a later unex phase). Label by AccessID rather than
            # invent anything.
            "name": f"{'POI' if e['kind'] == 'poi' else 'Territory'} {a[0]}-{a[1]}-{a[2]}",
            "type": e["kind"],
            "borders": borders,
        })
    if empty:
        print(f"regions: WARNING {len(empty)} masks traced to nothing: {empty[:8]}")
    # Largest first so the frontend's smallest-containing-region lookup, which
    # sorts ascending, has a stable input.
    regions.sort(key=lambda r: sum(ring_area(ring) for ring in r["borders"]), reverse=True)
    print(f"regions: {len(regions)} polygons, {total_points} points "
          f"({total_points / max(1, len(regions)):.1f} per region)")
    return regions


def run_regions(raw: Path, parsed_dir: Path) -> None:
    parsed = read_parsed(parsed_dir)
    regions = build_regions(raw, parsed)
    write_json(Path(parsed_dir) / "regions.json", {"regions": regions})
    print(f"regions: wrote {Path(parsed_dir) / 'regions.json'}")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_masks.py -q`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the stage against the real masks**

Run: `cd .claude/worktrees/vrising-app/tools && uv run python -m vrising.maps regions`

Expected:

```
regions: 372 polygons, ~<8000-20000> points (~20-55 per region)
regions: wrote .../apps/vrising/parsed/regions.json
```

Read the diagnostics:
- **`372 polygons`** — every mask traced. A lower count with a `WARNING … traced to nothing` line means some masks are blank or below the area floor; inspect those PNGs before continuing.
- **Points per region** should land roughly in the 15–60 range. Much higher means `SIMPLIFY_EPS_FRACTION` is too small and the frontend will drop frames while panning; much lower (single digits) means it is too large and regions are collapsing to blobs.

- [ ] **Step 6: Sanity-check that the polygons are inside the pixel grid**

```bash
cd .claude/worktrees/vrising-app/tools && uv run python -c "
import json
d=json.load(open('apps/vrising/parsed/regions.json'))
pts=[p for r in d['regions'] for ring in r['borders'] for p in ring]
xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
print(f'x [{min(xs):.1f}..{max(xs):.1f}]  y [{min(ys):.1f}..{max(ys):.1f}]  n={len(pts)}')
print('inside 0..6080:', min(xs)>=-1 and min(ys)>=-1 and max(xs)<=6081 and max(ys)<=6081)
"
```
Expected: both ranges inside `0..6080` and `inside 0..6080: True`. A negative minimum or a maximum past 6080 means the calibration from Task 8 puts regions off the canvas — go back and re-check the accepted bounds, do not clamp here.

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/maps/masks.py tools/apps/vrising/tests/test_masks.py
git commit -m "feat(vrising): trace region silhouettes into simplified pixel polygons"
```

---

## Task 10: Emit stage — the contract-v1 dataset

**Files:**
- Create: `tools/apps/vrising/data_src/types.yaml`
- Create: `tools/apps/vrising/maps/emit.py`
- Test: `tools/apps/vrising/tests/test_emit.py`

Emits the layout `@gamemap/data-contract` validates: `maps.json`, `types.json`, `markers/<Map>.json`, `regions/<Map>.json`, and `locales/<lng>/{maps.json,types.json,markers/<Map>.json,regions/<Map>.json}` for every language. One marker per region, placed at its `CenterPosWS` in **raw world coordinates**.

- [ ] **Step 1: Write `apps/vrising/data_src/types.yaml`**

Hand-authored, exactly as palworld does it. Only two subtypes exist because only two kinds of georeferenced object are currently extractable — the remaining `MapIcon_*` sprites are already converted to WebP by Task 6 and are available the moment a real POI extraction lands. Category/subtype labels are our own UI taxonomy words, so translating them is correct; region *names* are never translated because they are not names.

```yaml
languages: ["en-US", "zh-CN", "zh-TW"]

map:
  id: Vardoran
  type: world
  names:
    en-US: Vardoran
    zh-CN: 瓦尔多兰
    zh-TW: 瓦爾多蘭

categories:
  - id: regions
    pinVariant: image
    names:
      en-US: Regions
      zh-CN: 区域
      zh-TW: 區域
    subtypes:
      - id: poi
        icon: MapIcon_CavePassage
        iconScale: 0.8
        defaultActive: true
        names:
          en-US: Point of interest
          zh-CN: 兴趣点
          zh-TW: 興趣點
        descriptions:
          en-US: A named area outline the game draws on the world map. Names are not yet recoverable from the game files, so each is labelled by its internal access id.
          zh-CN: 游戏在世界地图上绘制的区域轮廓。区域名称目前无法从游戏文件中还原，因此以内部访问 ID 标注。
          zh-TW: 遊戲在世界地圖上繪製的區域輪廓。區域名稱目前無法從遊戲檔案中還原，因此以內部存取 ID 標註。
      - id: territory
        icon: MapIcon_PlayerCastle
        iconScale: 0.8
        defaultActive: true
        names:
          en-US: Territory
          zh-CN: 领地
          zh-TW: 領地
        descriptions:
          en-US: A territory outline the game draws on the world map. Names are not yet recoverable from the game files, so each is labelled by its internal access id.
          zh-CN: 游戏在世界地图上绘制的领地轮廓。名称目前无法从游戏文件中还原，因此以内部访问 ID 标注。
          zh-TW: 遊戲在世界地圖上繪製的領地輪廓。名稱目前無法從遊戲檔案中還原，因此以內部存取 ID 標註。
```

- [ ] **Step 2: Write the failing test**

```python
from __future__ import annotations

import pytest

from vrising.maps.emit import build_dataset


def _parsed():
    return {
        "mapImage": "Texture2D/ZoneMap_Wilderness_VRisingWorld.png",
        "mapSize": [6080, 6080],
        "entries": [
            {"id": "poi_000", "kind": "poi", "index": 0, "accessId": [1, 2, 3],
             "center": [-500.0, -300.0], "min": [-550.0, -325.0], "max": [-450.0, -275.0],
             "aspect": [100.0, 50.0], "mask": "Texture2D/POIPolygon_0.png", "maskSize": [200, 100]},
            {"id": "terr_000", "kind": "territory", "index": 0, "accessId": [4, 5, 6],
             "center": [-900.0, -700.0], "min": [-950.0, -750.0], "max": [-850.0, -650.0],
             "aspect": [100.0, 100.0], "mask": "Texture2D/Territory_0.png", "maskSize": [200, 200]},
        ],
        "unionBounds": {"min": [-950.0, -750.0], "max": [-450.0, -275.0]},
    }


def _regions():
    return [
        {"id": "poi_000", "name": "POI 1-2-3", "type": "poi",
         "borders": [[[10.0, 10.0], [20.0, 10.0], [20.0, 20.0], [10.0, 10.0]]]},
        {"id": "terr_000", "name": "Territory 4-5-6", "type": "territory",
         "borders": [[[30.0, 30.0], [40.0, 30.0], [40.0, 40.0], [30.0, 30.0]]]},
    ]


def test_maps_json_carries_the_tile_grid_and_the_calibration():
    ds = build_dataset(_parsed(), _regions())
    (m,) = ds["maps"]
    assert m["id"] == "Vardoran"
    assert (m["tileWidth"], m["tileHeight"]) == (1216, 1216)
    assert (m["tilesCountX"], m["tilesCountY"]) == (5, 5)
    assert m["tileWidth"] * m["tilesCountX"] == 6080
    assert set(m["worldBounds"]) == {"min", "max"}
    assert set(m["orientation"]) == {"pxAxis", "flipX", "flipY"}
    assert m["isVisible"] is True


def test_markers_are_raw_world_coordinates_not_pixels():
    ds = build_dataset(_parsed(), _regions())
    markers = ds["markers"]["Vardoran"]
    poi = next(m for m in markers if m["id"] == "poi_000")
    # The entry's CenterPosWS, untransformed — the engine projects it.
    assert (poi["x"], poi["y"]) == (-500.0, -300.0)


def test_every_marker_has_the_contract_required_fields():
    ds = build_dataset(_parsed(), _regions())
    for m in ds["markers"]["Vardoran"]:
        assert isinstance(m["id"], str) and m["id"]
        assert m["subtype"] in {"poi", "territory"}
        assert m["images"] == []
        assert m["contributors"] == []
        assert isinstance(m["indexInSubtype"], int)
        assert m["region"] == m["id"]


def test_index_in_subtype_counts_per_subtype_from_one():
    parsed = _parsed()
    parsed["entries"].append({
        "id": "poi_001", "kind": "poi", "index": 1, "accessId": [7, 8, 9],
        "center": [-100.0, -100.0], "min": [-110.0, -110.0], "max": [-90.0, -90.0],
        "aspect": [20.0, 20.0], "mask": "Texture2D/POIPolygon_1.png", "maskSize": [40, 40],
    })
    ds = build_dataset(parsed, _regions())
    by_id = {m["id"]: m for m in ds["markers"]["Vardoran"]}
    assert by_id["poi_000"]["indexInSubtype"] == 1
    assert by_id["poi_001"]["indexInSubtype"] == 2
    assert by_id["terr_000"]["indexInSubtype"] == 1


def test_taxonomy_carries_both_subtypes_with_icons():
    ds = build_dataset(_parsed(), _regions())
    (cat,) = ds["types"]["categories"]
    assert cat["id"] == "regions"
    ids = {s["id"]: s for s in cat["subtypes"]}
    assert set(ids) == {"poi", "territory"}
    assert ids["poi"]["icon"] == "MapIcon_CavePassage"
    assert ids["territory"]["defaultActive"] is True


def test_locales_cover_every_language_and_namespace():
    ds = build_dataset(_parsed(), _regions())
    assert set(ds["locales"]) == {"en-US", "zh-CN", "zh-TW"}
    for lng, loc in ds["locales"].items():
        assert loc["maps"]["Vardoran"]["name"], lng
        assert set(loc["types"]["subtypes"]) == {"poi", "territory"}
        assert set(loc["markers"]["Vardoran"]) == {"poi_000", "terr_000"}
        assert set(loc["regions"]["Vardoran"]) == {"poi_000", "terr_000"}


def test_region_labels_are_identical_across_locales():
    """Region labels are access ids, not names — translating them would be
    inventing text the game never shipped."""
    ds = build_dataset(_parsed(), _regions())
    names = {lng: loc["regions"]["Vardoran"]["poi_000"]["name"] for lng, loc in ds["locales"].items()}
    assert len(set(names.values())) == 1
    assert "1-2-3" in names["en-US"]


def test_an_unreviewed_calibration_is_refused():
    import vrising.maps.emit as emit

    original = emit.CALIBRATION_METHOD
    emit.CALIBRATION_METHOD = "guess"
    try:
        with pytest.raises(RuntimeError, match="CALIBRATION_METHOD"):
            build_dataset(_parsed(), _regions())
    finally:
        emit.CALIBRATION_METHOD = original
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests/test_emit.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vrising.maps.emit'`.

- [ ] **Step 4: Write `apps/vrising/maps/emit.py`**

```python
"""Emit stage: the contract-v1 dataset for ``data-vrising``.

Layout validated by ``pnpm validate-data``:
    maps.json, types.json, markers/<Map>.json, regions/<Map>.json,
    locales/<lng>/{maps.json, types.json, markers/<Map>.json, regions/<Map>.json}

Two conventions inherited from the contract, both deliberate:
  * MARKERS carry RAW WORLD coordinates. ``maps.json`` supplies
    ``worldBounds`` + ``orientation``, and the engine derives pixels with
    ``worldToPixel``. Do not pre-project markers.
  * REGIONS carry PIXEL polygons (Task 9 already applied the transform).
"""

from __future__ import annotations

from pathlib import Path

import yaml

from ..common import write_json
from .calibration import (
    CALIBRATION_METHOD,
    MAP_ID,
    MAP_PX,
    ORIENTATION,
    world_bounds_json,
)
from .extract import read_parsed
from .tiles import COUNT, TILE

_HERE = Path(__file__).resolve().parent
_TYPES_YAML = _HERE.parent / "data_src" / "types.yaml"
# The only two states a shipped calibration may be in (see Task 8, Step 9).
_VALID_CALIBRATION = {"fitted", "by-eye"}


def build_dataset(parsed: dict, regions: list[dict]) -> dict:
    if CALIBRATION_METHOD not in _VALID_CALIBRATION:
        raise RuntimeError(
            f"CALIBRATION_METHOD is {CALIBRATION_METHOD!r}; it must be one of "
            f"{sorted(_VALID_CALIBRATION)}. Run `python -m vrising.maps calibrate` and "
            "record an accepted (or explicitly by-eye) result in calibration.py."
        )

    src = yaml.safe_load(_TYPES_YAML.read_text(encoding="utf-8"))
    languages: list[str] = src["languages"]
    map_src = src["map"]

    if parsed["mapSize"] != [MAP_PX, MAP_PX]:
        raise RuntimeError(
            f"map image is {parsed['mapSize']} but calibration.py pins MAP_PX={MAP_PX}; "
            "re-run calibrate against the current image"
        )

    maps = [{
        "id": MAP_ID,
        "name": MAP_ID,
        "type": map_src["type"],
        "tileWidth": TILE,
        "tileHeight": TILE,
        "tilesCountX": COUNT,
        "tilesCountY": COUNT,
        "isVisible": True,
        "worldBounds": world_bounds_json(),
        "orientation": ORIENTATION.as_json(),
    }]

    types = {
        "categories": [{
            "id": c["id"],
            **({"pinVariant": c["pinVariant"]} if c.get("pinVariant") else {}),
            "subtypes": [{
                "id": s["id"],
                **({"icon": s["icon"]} if s.get("icon") else {}),
                **({"iconScale": s["iconScale"]} if s.get("iconScale") else {}),
                **({"defaultActive": True} if s.get("defaultActive") else {}),
            } for s in c["subtypes"]],
        } for c in src["categories"]],
    }

    # One marker per region, at the region's CenterPosWS. `region` points back at
    # the region polygon so the popup and the cursor readout can name it.
    counters: dict[str, int] = {}
    markers: list[dict] = []
    marker_labels: dict[str, str] = {}
    for e in parsed["entries"]:
        subtype = e["kind"]
        counters[subtype] = counters.get(subtype, 0) + 1
        a = e["accessId"]
        label = f"{'POI' if subtype == 'poi' else 'Territory'} {a[0]}-{a[1]}-{a[2]}"
        marker_labels[e["id"]] = label
        markers.append({
            "id": e["id"],
            "category": "regions",
            "subtype": subtype,
            "region": e["id"],
            # RAW WORLD coordinates — the engine projects these.
            "x": e["center"][0],
            "y": e["center"][1],
            "images": [],
            "contributors": [],
            "indexInSubtype": counters[subtype],
        })

    region_labels = {r["id"]: r["name"] for r in regions}

    locales: dict[str, dict] = {}
    for lng in languages:
        locales[lng] = {
            "maps": {MAP_ID: {
                "name": map_src["names"][lng],
                "description": "",
                "shortName": map_src["names"][lng],
            }},
            "types": {
                "categories": {c["id"]: {"name": c["names"][lng]} for c in src["categories"]},
                "subtypes": {
                    s["id"]: {
                        "name": s["names"][lng],
                        "description": (s.get("descriptions") or {}).get(lng, ""),
                    }
                    for c in src["categories"] for s in c["subtypes"]
                },
            },
            # Access-id labels are identical in every locale on purpose: they are
            # ids, not names, and the game ships no names to translate.
            "markers": {MAP_ID: {mid: {"name": label} for mid, label in marker_labels.items()}},
            "regions": {MAP_ID: {rid: {"name": label} for rid, label in region_labels.items()}},
        }

    return {
        "maps": maps,
        "types": types,
        "markers": {MAP_ID: markers},
        "regions": {MAP_ID: regions},
        "locales": locales,
    }


def run_emit(parsed_dir: Path, data_out: Path) -> None:
    parsed_dir, data_out = Path(parsed_dir), Path(data_out)
    parsed = read_parsed(parsed_dir)
    regions_path = parsed_dir / "regions.json"
    if not regions_path.is_file():
        raise RuntimeError(
            f"{regions_path} is missing — run `python -m vrising.maps regions` first"
        )
    import json
    regions = json.loads(regions_path.read_text(encoding="utf-8"))["regions"]

    ds = build_dataset(parsed, regions)

    def w(rel, obj):
        write_json(data_out / rel, obj)

    w("maps.json", {"maps": ds["maps"]})
    w("types.json", ds["types"])
    for mid, lst in ds["markers"].items():
        w(f"markers/{mid}.json", {"markers": lst})
    for mid, lst in ds["regions"].items():
        w(f"regions/{mid}.json", {"regions": lst})
    for lng, loc in ds["locales"].items():
        w(f"locales/{lng}/maps.json", loc["maps"])
        w(f"locales/{lng}/types.json", loc["types"])
        for mid in ds["markers"]:
            w(f"locales/{lng}/markers/{mid}.json", loc["markers"][mid])
            w(f"locales/{lng}/regions/{mid}.json", loc["regions"][mid])

    for mid, lst in ds["markers"].items():
        print(f"emit: {mid} {len(lst)} markers, {len(ds['regions'][mid])} regions")
    print(f"emit: locales {', '.join(sorted(ds['locales']))} (calibration: {CALIBRATION_METHOD})")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd .claude/worktrees/vrising-app/tools && uv run pytest apps/vrising/tests -q`
Expected: PASS — 8 emit tests plus everything from Tasks 5–9 (33 tests total).

- [ ] **Step 6: Run the stage and validate the artifact against the contract**

```bash
cd .claude/worktrees/vrising-app/tools && uv run python -m vrising.maps emit
```
Expected:
```
emit: Vardoran 372 markers, 372 regions
emit: locales en-US, zh-CN, zh-TW (calibration: fitted)
version: <12 hex chars>
```

Then the contract validator — this is the authority on the layout:

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm validate-data E:/arkive-games/data-vrising
```
Expected: exit 0 with no issues listed. A `missing generated namespace` issue means a locale directory does not mirror the root; the validator names the exact missing file.

- [ ] **Step 7: Eyeball the emitted files**

```bash
cd E:/arkive-games/data-vrising && cat maps.json && head -c 400 markers/Vardoran.json && echo && du -sh regions
```
Expected: `maps.json` shows `tileWidth: 1216`, `tilesCountX: 5`, and the accepted `worldBounds`/`orientation`; the first marker carries world-scale coordinates (hundreds/thousands, negative), **not** pixel values in `0..6080`; `regions/` is a few hundred KB.

- [ ] **Step 8: Commit**

```bash
cd .claude/worktrees/vrising-app
git add tools/apps/vrising/data_src/types.yaml tools/apps/vrising/maps/emit.py \
        tools/apps/vrising/tests/test_emit.py
git commit -m "feat(vrising): emit the contract-v1 dataset with 372 region markers and polygons"
```

---

## Task 11: The map page

**Files:**
- Create: `frontend/apps/vrising/src/lib/data.ts`
- Create: `frontend/apps/vrising/src/lib/assets.ts`
- Create: `frontend/apps/vrising/src/features/map/subzone.ts`
- Create: `frontend/apps/vrising/src/features/map/subzone.test.ts`
- Create: `frontend/apps/vrising/src/features/map/popup.tsx`
- Replace: `frontend/apps/vrising/src/features/map/MapPage.tsx`

Everything app-specific is injected. `@gamemap/map-engine` never builds a URL (that is `MapAssets`), never reads i18n (that is `labels` plus pre-localized `EngineMarker`s), and never touches storage; `@gamemap/map-shell` likewise. This task adds nothing to either package.

- [ ] **Step 1: Write `src/lib/data.ts`**

```ts
import type { GameMapMeta, MarkerPinVariant, MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { dataUrl } from './urls'

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

// Re-export so MapPage can use GameMapMeta without importing data-contract.
export type { GameMapMeta as MapMeta }

export interface Taxonomy {
  categories: { id: string }[]
  /** MarkerTypeSubtype requires `name`; supplied from the locale at load time. */
  subtypes: MarkerTypeSubtype[]
}

export interface MarkerRow {
  id: string
  subtype: string
  category?: string
  /** RAW WORLD coordinates — the engine projects them via the map's worldBounds. */
  x: number
  y: number
  /** Region polygon this marker belongs to (regions/<map>.json id). */
  region?: string
  indexInSubtype: number
}

export type MarkerLocale = Record<string, { name?: string; description?: string }>
export interface TypesLocale {
  categories: Record<string, { name: string }>
  subtypes: Record<string, { name: string; description?: string }>
}
export type MapsLocale = Record<string, { name: string; shortName?: string }>
export type RegionLocale = Record<string, { name: string }>

interface TypesFile {
  categories: {
    id: string
    pinVariant?: MarkerPinVariant
    subtypes: {
      id: string
      icon?: string
      iconScale?: number
      pinVariant?: MarkerPinVariant
      defaultActive?: boolean
    }[]
  }[]
}

export async function loadStatic(lng: string) {
  const [mapsFile, typesFile, mapsL10n, typesL10n] = await Promise.all([
    j<{ maps: GameMapMeta[] }>(dataUrl('maps.json')),
    j<TypesFile>(dataUrl('types.json')),
    j<MapsLocale>(dataUrl(`locales/${lng}/maps.json`)),
    j<TypesLocale>(dataUrl(`locales/${lng}/types.json`)),
  ])
  const types: Taxonomy = {
    categories: typesFile.categories.map((c) => ({ id: c.id })),
    subtypes: typesFile.categories.flatMap((c) =>
      c.subtypes.map((s): MarkerTypeSubtype => ({
        ...s,
        category: c.id,
        pinVariant: s.pinVariant ?? c.pinVariant,
        // Locale name when present, else the id so the required field is set.
        name: typesL10n.subtypes[s.id]?.name ?? s.id,
      }))),
  }
  return { maps: mapsFile.maps, types, mapsL10n, typesL10n }
}

export async function loadMarkers(mapId: string, lng: string) {
  const [markersFile, l10n] = await Promise.all([
    j<{ markers: MarkerRow[] }>(dataUrl(`markers/${mapId}.json`)),
    j<MarkerLocale>(dataUrl(`locales/${lng}/markers/${mapId}.json`)),
  ])
  return { markers: markersFile.markers, l10n }
}

/** Region polygons (PIXEL space) + their labels. Best-effort: the map renders
 *  without them, so a missing file degrades to an empty overlay. */
export async function loadRegions(
  mapId: string,
  lng: string,
): Promise<{ regions: RegionInstance[]; l10n: RegionLocale }> {
  const [regionsFile, l10n] = await Promise.all([
    j<{ regions: RegionInstance[] }>(dataUrl(`regions/${mapId}.json`)).catch(() => ({ regions: [] })),
    j<RegionLocale>(dataUrl(`locales/${lng}/regions/${mapId}.json`)).catch(() => ({})),
  ])
  return { regions: regionsFile.regions, l10n }
}
```

- [ ] **Step 2: Write `src/lib/assets.ts`**

```ts
import type { MapAssets } from '@gamemap/map-engine'
import { RES_BASE } from './urls'

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Asset-URL resolution, injected into the engine (which builds no URLs itself).
 * Tile grid: ONE native zoom level, `<res>/tiles/<MapId>/<MapId>_<col>_<row>.webp`,
 * (0,0) top-left, row index increasing downward — the same convention palworld
 * and aion2 use. The engine rejects out-of-grid indices before calling tileUrl.
 */
export const vrisingAssets: MapAssets = {
  tileUrl: (map, x, y) => `${RES_BASE}/tiles/${map.id}/${map.id}_${pad2(x)}_${pad2(y)}.webp`,
  markerIconUrl: (icon) => (icon ? `${RES_BASE}/icons/${icon}.webp` : ''),
}

/** Whole-map preview WebP written by the tiles stage. */
export const mapPreviewUrl = (mapId: string): string => `${RES_BASE}/preview/${mapId}.webp`
```

- [ ] **Step 3: Write the failing test for `subzone.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { RegionInstance } from '@gamemap/data-contract'
import { pointInPolygon, sortRegionsByArea, regionAt } from './subzone'

const square = (id: string, x0: number, y0: number, x1: number, y1: number): RegionInstance => ({
  id,
  name: id,
  type: 'poi',
  borders: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
})

describe('pointInPolygon', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]

  it('accepts an interior point', () => {
    expect(pointInPolygon(5, 5, ring)).toBe(true)
  })

  it('rejects an exterior point', () => {
    expect(pointInPolygon(15, 5, ring)).toBe(false)
    expect(pointInPolygon(5, -1, ring)).toBe(false)
  })

  it('handles a concave ring', () => {
    // An L shape: (0,0)-(10,0)-(10,4)-(4,4)-(4,10)-(0,10)
    const l = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]]
    expect(pointInPolygon(2, 8, l)).toBe(true)
    expect(pointInPolygon(8, 8, l)).toBe(false)
  })
})

describe('sortRegionsByArea', () => {
  it('orders smallest first so the most specific region wins', () => {
    const sorted = sortRegionsByArea([
      square('big', 0, 0, 100, 100),
      square('small', 10, 10, 20, 20),
      square('mid', 0, 0, 50, 50),
    ])
    expect(sorted.map((r) => r.id)).toEqual(['small', 'mid', 'big'])
  })

  it('sums multi-ring regions', () => {
    const two: RegionInstance = {
      id: 'two', name: 'two', type: 'poi',
      borders: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[50, 50], [90, 50], [90, 90], [50, 90], [50, 50]],
      ],
    }
    const sorted = sortRegionsByArea([two, square('one', 0, 0, 30, 30)])
    expect(sorted.map((r) => r.id)).toEqual(['one', 'two'])
  })
})

describe('regionAt', () => {
  const sorted = sortRegionsByArea([
    square('big', 0, 0, 100, 100),
    square('small', 10, 10, 20, 20),
  ])

  it('returns the smallest region containing the point', () => {
    expect(regionAt(sorted, 15, 15)?.id).toBe('small')
  })

  it('falls through to the enclosing region', () => {
    expect(regionAt(sorted, 60, 60)?.id).toBe('big')
  })

  it('returns undefined outside every region', () => {
    expect(regionAt(sorted, 500, 500)).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd .claude/worktrees/vrising-app/frontend && pnpm vitest run apps/vrising/src/features/map/subzone.test.ts`
Expected: FAIL — cannot resolve `./subzone`.

- [ ] **Step 5: Write `src/features/map/subzone.ts`**

```ts
import type { RegionInstance } from '@gamemap/data-contract'

/**
 * Ray-casting point-in-polygon. Both the point and the ring are in MAP-PIXEL
 * space — region borders ship as pixel polygons, so a marker or cursor in world
 * coordinates must be projected with `worldToPixel` before it gets here.
 */
export function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function ringArea(ring: number[][]): number {
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(s) / 2
}

/**
 * Regions ordered by total area ascending. V Rising's POI outlines and territory
 * outlines overlap heavily (a territory can contain several POIs), so a point
 * lookup must return the SMALLEST containing region to be useful. Sorting once
 * makes the lookup a first-hit scan.
 */
export function sortRegionsByArea(regions: RegionInstance[]): RegionInstance[] {
  return [...regions]
    .map((r) => ({ r, a: r.borders.reduce((sum, ring) => sum + ringArea(ring), 0) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.r)
}

/** The smallest region containing the map-pixel point, if any. */
export function regionAt(
  sorted: RegionInstance[],
  x: number,
  y: number,
): RegionInstance | undefined {
  for (const r of sorted) {
    if (r.borders.some((ring) => pointInPolygon(x, y, ring))) return r
  }
  return undefined
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd .claude/worktrees/vrising-app/frontend && pnpm vitest run apps/vrising/src/features/map/subzone.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Write `src/features/map/popup.tsx`**

```tsx
import type { ReactNode } from 'react'
import type { EngineMarker } from '@gamemap/map-engine'
import { MarkerPopupCard, formatCoords } from '@gamemap/map-shell'

export interface PopupDeps {
  t: (key: string, opts?: Record<string, unknown>) => string
  /** Localized region label for a region id (regions/<map>.json l10n). */
  regionName: (id?: string) => string
  /** Localized category label for a category id. */
  categoryName: (id?: string) => string
}

/**
 * Popup body for a selected marker. The engine renders the frame and calls this
 * for the content, so all i18n and all app links stay on the app side.
 */
export function renderMarkerPopup(marker: EngineMarker, deps: PopupDeps): ReactNode {
  const { t, regionName, categoryName } = deps
  const catId = marker.subtypeMeta?.category ?? marker.category
  const catLabel = categoryName(catId)
  const subLabel = marker.subtypeLabel ?? marker.subtype
  const { text: coordText, aria: coordAria } = formatCoords(marker.x, marker.y)
  const catText = [catLabel, subLabel].filter(Boolean).join(' / ')
  const regionLabel = regionName(marker.region)

  // The coords get their own element so the axis-labeled aria/title rides only
  // on the coordinate, not the whole meta line.
  const metaLine = (
    <>
      {catText ? `${catText} ` : ''}
      <span aria-label={coordAria} title={coordAria}>{coordText}</span>
      {regionLabel ? (
        <span className="ml-1 text-muted-foreground" data-testid="marker-region">
          · {regionLabel}
        </span>
      ) : null}
    </>
  )

  return (
    <MarkerPopupCard
      name={marker.localizedName || t('unnamed')}
      metaLine={metaLine}
      description={marker.localizedDescription}
      noDescriptionLabel={t('noDescription')}
    />
  )
}
```

- [ ] **Step 8: Replace `src/features/map/MapPage.tsx` with the real map**

Desktop uses `ShellLayout` (sidebar + top bar + map); mobile drops the sidebar and moves the filter and search panels into bottom sheets, matching palworld. There is only one map, so no `ShellMapSelect`.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import {
  GameMapView, worldToPixel,
  type EngineMarker, type MapRef,
} from '@gamemap/map-engine'
import {
  FilterPanel, SearchPanel, ShellLayout, ShellSidebar,
  readMapView, useMapViewMemory,
  type FilterCategory, type MapViewState, type SearchItem,
} from '@gamemap/map-shell'
import type { MarkerTypeSubtype, RegionInstance } from '@gamemap/data-contract'
import { Sheet, SheetContent, SheetHeader, SheetTitle, useIsMobile } from '@gamemap/ui'
import { SlidersHorizontal, Search as SearchIcon } from 'lucide-react'
import {
  loadStatic, loadMarkers, loadRegions,
  type MapMeta, type MarkerLocale, type MarkerRow, type MapsLocale,
  type RegionLocale, type Taxonomy, type TypesLocale,
} from '../../lib/data'
import { vrisingAssets } from '../../lib/assets'
import { mapViewStore, readVisibleSubtypes, writeVisibleSubtypes } from '../../lib/storage'
import { vrisingTheme } from '../../theme'
import { TopNav } from '../../components/TopNav'
import { regionAt, sortRegionsByArea } from './subzone'
import { renderMarkerPopup } from './popup'

const MAP_ID = 'Vardoran'

export default function MapPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const mapRef = useRef<MapRef>(null)
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)

  // Restore the persisted subtype selection once at mount; null = never chosen,
  // so the taxonomy's `defaultActive` flags apply instead.
  const [restoredVisible] = useState<Set<string> | null>(readVisibleSubtypes)
  const visibleInitialized = useRef(restoredVisible != null)

  const { q: initialQuery } = useSearch({ from: '/' })

  const [staticData, setStaticData] = useState<{
    maps: MapMeta[]; types: Taxonomy; mapsL10n: MapsLocale; typesL10n: TypesLocale
  } | null>(null)
  const [markerData, setMarkerData] = useState<{ markers: MarkerRow[]; l10n: MarkerLocale } | null>(null)
  const [regionData, setRegionData] = useState<{ regions: RegionInstance[]; l10n: RegionLocale } | null>(null)
  const [visible, setVisible] = useState<Set<string>>(() => restoredVisible ?? new Set())
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null)
  const [restoredMarkerId, setRestoredMarkerId] = useState<string | null>(null)
  const [searchResultIds, setSearchResultIds] = useState<string[]>([])
  const [showLabels, setShowLabels] = useState(false)
  const [showRegions, setShowRegions] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Camera + selection persistence. `useMapViewMemory` is storage-free; the
  // adapter comes from lib/storage.
  const { initialView, saveView, saveMarker } = useMapViewMemory(mapViewStore, MAP_ID)
  const [mountView] = useState<MapViewState | null>(initialView)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadStatic(lng)
      .then((d) => {
        if (cancelled) return
        setStaticData(d)
        if (!visibleInitialized.current) {
          visibleInitialized.current = true
          setVisible(new Set(d.types.subtypes.filter((s) => s.defaultActive).map((s) => s.id)))
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [lng, t])

  useEffect(() => { writeVisibleSubtypes(visible) }, [visible])

  useEffect(() => {
    let cancelled = false
    setMarkerData(null)
    setSelectedMarkerId(null)
    setSelectedPosition(null)
    setRestoredMarkerId(null)
    loadMarkers(MAP_ID, lng)
      .then((d) => {
        if (cancelled) return
        setMarkerData(d)
        // Reopen the stored selection with the fly suppressed, so the restored
        // camera stays put instead of being yanked to the marker.
        const stored = readMapView(mapViewStore, MAP_ID).marker
        if (stored && d.markers.some((m) => m.id === stored)) {
          setRestoredMarkerId(stored)
          setSelectedMarkerId(stored)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setLoadError(t('loadError'))
      })
    return () => { cancelled = true }
  }, [lng, t])

  useEffect(() => {
    let cancelled = false
    setRegionData(null)
    loadRegions(MAP_ID, lng)
      .then((d) => { if (!cancelled) setRegionData(d) })
      .catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [lng])

  useEffect(() => {
    if (markerData) saveMarker(selectedMarkerId)
  }, [markerData, selectedMarkerId, saveMarker])

  const map = staticData?.maps.find((m) => m.id === MAP_ID)

  const subtypeMetaMap = useMemo(
    () => new Map<string, MarkerTypeSubtype>((staticData?.types.subtypes ?? []).map((s) => [s.id, s])),
    [staticData],
  )

  // Localize + resolve subtype metadata here: the engine reads no i18n and knows
  // nothing about the taxonomy.
  const engineMarkers: EngineMarker[] = useMemo(() => {
    if (!staticData || !markerData) return []
    return markerData.markers.map((m) => {
      const loc = markerData.l10n[m.id]
      const subtypeL10n = staticData.typesL10n.subtypes[m.subtype]
      const subLabel = subtypeL10n?.name ?? m.subtype
      return {
        id: m.id,
        subtype: m.subtype,
        category: m.category,
        x: m.x,
        y: m.y,
        region: m.region,
        indexInSubtype: m.indexInSubtype,
        images: [] as string[],
        contributors: [] as string[],
        localizedName: loc?.name ?? subLabel,
        localizedDescription: loc?.description ?? subtypeL10n?.description,
        subtypeLabel: subLabel,
        subtypeMeta: subtypeMetaMap.get(m.subtype),
      }
    })
  }, [staticData, markerData, subtypeMetaMap])

  const forceShowIds = useMemo(() => new Set(searchResultIds), [searchResultIds])

  const searchItems: SearchItem[] = useMemo(() => {
    if (!staticData || !map) return []
    return engineMarkers.map((m) => {
      const iconName = m.icon || m.subtypeMeta?.icon || ''
      const catId = m.subtypeMeta?.category ?? m.category
      return {
        id: m.id,
        name: m.localizedName || '',
        description: m.localizedDescription,
        subtypeLabel: m.subtypeLabel ?? m.subtype,
        categoryLabel: catId ? (staticData.typesL10n.categories[catId]?.name ?? catId) : '',
        iconUrl: iconName ? vrisingAssets.markerIconUrl(iconName, map) : undefined,
        x: m.x,
        y: m.y,
      }
    })
  }, [engineMarkers, staticData, map])

  const countBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of markerData?.markers ?? []) {
      counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    }
    return counts
  }, [markerData])

  const filterCategories: FilterCategory[] = useMemo(() => {
    if (!staticData) return []
    return staticData.types.categories
      .map((cat) => ({
        id: cat.id,
        label: staticData.typesL10n.categories[cat.id]?.name ?? cat.id,
        subtypes: staticData.types.subtypes
          .filter((s) => s.category === cat.id)
          .filter((s) => (countBySubtype.get(s.id) ?? 0) > 0)
          .map((s) => ({
            id: s.id,
            label: staticData.typesL10n.subtypes[s.id]?.name ?? s.id,
            active: visible.has(s.id),
            count: countBySubtype.get(s.id) ?? 0,
          })),
      }))
      .filter((cat) => cat.subtypes.length > 0)
  }, [staticData, visible, countBySubtype])

  const onToggleSubtype = useCallback((id: string) => {
    setVisible((v) => {
      const next = new Set(v)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onSetCategory = useCallback((categoryId: string, show: boolean) => {
    setVisible((v) => {
      if (!staticData) return v
      const next = new Set(v)
      for (const s of staticData.types.subtypes) {
        if (s.category !== categoryId) continue
        if (show) next.add(s.id); else next.delete(s.id)
      }
      return next
    })
  }, [staticData])

  const onToggleMarker = useCallback((id: string | null) => {
    setSelectedMarkerId((cur) => (cur === id ? null : id))
  }, [])

  const regionName = useCallback(
    (id?: string) => (id && regionData?.l10n[id]?.name) || '',
    [regionData],
  )
  const categoryName = useCallback(
    (id?: string) => (id && staticData?.typesL10n.categories[id]?.name) || id || '',
    [staticData],
  )

  // Cursor readout. The cursor arrives in DATA (world) space; region borders are
  // pixel polygons, so project first — the one place the asymmetry bites.
  const sortedRegions = useMemo(
    () => sortRegionsByArea(regionData?.regions ?? []),
    [regionData],
  )
  const subzoneAt = useCallback(
    (x: number, y: number) => {
      if (!map || sortedRegions.length === 0) return ''
      const p = worldToPixel(map, x, y)
      const hit = regionAt(sortedRegions, p.x, p.y)
      return hit ? (regionName(hit.id) || hit.name) : ''
    },
    [map, sortedRegions, regionName],
  )

  const labels = useMemo(() => ({
    copyPosition: t('copyPosition'),
    noMapSelected: t('noMapSelected'),
    zoomIn: t('zoomIn'),
    zoomOut: t('zoomOut'),
  }), [t])

  const searchLabels = useMemo(() => ({
    search: t('search'),
    resultsCount: (n: number) => t('resultsCount', { count: n }),
    unnamed: t('unnamed'),
    noDescription: t('noDescription'),
    scopeName: t('scopeName'),
    scopeAll: t('scopeAll'),
  }), [t])

  const renderPopupContent = useCallback(
    (marker: EngineMarker) => renderMarkerPopup(marker, { t, regionName, categoryName }),
    [t, regionName, categoryName],
  )

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-destructive">
        {loadError}
      </div>
    )
  }
  if (!staticData) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  const filterPanel = (
    <FilterPanel
      categories={filterCategories}
      onToggleSubtype={onToggleSubtype}
      onSetCategory={onSetCategory}
      categoryToggleLabels={{ show: t('showAll'), hide: t('hideAll') }}
      controls={[
        {
          id: 'show-all',
          label: t('showAll'),
          onClick: () => setVisible(new Set(staticData.types.subtypes.map((s) => s.id))),
        },
        { id: 'hide-all', label: t('hideAll'), onClick: () => setVisible(new Set()) },
        {
          id: 'show-tooltip',
          label: t('showTooltip'),
          onClick: () => setShowLabels((v) => !v),
          active: showLabels,
        },
        {
          id: 'show-regions',
          label: t('showRegions'),
          onClick: () => setShowRegions((v) => !v),
          active: showRegions,
        },
      ]}
      classNames={{
        controlButton: 'bg-secondary text-secondary-foreground',
        controlButtonActive: 'bg-primary text-primary-foreground',
        subtypeButton: 'bg-secondary text-secondary-foreground',
        subtypeButtonActive: 'bg-primary text-primary-foreground',
      }}
    />
  )

  const searchPanel = (variant: 'floating' | 'inline') => (
    <SearchPanel
      items={searchItems}
      onSelect={setSelectedMarkerId}
      onFlyTo={setSelectedPosition}
      onResultsChange={setSearchResultIds}
      initialQuery={initialQuery}
      labels={searchLabels}
      variant={variant}
    />
  )

  const mapView = (
    <GameMapView
      map={map}
      markers={engineMarkers}
      regions={showRegions ? (regionData?.regions ?? []) : []}
      visibleSubtypes={visible}
      showLabels={showLabels}
      showBorders={showRegions}
      lodEnabled={false}
      selectedMarkerId={selectedMarkerId}
      forceShowIds={forceShowIds}
      selectedPosition={selectedPosition}
      initialView={mountView}
      onViewChange={saveView}
      suppressInitialFlyForId={restoredMarkerId}
      onToggleMarker={onToggleMarker}
      subzoneAt={subzoneAt}
      flyToDuration={0.5}
      mapRef={mapRef}
      assets={vrisingAssets}
      theme={vrisingTheme}
      exposeTestHandle={import.meta.env.DEV}
      renderPopupContent={renderPopupContent}
      labels={labels}
    />
  )

  if (isMobile) {
    return (
      <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
        <h1 className="sr-only">{t('title')}</h1>
        {/* Same flex chain as the desktop ShellLayout so the map root (flex:1)
            gets a definite height and Leaflet sizes correctly on mount. */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden">{mapView}</main>

        <div className="absolute right-3 z-[700] flex flex-col gap-2"
             style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <button
            type="button"
            data-testid="map-fab-search"
            aria-label={t('search')}
            onClick={() => setSearchSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <SearchIcon className="size-5" />
          </button>
          <button
            type="button"
            data-testid="map-fab-filter"
            aria-label={t('filter')}
            onClick={() => setFilterSheetOpen(true)}
            className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="bottom" data-testid="filter-sheet" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>{t('filter')}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{filterPanel}</div>
          </SheetContent>
        </Sheet>

        <Sheet open={searchSheetOpen} onOpenChange={setSearchSheetOpen}>
          <SheetContent side="bottom" data-testid="search-sheet" className="h-[70dvh]">
            <SheetTitle className="sr-only">{t('search')}</SheetTitle>
            {searchPanel('inline')}
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <ShellLayout
        className="bg-background text-foreground"
        topBar={<TopNav active="/" />}
        sidebar={
          <ShellSidebar
            collapseLabel={t('collapse')}
            expandLabel={t('expand')}
            classNames={{
              root: 'border-r border-border bg-gradient-to-b from-card to-background text-sm text-card-foreground',
              collapseButton: 'bg-secondary text-secondary-foreground',
              content: 'px-3 pt-3',
            }}
          >
            {filterPanel}
          </ShellSidebar>
        }
      >
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {mapView}
          {searchPanel('floating')}
        </main>
      </ShellLayout>
    </>
  )
}
```

- [ ] **Step 9: Typecheck, build, lint, and re-run the package gates**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm --filter vrising build
```
Expected: `tsc -b` silent, `vite build` ends with `built in …`. Fix any prop-name mismatch against the real `FilterPanel` / `SearchPanel` / `ShellSidebar` signatures rather than casting — check them with `sed -n '1,60p' packages/map-shell/src/FilterPanel.tsx` etc.

```bash
pnpm --filter vrising lint && pnpm check:engine && pnpm check:shell && pnpm test
```
Expected: no output from `lint` or either `check:*`, and all vitest suites pass (including the 8 new `subzone` tests).

- [ ] **Step 10: Look at it running**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm dev:vrising
```
Then open `http://localhost:15176`. Verify, in this order:
1. Tiles load — the network tab shows 25 requests to `/vrisingres/tiles/Vardoran/Vardoran_XX_YY.webp`, all 200.
2. Region outlines are drawn and **sit on the map's own drawn features** — this is the calibration verification repeated in the real renderer, at full resolution, and it is the most convincing check available.
3. Markers appear at region centres with the cave/castle icons.
4. Hovering shows a region name in the cursor status bar (bottom right).
5. Toggling **Point of interest** off in the sidebar removes those pins.
6. Switching language to 简体中文 changes the subtype labels (data locale) and the UI chrome.
7. Reloading restores the camera and the open popup without a fly animation.

If regions are visibly offset here but Task 8 reported an accepted IoU, suspect the mask row order (`MASK_ROWS_DOWN`) before suspecting the bounds: a row-order error is a per-region vertical mirror, which barely moves the coverage IoU but is obvious on screen.

- [ ] **Step 11: Commit**

```bash
cd .claude/worktrees/vrising-app
git add frontend/apps/vrising/src
git commit -m "feat(vrising): render the Vardoran map with region overlays, filters and search"
```

---

## Task 12: End-to-end tests

**Files:**
- Create: `frontend/apps/vrising/e2e/smoke.spec.ts`
- Create: `frontend/apps/vrising/e2e/regions.spec.ts`

The unit suite covers pure logic; these cover the wiring that only exists when a real dev server serves real artifacts — tile URLs, marker icons, the `?v=` cache-buster, the data-locale switch.

- [ ] **Step 1: Write `e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

// Markers render as Leaflet divIcons: a .leaflet-marker-icon div whose innerHTML
// contains an <img> with the icon URL. Tiles come from
// /vrisingres/tiles/Vardoran/Vardoran_XX_YY.webp via the Vite dev middleware.

test('renders Vardoran tiles', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(
    page.locator('img.leaflet-tile[src*="/vrisingres/tiles/Vardoran/"]').first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('tile URLs use the 5x5 grid and never index past it', async ({ page }) => {
  const tiles: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/vrisingres/tiles/Vardoran/')) tiles.push(r.url())
  })
  await page.goto('/')
  await expect(
    page.locator('img.leaflet-tile[src*="/vrisingres/tiles/Vardoran/"]').first(),
  ).toBeVisible({ timeout: 15_000 })
  expect(tiles.length).toBeGreaterThan(0)
  for (const url of tiles) {
    const m = url.match(/Vardoran_(\d{2})_(\d{2})\.webp/)
    expect(m, url).not.toBeNull()
    expect(Number(m![1])).toBeLessThan(5)
    expect(Number(m![2])).toBeLessThan(5)
  }
})

test('region markers render with their game icons', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(
    page.locator('.leaflet-marker-pane .leaflet-marker-icon img[src*="MapIcon_"]').first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('toggling a subtype hides its markers', async ({ page }) => {
  await page.goto('/')
  const pins = page.locator('.leaflet-marker-pane .leaflet-marker-icon img[src*="MapIcon_CavePassage"]')
  await expect(pins.first()).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('subtype-toggle-poi').click()
  await expect(pins).toHaveCount(0, { timeout: 10_000 })
})

test('selecting a marker opens a popup naming its region', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().click()
  await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('marker-region')).toBeVisible()
})

test('data fetches carry the artifact-version cache-buster', async ({ page }) => {
  // version.json (stamped by tools) is fetched first; every other data URL must
  // then carry ?v=<version> so long-cached files bust on data deploys.
  const dataRequests: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/data/') && url.pathname !== '/data/version.json') {
      dataRequests.push(url.pathname + url.search)
    }
  })
  await page.goto('/')
  await expect(
    page.locator('.leaflet-marker-pane .leaflet-marker-icon').first(),
  ).toBeVisible({ timeout: 15_000 })
  expect(dataRequests.length).toBeGreaterThan(0)
  for (const u of dataRequests) expect(u).toMatch(/\?v=[0-9a-f]{12}$/)
})

test('switching language localizes both UI chrome and data labels', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByTestId('lang-menu').click()
  await page.getByTestId('lang-zh-CN').click()
  // App UI string (i18n resources) and a data-locale taxonomy label (types.json).
  await expect(page.getByRole('heading', { name: '夜族崛起互动地图' })).toBeVisible()
  await expect(page.getByText('兴趣点').first()).toBeVisible({ timeout: 10_000 })
})

test('the changelog page renders the launch version', async ({ page }) => {
  await page.goto('/changelog')
  await expect(page.getByRole('heading', { name: /Changelog/i })).toBeVisible()
  await expect(page.getByText('1.0.0').first()).toBeVisible()
})
```

- [ ] **Step 2: Write `e2e/regions.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

// Region polygons render as SVG paths in the Leaflet overlay pane. They are on
// by default (see MapPage's showRegions initial state).

test('region polygons are drawn on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  const paths = page.locator('.leaflet-overlay-pane svg path')
  await expect(paths.first()).toBeVisible({ timeout: 15_000 })
  expect(await paths.count()).toBeGreaterThan(20)
})

test('toggling the region control removes the polygons', async ({ page }) => {
  await page.goto('/')
  const paths = page.locator('.leaflet-overlay-pane svg path')
  await expect(paths.first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Show regions' }).click()
  await expect(paths).toHaveCount(0, { timeout: 10_000 })
})

test('every drawn polygon stays inside the 6080px canvas', async ({ page }) => {
  // A calibration error large enough to push regions off the tile grid would
  // show here as coordinates outside 0..6080 in DATA space.
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane svg path').first()).toBeVisible({ timeout: 15_000 })
  const bad = await page.evaluate(async () => {
    const r = await fetch('/data/regions/Vardoran.json')
    const { regions } = (await r.json()) as { regions: { borders: number[][][] }[] }
    let count = 0
    for (const region of regions) {
      for (const ring of region.borders) {
        for (const [x, y] of ring) {
          if (x < -1 || y < -1 || x > 6081 || y > 6081) count++
        }
      }
    }
    return count
  })
  expect(bad).toBe(0)
})
```

- [ ] **Step 3: Verify the test-id selectors the specs depend on actually exist**

Two selectors are borrowed from palworld's suite and must be confirmed against the shared packages, not assumed:

```bash
cd .claude/worktrees/vrising-app/frontend
grep -n "subtype-toggle\|lang-menu\|lang-\${" packages/map-shell/src/FilterPanel.tsx packages/map-shell/src/ShellTopBar.tsx
```
Expected: `data-testid={\`subtype-toggle-${...}\`}` in `FilterPanel.tsx` and `lang-menu` / `lang-${code}` in `ShellTopBar.tsx`. If a name differs, fix the **spec**, not the package.

Also confirm the region-line test id used by the popup:

```bash
grep -rn "marker-region" apps/vrising/src
```
Expected: one hit in `src/features/map/popup.tsx`.

- [ ] **Step 4: Run the suite**

```bash
cd .claude/worktrees/vrising-app/frontend && pnpm e2e:vrising
```
Expected: 11 passed (8 smoke + 3 regions). Playwright starts its own dev server on 5190; a server already running on 5190 is reused.

If the "Show regions" button lookup fails, the accessible name comes from the locale — run with the default `en-US`, which Playwright's fresh profile uses, or select by test id instead.

- [ ] **Step 5: Confirm the whole repo is green before moving on**

```bash
cd .claude/worktrees/vrising-app/frontend
pnpm test && pnpm check:engine && pnpm check:shell && node scripts/changelog-verify.mjs
cd ../tools && uv run pytest -q
```
Expected: vitest all green; no output from either `check:*`; four `ok` lines from `changelog-verify`; pytest all green.

Two known pre-existing failures elsewhere in the repo are **not** caused by this work and must not be "fixed" here: palworld's ko-KR smoke test and its dungeons "Hard · bonus" case, and aion2's embedded-map POI case. Only run the other apps' e2e suites if you need to confirm you did not regress them.

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/vrising-app
git add frontend/apps/vrising/e2e
git commit -m "test(vrising): e2e coverage for tiles, markers, filters, regions and locales"
```

---

## Task 13: Changelog, docs, and integration

**Files:**
- Modify: `frontend/apps/vrising/src/changelog.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Re-point the launch entry at the real launch commit**

Task 2 seeded `1.0.0` with the branch-point SHA so every intermediate commit typechecked and `changelog-verify` stayed green. The entry must now pin the commit that actually shipped the map — Task 11's commit, which is the last user-visible one.

```bash
cd .claude/worktrees/vrising-app
git log --oneline -8
git rev-parse $(git log --format=%H --grep="render the Vardoran map" -1)
```

Put that 40-char SHA into `entries[0].commit` in `frontend/apps/vrising/src/changelog.json`, and set `date` to today. Leave the version at `1.0.0` and the three locale strings as written — a new app's first release is a `MAJOR` per the repo rule (aion2's `1.0.0` was the Phase-2 rebuild; a brand-new site is the same class of event).

- [ ] **Step 2: Verify the changelog before committing it**

```bash
cd .claude/worktrees/vrising-app/frontend
pnpm test -- changelog && node scripts/changelog-verify.mjs
```
Expected: the vrising changelog suite passes (3 tests) and `changelog-verify: vrising ok (1 versions)`.

- [ ] **Step 3: Commit the changelog on its own**

The entry pins the SHA of the commit it describes, so it physically cannot live in that commit. This separate commit is required, not stylistic.

```bash
cd .claude/worktrees/vrising-app
git add frontend/apps/vrising/src/changelog.json
git commit -m "docs(vrising): release 1.0.0"
```

- [ ] **Step 4: Update `CLAUDE.md`**

Four edits, all mechanical:

1. Layout — `frontend/`: `apps/` (aion2, palworld, sts2, **vrising**).
2. Layout — `tools/`: `apps/` (aion2, palworld, sts2, **vrising** pipelines).
3. Separate artifact repos: add `resource-vrising` to the `resource/` line and `data-vrising` to the `data/` line.
4. Dev server ports: append `, vrising → http://localhost:15176`.

Then add a short subsection after the existing AION2 coordinate-transform section:

```markdown
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
bare GUID and the 229 real names sit in `.entityheader` subscene names (a later `unex` phase),
so regions ship labelled by `AccessID` and nothing is invented.
```

- [ ] **Step 5: Commit the docs**

```bash
cd .claude/worktrees/vrising-app
git add CLAUDE.md
git commit -m "docs: register the vrising app, its artifacts, port and calibration"
```

- [ ] **Step 6: Final full verification in the worktree**

```bash
cd .claude/worktrees/vrising-app/frontend
pnpm --filter vrising build && pnpm --filter vrising lint
pnpm test && pnpm check:engine && pnpm check:shell && pnpm check:engine-gl
node scripts/changelog-verify.mjs
pnpm validate-data E:/arkive-games/data-vrising
cd ../tools && uv run pytest -q
```
Expected: every command exits 0. Do not proceed to integration with anything red.

- [ ] **Step 7: Integrate back onto master with a rebase**

`CLAUDE.md` requires rebase, not a merge commit.

```bash
cd E:/arkive-games/arkive
git fetch origin
git rebase master <worktree-branch>   # or: git checkout master && git rebase <worktree-branch>
```

**A rebase rewrites the SHAs**, which orphans the changelog entry from Step 1 — the JSON still validates and the tests still pass, but the GitHub compare link 404s once pushed. So immediately after:

```bash
cd E:/arkive-games/arkive/frontend && node scripts/changelog-verify.mjs
```
If it reports an unreachable commit for vrising, find the rewritten SHA of the map commit (`git log --format=%H --grep="render the Vardoran map" -1`), update `entries[0].commit`, re-run the verifier, and amend or add a fixup commit.

- [ ] **Step 8: Commit the artifact repos**

They are separate repos, so they need their own commits. Do this after the transform is accepted — never publish an unreviewed calibration.

```bash
cd E:/arkive-games/data-vrising
git add . && git commit -m "feat: initial Vardoran dataset (372 regions, contract v1)"
cd E:/arkive-games/resource-vrising
git add . && git commit -m "feat: initial Vardoran tiles (5x5 1216px) and map icons"
```

- [ ] **Step 9: Live-test the merged result**

Per `CLAUDE.md`, live testing happens **after** the rebase back to master, on the real workspace:

```bash
cd E:/arkive-games/arkive/frontend && pnpm dev:vrising
```
Open `http://localhost:15176` and repeat Task 11's Step 10 checklist. Then remove the worktree with `ExitWorktree` (`action: "remove"`). On Windows a `TaskStop`ped dev server can leave an orphan `node` child holding the directory open — if removal fails, find and `taskkill` that PID first.

- [ ] **Step 10: Exit the worktree**

Use `ExitWorktree` with `action: "remove"` once the branch is rebased into master and the live check passed.

---

## Deferred — deliberately not in this plan

- **Region names.** Blocked on `unex`'s `.entityheader` phase. When it lands: join the 229 subscene names to `AccessID`s, emit real names in `regions/<Map>.json` and the locale namespaces, and upgrade Task 8's mechanical three-region eyeball check into named-landmark spot checks (the Colosseum ring and the Farbane quarry are distinctive enough to verify the transform to a few pixels).
- **Real POI markers.** Cave entrances, waygates, traders, soul-shard bosses and V Blood carriers all have icons already converted to `resource-vrising/icons/` by Task 6, but no coordinates are extractable without DOTS entity parsing. Adding them later is a `types.yaml` change plus an extract stage — no frontend work.
- **The `meta` landing-page card.** `apps/meta/src/sites.ts` currently lists only aion2 and palworld; sts2 is missing too. Adding vrising alone would leave that list inconsistent, so both cards belong in one follow-up chore.
- **`frontend/edgeone.json`.** It is shared by all sites and already rewrites `/changelog` and `/changelog*` to `/index.html`, which covers both of vrising's routes. No change needed — verify with `grep -n changelog frontend/edgeone.json` rather than editing it.
- **The WebGL engine.** `@gamemap/map-engine-gl` is palworld's default renderer. vrising ships Leaflet only: 372 markers is nowhere near the point where the canvas renderer pays for its ~1.5 MB of three.js.
