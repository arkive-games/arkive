# Shared Map-Engine Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract palworld's map-engine switcher into shared packages and adopt it in vrising, with the WebGL (three.js) engine as the default for both.

**Architecture:** Choice logic moves to `@gamemap/map-shell` with an **injected storage adapter**, following the existing `map-shell/src/mapViewMemory.ts` precedent exactly. The presentational dropdown moves to `@gamemap/ui`, taking `value`/`onChange`/`label` props. Each app keeps only thin wiring: its own storage key, its own i18n label, and its own router URL sync. No purity check is relaxed.

**Tech Stack:** React 19, TypeScript, Vitest, pnpm workspace.

---

## Why the split is shaped this way

`check:shell` fails the build if `packages/map-shell/src` contains any of:

```
i18next | useTranslation | react-router | import.meta.env | localStorage | fetch( | @/
```

palworld's current `apps/palworld/src/lib/mapEngineChoice.ts` violates two (`localStorage`, `@tanstack/react-router`) and `apps/palworld/src/components/EngineToggle.tsx` violates one (`useTranslation`). So the shared layer must take storage, navigation and labels as inputs. `packages/map-shell/src/mapViewMemory.ts` already does exactly this for per-map camera memory — **read it first and copy its adapter shape.**

`@gamemap/ui` has no purity check and already hosts shared presentational components over Radix/shadcn primitives, so the dropdown belongs there.

## File structure

| file | change |
|---|---|
| `frontend/packages/map-shell/src/mapEngineChoice.ts` | **new** — engine ids, labels, default, pure precedence, store factory taking a storage adapter |
| `frontend/packages/map-shell/src/mapEngineChoice.test.ts` | **new** — ported from palworld's 161-line test, adapted to the factory |
| `frontend/packages/map-shell/src/index.ts` | export the above |
| `frontend/packages/ui/src/EngineToggle.tsx` | **new** — presentational, ported from palworld's version with `label` injected |
| `frontend/packages/ui/src/index.ts` | export `EngineToggle` |
| `frontend/apps/palworld/src/lib/mapEngineChoice.ts` | shrink to app wiring: its storage key + the router URL sync hook |
| `frontend/apps/palworld/src/components/EngineToggle.tsx` | **delete** — re-exported from `@gamemap/ui` |
| `frontend/apps/palworld/src/{App,components/BottomTabBar,components/TopNav}.tsx` | update imports |
| `frontend/apps/vrising/package.json` | add `@gamemap/map-engine-gl` |
| `frontend/apps/vrising/src/main.tsx` | import `engine-gl.css` |
| `frontend/apps/vrising/src/features/map/GlMapView.tsx` | **new** — port palworld's 20-line version |
| `frontend/apps/vrising/src/lib/mapEngineChoice.ts` | **new** — app wiring, key `vrising.map.engine` |
| `frontend/apps/vrising/src/features/map/MapPage.tsx` | branch on the resolved engine |
| `frontend/apps/vrising/src/components/TopNav.tsx` | mount `EngineToggle` |
| `frontend/apps/vrising/src/locales/{en-US,zh-CN,zh-TW}.json` | add `engineMenu` |

---

## Task 1: Shared choice logic in map-shell

**Files:** create `packages/map-shell/src/mapEngineChoice.ts` + `.test.ts`; modify `packages/map-shell/src/index.ts`

- [ ] **Step 1: Read the three sources**

Read, in order: `packages/map-shell/src/mapViewMemory.ts` (the adapter precedent to copy), `apps/palworld/src/lib/mapEngineChoice.ts` (the logic to port — keep its doc comments, they explain non-obvious decisions), and `apps/palworld/src/lib/mapEngineChoice.test.ts` (the tests to port).

- [ ] **Step 2: Write the failing test**

Port palworld's test file. Replace every direct `localStorage` interaction with an in-memory adapter, exactly as `mapViewMemory.test.ts` does. Cover at minimum:
- `isMapEngineChoice` accepts `'gl'`/`'leaflet'`, rejects anything else
- `DEFAULT_MAP_ENGINE === 'gl'`
- `resolveMapEngine(param, stored)`: a valid param wins; an invalid or absent param falls through to `stored`
- store: reads through the adapter on first snapshot; a redundant `set` does not notify; `set` updates the snapshot **before** writing, so a throwing adapter still moves the UI
- store: a throwing adapter on read degrades to `DEFAULT_MAP_ENGINE` rather than propagating

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd frontend && pnpm vitest run packages/map-shell/src/mapEngineChoice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Port the logic with these changes and nothing else:
- Delete the `localStorage` reads/writes and the `MAP_ENGINE_KEY` constant. Export a factory — `createMapEngineStore(adapter: { read(): string | null; write(value: string): void })` — returning `{ getSnapshot, set, subscribe, useStoredMapEngine }`. The **app** owns the key. Swallow adapter errors inside the factory so apps may pass bare adapters (this is `mapViewMemory.ts`'s stated contract).
- Drop `useChooseMapEngine` entirely — it is router-coupled and stays in the apps.
- Keep `MapEngineChoice`, `DEFAULT_MAP_ENGINE = 'gl'`, `MAP_ENGINE_CHOICES`, `MAP_ENGINE_LABELS`, `isMapEngineChoice`, `resolveMapEngine` verbatim, including the comment explaining why the labels are constants rather than i18n keys.

- [ ] **Step 5: Confirm green and pure**

Run: `pnpm vitest run packages/map-shell/src/mapEngineChoice.test.ts` → PASS.
Run: `pnpm check:shell` → **exit 0**. If it fails it will print the offending line; that means a forbidden token survived the port.

- [ ] **Step 6: Commit**

```bash
git add frontend/packages/map-shell/src/mapEngineChoice.ts frontend/packages/map-shell/src/mapEngineChoice.test.ts frontend/packages/map-shell/src/index.ts
git commit -m "feat(map-shell): shared map-engine choice logic with an injected storage adapter"
```

---

## Task 2: Shared EngineToggle in ui

**Files:** create `packages/ui/src/EngineToggle.tsx`; modify `packages/ui/src/index.ts`

- [ ] **Step 1: Implement**

Port `apps/palworld/src/components/EngineToggle.tsx` verbatim except: remove the `useTranslation` import and the `const label = t('engineMenu')` line, and add `label: string` to `EngineToggleProps`. Import `MAP_ENGINE_CHOICES`/`MAP_ENGINE_LABELS`/`MapEngineChoice` from `@gamemap/map-shell` instead of the app-relative path. Keep `data-testid="engine-menu"` — palworld's e2e specs depend on it. Keep the `Cpu` glyph and the ghost icon `Button` shape so it still reads as part of the language/theme cluster.

- [ ] **Step 2: Verify it builds and nothing regressed**

Run: `cd frontend && pnpm --filter @gamemap/ui exec tsc -b` → exit 0.
Run: `pnpm check:engine && pnpm check:engine-gl && pnpm check:shell` → all exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/ui/src/EngineToggle.tsx frontend/packages/ui/src/index.ts
git commit -m "feat(ui): shared EngineToggle dropdown with an injected label"
```

---

## Task 3: Refactor palworld onto the shared switcher

This must be behaviour-preserving. palworld already defaults to GL, already persists under `palworld.map.engine`, and its e2e specs pin engines via `?engine=`.

**Files:** modify `apps/palworld/src/lib/mapEngineChoice.ts`, `apps/palworld/src/App.tsx`, `apps/palworld/src/components/BottomTabBar.tsx`, `apps/palworld/src/components/TopNav.tsx`; delete `apps/palworld/src/components/EngineToggle.tsx`

- [ ] **Step 1: Shrink the app module**

`apps/palworld/src/lib/mapEngineChoice.ts` keeps only: the `palworld.map.engine` key, a `localStorage`-backed adapter passed to `createMapEngineStore`, the resulting store/hook, `useChooseMapEngine` (unchanged — it owns the router URL sync), and re-exports of the shared symbols so existing import sites keep working. **Keep the doc comment explaining why `useChooseMapEngine` is driven by the pick event rather than by a store change** — it records a decision that was verified by hand.

- [ ] **Step 2: Point the toggle at the shared component**

Delete `apps/palworld/src/components/EngineToggle.tsx`. Update its import sites to `import { EngineToggle } from '@gamemap/ui'` and pass `label={t('engineMenu')}` at each site.

- [ ] **Step 3: Verify palworld is unchanged in behaviour**

Run and paste output:
```bash
cd frontend
pnpm --filter palworld exec tsc -b
pnpm --filter palworld lint
pnpm vitest run apps/palworld
pnpm e2e:palworld
```
The e2e run is the real gate — it exercises the switcher and `?engine=`. Known-baseline failures you must NOT chase: the `ko-KR` smoke spec (a `팰 출현 지점` string that exists nowhere) and a dungeons `Hard · bonus` case. **63 passed plus those 2 is green.** If anything else fails, you broke it.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src frontend/packages
git commit -m "refactor(palworld): adopt the shared engine switcher"
```

---

## Task 4: Adopt the switcher in vrising, GL by default

**Files:** modify `apps/vrising/package.json`, `src/main.tsx`, `src/features/map/MapPage.tsx`, `src/components/TopNav.tsx`, `src/locales/*.json`; create `src/features/map/GlMapView.tsx`, `src/lib/mapEngineChoice.ts`

- [ ] **Step 1: Add the dependency and stylesheet**

Add `"@gamemap/map-engine-gl": "workspace:*"` to `apps/vrising/package.json`, run `pnpm install`, and import `@gamemap/map-engine-gl/engine-gl.css` in `src/main.tsx` alongside the existing `@gamemap/map-engine/engine.css`.

- [ ] **Step 2: Port GlMapView and the app wiring**

Copy `apps/palworld/src/features/map/GlMapView.tsx` (20 lines) to vrising, adjusting import paths. Create `apps/vrising/src/lib/mapEngineChoice.ts` mirroring palworld's post-refactor module but with the key `vrising.map.engine`.

- [ ] **Step 3: Branch MapPage on the resolved engine**

In `MapPage.tsx`, resolve the engine with `resolveMapEngine(searchParam, useStoredMapEngine())` and render `GlMapView` or `GameMapView` accordingly. Keep every existing prop identical between the two branches so switching cannot change behaviour. Add `engineMenu` to all three locale files (`en-US`, `zh-CN`, `zh-TW`) and mount `<EngineToggle>` in `TopNav.tsx` beside the language and theme controls.

- [ ] **Step 4: Verify, including visually**

Run and paste output:
```bash
cd frontend
pnpm --filter vrising exec tsc -b
pnpm --filter vrising lint
pnpm check:engine && pnpm check:engine-gl && pnpm check:shell
pnpm vitest run apps/vrising
pnpm e2e:vrising
```

Then **actually look at it**. A dev server for master is already running on **15176** — do not fight it. Start the worktree copy on a different port: `pnpm --filter vrising dev -- --port 15186`. Load `http://localhost:15186/` and confirm:
- the map renders on the **GL** engine by default (no `?engine=`), with tiles, 372 markers and region overlays
- the `engine-menu` dropdown lists both engines and switching to Leaflet re-renders correctly
- `?engine=leaflet` forces Leaflet, and picking an engine while a param is present updates the URL
- reloading preserves the stored choice

Report what you actually see. **Note the tile situation honestly:** vrising ships single-level tiles (5×5 at 1216 px, no pyramid), so the full map is ~141 MB decoded. If GL is visibly slower or heavier than Leaflet here, say so — that is a real finding, not a failure to hide.

Kill the dev server on 15186 when done and confirm the port is free. On Windows a stopped task can orphan a node process; `taskkill //PID <pid> //F` if needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/vrising frontend/pnpm-lock.yaml
git commit -m "feat(vrising): engine switcher with the WebGL renderer by default"
```

---

## Task 5: Changelog entries

Both apps gain a user-visible change, so both get an entry — **after** the feature commits, since an entry pins the SHA of the commit it describes and a commit cannot contain its own SHA.

- [ ] **Step 1: Add both entries**

From `frontend/`, using the real SHAs of the Task 3 and Task 4 commits:

```bash
pnpm changelog:add --app vrising --bump minor --kind feature \
  --commit <task-4-sha> \
  --en "Choose between the WebGL and Leaflet map renderers; WebGL is now the default." \
  --zh-cn "可在 WebGL 与 Leaflet 地图渲染器之间切换，现默认使用 WebGL。" \
  --zh-tw "可在 WebGL 與 Leaflet 地圖渲染器之間切換，現預設使用 WebGL。"
```

palworld's change is internal (the switcher moved packages; behaviour is identical), so **it gets no entry** — the convention reserves entries for what a visitor would notice.

- [ ] **Step 2: Verify**

Run: `node scripts/changelog-verify.mjs` → all four apps ok.
Run: `pnpm test` → green.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/vrising/src/changelog.json
git commit -m "docs(vrising): release 1.1.0"
```

---

## Task 6: Integrate

- [ ] **Step 1: Rebase onto LOCAL master**

Local `master` is well ahead of `origin/master` and carries unpushed work. From the worktree: `git rebase master`. **Never rebase onto `origin/master`** — it would silently drop those commits.

- [ ] **Step 2: Re-point the changelog SHA**

The rebase rewrote the feature commit, orphaning the SHA the entry recorded. Run `node frontend/scripts/changelog-verify.mjs`, then re-point the newest vrising entry at its rewritten SHA and amend. The JSON validates either way, so this is not caught by tests — the symptom is a compare link that 404s once pushed.

- [ ] **Step 3: Fast-forward master and re-verify**

From `E:/arkive-games/arkive`: `git merge --ff-only engine-switch-shared`. Then re-run `pnpm test`, `pnpm check:shell`, `pnpm check:engine`, `pnpm check:engine-gl` and `node frontend/scripts/changelog-verify.mjs` on the integrated tree.

- [ ] **Step 4: Do NOT push**

Pushing to the shared remotes is the user's decision. Stop here and report.
