# Palworld Completable Effigy & Boss Markers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players mark effigy and boss markers as completed on the Palworld map, persisted locally, with an `X/N` progress badge in the filter panel.

**Architecture:** The tools flag boss (`fieldBoss`, `wanted`, `predator`) and effigy (`lifmunkEffigy` + generated per-pal) subtypes with the existing data-contract field `canComplete`; the palworld app adds a small localStorage-backed completion store and wires the already-built map-engine rendering (dim + green check), a popup pill (copied from aion2), and the map-shell FilterPanel `badge`.

**Tech Stack:** Python (uv/pytest) tools pipeline; React 19 + Vite frontend; vitest (node env, workspace config at `frontend/vitest.config.ts`); Playwright e2e (own dev server on port 5188).

**Spec:** `docs/superpowers/specs/2026-07-11-palworld-completable-markers-design.md`

**Workspace notes for the executor:**
- Work in a git worktree (superpowers:using-git-worktrees), merge back with rebase.
- `tools/.env` is gitignored — copy it into the worktree before running the pipeline:
  `cp E:/arkive-games/arkive/tools/.env <worktree>/tools/.env`
- `data-palworld` is a **separate sibling repo** (path in `PALWORLD_DATA_OUT` inside `tools/.env`); its regen commit is independent of the monorepo merge.
- The Vite dev middleware finds `data-palworld`/`resource-palworld` by walking ancestor dirs, so dev/e2e work from inside a worktree too.
- Run vitest from `frontend/` (`pnpm test`); run Python tests from `tools/`.

---

### Task 1: Tools — emit `canComplete` on boss & effigy subtypes

**Files:**
- Modify: `tools/apps/palworld/data_src/types.yaml` (subtype entries `fieldBoss`, `wanted`, `predator`, `lifmunkEffigy`)
- Modify: `tools/apps/palworld/maps/emit.py` (types.json row build ~line 199–215; effigy subtype dict ~line 163)
- Test: `tools/apps/palworld/tests/test_emit.py`, `tools/apps/palworld/tests/test_effigy.py`

- [ ] **Step 1: Write the failing tests**

Append to `tools/apps/palworld/tests/test_emit.py` (module already has the `ds` fixture built from `PARSED`; the real `data_src/types.yaml` is loaded inside `build_dataset`, so hand-authored flags flow through):

```python
def _subtype_row(ds, cat_id, sub_id):
    cat = next(c for c in ds["types"]["categories"] if c["id"] == cat_id)
    return next(s for s in cat["subtypes"] if s["id"] == sub_id)


def test_boss_and_lifmunk_effigy_subtypes_are_completable(ds):
    # Boss encounters and effigy pickups are one-time: the taxonomy flags them
    # canComplete so the frontend offers completion tracking.
    for sub_id in ("fieldBoss", "wanted", "predator"):
        assert _subtype_row(ds, "boss", sub_id).get("canComplete") is True
    assert _subtype_row(ds, "effigy", "lifmunkEffigy").get("canComplete") is True


def test_non_completable_subtypes_omit_the_flag(ds):
    # Emit-only-when-true, like defaultActive: repeatable markers carry no key.
    assert "canComplete" not in _subtype_row(ds, "location", "fastTravel")
    assert "canComplete" not in _subtype_row(ds, "resource", "copper")
```

Append to `tools/apps/palworld/tests/test_effigy.py` (uses its own `ds` fixture with `effigySheepBall`/`effigyPinkCat`):

```python
def test_generated_pal_effigies_are_completable(ds):
    effigy = next(c for c in ds["types"]["categories"] if c["id"] == "effigy")
    subs = {s["id"]: s for s in effigy["subtypes"]}
    assert subs["effigySheepBall"].get("canComplete") is True
    assert subs["effigyPinkCat"].get("canComplete") is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd E:/arkive-games/arkive/tools && uv run pytest apps/palworld/tests/test_emit.py apps/palworld/tests/test_effigy.py -v`
Expected: the three new tests FAIL (`canComplete` missing); all pre-existing tests PASS.

- [ ] **Step 3: Flag the hand-authored subtypes in types.yaml**

In `tools/apps/palworld/data_src/types.yaml`, add `canComplete: true` to exactly these four subtype entries (one line each, next to the existing `category:` line):

```yaml
  - id: fieldBoss
    category: boss
    canComplete: true
    ...
  - id: wanted
    category: boss
    canComplete: true
    ...
  - id: predator
    category: boss
    canComplete: true
    ...
  - id: lifmunkEffigy
    category: effigy
    canComplete: true
    ...
```

- [ ] **Step 4: Pass the flag through in emit.py**

In `tools/apps/palworld/maps/emit.py`:

(a) In the generated per-pal effigy subtype dict (the `effigy_subtypes.append({...})` around line 163), add the flag — effigies are one-time pickups:

```python
        effigy_subtypes.append({
            "id": sid, "category": "effigy", "effigyPal": pal, "canComplete": True,
            # The relic item icon (falls back to the pal icon if unresolved).
            "icon": effigy_icons.get(sid) or _pal_icon(pal_icons, pal),
            "names": names,
            "descriptions": descriptions,
        })
```

(b) In the types.json row build (immediately after the `defaultActive` block around line 213–214), emit only when true, same pattern:

```python
            if s.get("canComplete"):
                row["canComplete"] = True
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd E:/arkive-games/arkive/tools && uv run pytest apps/palworld/tests -v`
Expected: ALL PASS (including the three new tests).

- [ ] **Step 6: Commit**

```bash
git add tools/apps/palworld/data_src/types.yaml tools/apps/palworld/maps/emit.py tools/apps/palworld/tests/test_emit.py tools/apps/palworld/tests/test_effigy.py
git commit -m "feat(palworld): flag effigy & boss subtypes canComplete"
```

---

### Task 2: Regenerate the data-palworld dataset

**Files:**
- Modify (generated, separate repo): `<PALWORLD_DATA_OUT>/types.json`

- [ ] **Step 1: Ensure env + run emit**

`tools/.env` must exist in the checkout you run from (copy from the main checkout if in a worktree). Then:

Run: `cd <checkout>/tools && uv run python -m palworld.maps emit`
Expected: completes without error (a missing env var raises by design).

- [ ] **Step 2: Verify the flag landed**

Run: `grep -c "canComplete" <PALWORLD_DATA_OUT>/types.json`
Expected: a large count (4 hand-authored + one per generated pal effigy, i.e. > 100).

- [ ] **Step 3: Commit in the data-palworld repo**

```bash
cd <PALWORLD_DATA_OUT>
git add types.json
git commit -m "feat(types): effigy & boss subtypes are completable"
```

(If other files changed unexpectedly, inspect with `git diff` before staging — stage only `types.json` plus files clearly caused by this emit.)

---

### Task 3: Frontend completion store (`completedMarkers.ts`)

**Files:**
- Create: `frontend/apps/palworld/src/lib/completedMarkers.ts`
- Test: `frontend/apps/palworld/src/lib/completedMarkers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/apps/palworld/src/lib/completedMarkers.test.ts`. Vitest runs in a **node** environment (see `frontend/vitest.config.ts`) — there is no DOM `localStorage`, so back it with a Map:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { readCompleted, toggleCompletedId } from './completedMarkers'

// vitest runs in a node environment (no DOM): back localStorage with a Map.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('readCompleted', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('returns an empty set on corrupt JSON', () => {
    store.set('palworld.map.completed.MainWorld', '{not json')
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('drops non-string entries', () => {
    store.set('palworld.map.completed.MainWorld', JSON.stringify(['a', 1, null]))
    expect([...readCompleted('MainWorld')]).toEqual(['a'])
  })
})

describe('toggleCompletedId', () => {
  it('adds an id, persists, and round-trips through readCompleted', () => {
    const next = toggleCompletedId('MainWorld', new Set(), 'MainWorld-fieldBoss-1')
    expect(next.has('MainWorld-fieldBoss-1')).toBe(true)
    expect(readCompleted('MainWorld').has('MainWorld-fieldBoss-1')).toBe(true)
  })

  it('removes an already-present id', () => {
    const once = toggleCompletedId('MainWorld', new Set(), 'x')
    const twice = toggleCompletedId('MainWorld', once, 'x')
    expect(twice.size).toBe(0)
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('does not return the input set object (state-safe)', () => {
    const input = new Set<string>()
    expect(toggleCompletedId('MainWorld', input, 'x')).not.toBe(input)
    expect(input.size).toBe(0)
  })

  it('keeps maps isolated', () => {
    toggleCompletedId('MainWorld', new Set(), 'a')
    expect(readCompleted('WorldTree').size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd E:/arkive-games/arkive/frontend && pnpm test apps/palworld/src/lib/completedMarkers.test.ts`
Expected: FAIL — module `./completedMarkers` not found.

- [ ] **Step 3: Implement the store**

Create `frontend/apps/palworld/src/lib/completedMarkers.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

// Completed marker ids per map (marker ids are the tools' stable
// "<map>-<subtype>-<index>" keys), persisted the same way as the
// visible-subtype selection in App.tsx.
const KEY_PREFIX = 'palworld.map.completed.'

/** Read the persisted completed-marker ids for a map; empty set on any error. */
export function readCompleted(mapId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + mapId)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeCompleted(mapId: string, ids: Set<string>) {
  try {
    localStorage.setItem(KEY_PREFIX + mapId, JSON.stringify([...ids]))
  } catch { /* no storage — feature degrades to non-persistent */ }
}

/** Toggle `id` in `ids`; returns a NEW set and persists it. */
export function toggleCompletedId(mapId: string, ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  writeCompleted(mapId, next)
  return next
}

/** Per-map completed-marker set + toggle, reloading when the map switches. */
export function useCompletedMarkers(mapId: string) {
  const [completed, setCompleted] = useState<Set<string>>(() => readCompleted(mapId))
  useEffect(() => { setCompleted(readCompleted(mapId)) }, [mapId])
  const toggleCompleted = useCallback((id: string) => {
    setCompleted((prev) => toggleCompletedId(mapId, prev, id))
  }, [mapId])
  return { completed, toggleCompleted }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd E:/arkive-games/arkive/frontend && pnpm test apps/palworld/src/lib/completedMarkers.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/palworld/src/lib/completedMarkers.ts frontend/apps/palworld/src/lib/completedMarkers.test.ts
git commit -m "feat(palworld): localStorage completion store for map markers"
```

---

### Task 4: i18n — completion pill labels (17 languages)

**Files:**
- Modify: `frontend/apps/palworld/src/i18n.ts`

- [ ] **Step 1: Add the label tables**

In `frontend/apps/palworld/src/i18n.ts`, after the existing `PALS_GROUP_LABELS` table (~line 179), add:

```ts
// Map popup completion pill (effigies / bosses): action + done states.
export const MARK_COMPLETED_LABELS: Record<Language, string> = {
  'en-US': 'Mark as completed', 'de-DE': 'Als erledigt markieren', 'es-ES': 'Marcar como completado',
  'es-MX': 'Marcar como completado', 'fr-FR': 'Marquer comme terminé', 'id-ID': 'Tandai selesai',
  'it-IT': 'Segna come completato', 'ja-JP': '完了にする', 'ko-KR': '완료로 표시',
  'pl-PL': 'Oznacz jako ukończone', 'pt-BR': 'Marcar como concluído', 'ru-RU': 'Отметить выполненным',
  'th-TH': 'ทำเครื่องหมายว่าเสร็จแล้ว', 'tr-TR': 'Tamamlandı olarak işaretle', 'vi-VN': 'Đánh dấu đã hoàn thành',
  'zh-CN': '标记为已完成', 'zh-TW': '標記為已完成',
}
export const COMPLETED_LABELS: Record<Language, string> = {
  'en-US': 'Completed', 'de-DE': 'Erledigt', 'es-ES': 'Completado', 'es-MX': 'Completado',
  'fr-FR': 'Terminé', 'id-ID': 'Selesai', 'it-IT': 'Completato', 'ja-JP': '完了',
  'ko-KR': '완료', 'pl-PL': 'Ukończono', 'pt-BR': 'Concluído', 'ru-RU': 'Выполнено',
  'th-TH': 'เสร็จแล้ว', 'tr-TR': 'Tamamlandı', 'vi-VN': 'Đã hoàn thành',
  'zh-CN': '已完成', 'zh-TW': '已完成',
}
```

- [ ] **Step 2: Merge them into the resource bundle**

In the `addResourceBundle` object at the bottom of `i18n.ts` (next to `nav:`/`passive:`), add:

```ts
      markerActions: {
        markCompleted: MARK_COMPLETED_LABELS[lng],
        completed: COMPLETED_LABELS[lng],
      },
```

- [ ] **Step 3: Typecheck**

Run: `cd E:/arkive-games/arkive/frontend/apps/palworld && pnpm build`
Expected: `tsc -b && vite build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/i18n.ts
git commit -m "feat(palworld): i18n strings for marker completion pill"
```

---

### Task 5: App wiring — completed flag, popup pill, filter badge

**Files:**
- Modify: `frontend/apps/palworld/src/App.tsx`
- Modify: `frontend/apps/palworld/src/lib/data.ts` (TypesFile subtype row type)

- [ ] **Step 1: Type the new taxonomy field**

In `frontend/apps/palworld/src/lib/data.ts`, extend the `TypesFile` subtype row (line 41) with `canComplete`:

```ts
    subtypes: { id: string; icon?: string; color?: string; iconScale?: number; pinVariant?: MarkerPinVariant; defaultActive?: boolean; canComplete?: boolean }[]
```

(The `...s` spread in `loadStatic` already carries it into `MarkerTypeSubtype`, which declares `canComplete?: boolean`.)

- [ ] **Step 2: Wire the store into App.tsx**

All edits in `frontend/apps/palworld/src/App.tsx`:

(a) Imports — add `Check` to the lucide import, `cn` from `@gamemap/ui`, and the store:

```ts
import { Sheet, SheetContent, SheetHeader, SheetTitle, cn, useIsMobile } from '@gamemap/ui'
import { SlidersHorizontal, Search as SearchIcon, Check } from 'lucide-react'
import { useCompletedMarkers } from './lib/completedMarkers'
```

(b) Inside `App()`, next to the other state (after `const [mapId, setMapId] = ...`):

```ts
  const { completed, toggleCompleted } = useCompletedMarkers(mapId)
```

(c) In the `engineMarkers` memo, replace `completed: false,` with:

```ts
        completed: completed.has(m.id),
```

and add `completed` to the memo's dependency array: `[staticData, markerData, subtypeMetaMap, completed]`.

(d) After the `countBySubtype` memo, add the per-subtype completed counts:

```ts
  // Completed count per subtype on the current map (X in the X/N filter badge).
  const completedBySubtype = useMemo(() => {
    const counts = new Map<string, number>()
    if (!markerData) return counts
    for (const m of markerData.markers) {
      if (completed.has(m.id)) counts.set(m.subtype, (counts.get(m.subtype) ?? 0) + 1)
    }
    return counts
  }, [markerData, completed])
```

(e) In `filterCategories`, replace the subtype row's `count:` line with a badge for completable subtypes (count stays for the rest; pals keep neither):

```ts
            // Completable subtypes show progress (X/N); the rest show a count.
            badge: s.canComplete
              ? `${completedBySubtype.get(s.id) ?? 0}/${countBySubtype.get(s.id) ?? 0}`
              : undefined,
            count: cat.id === 'pal' || s.canComplete ? undefined : (countBySubtype.get(s.id) ?? 0),
```

and extend the memo deps: `[staticData, visible, countBySubtype, completedBySubtype]`.

(f) In `renderPopupContent`, add the completion pill as the last child inside `<MarkerPopupCard>` (after the `isPal` link block), styled like aion2's `MarkerPopupContent` pill:

```tsx
        {marker.subtypeMeta?.canComplete ? (
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              data-testid="marker-complete-toggle"
              onClick={() => toggleCompleted(marker.id)}
              aria-pressed={!!marker.completed}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
                marker.completed
                  ? 'bg-[rgba(85,179,76,0.12)] text-[#55B34C]'
                  : 'border border-[#55B34C] text-[#55B34C] hover:bg-[rgba(85,179,76,0.08)]',
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {marker.completed ? t('markerActions.completed') : t('markerActions.markCompleted')}
            </button>
          </div>
        ) : null}
```

and add `toggleCompleted` to the `renderPopupContent` dependency array: `[staticData, t, mapId, palsBundle, toggleCompleted]`.

- [ ] **Step 3: Typecheck + lint + unit tests**

Run: `cd E:/arkive-games/arkive/frontend/apps/palworld && pnpm build && pnpm lint`
Expected: both succeed.
Run: `cd E:/arkive-games/arkive/frontend && pnpm test`
Expected: all workspace unit tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/App.tsx frontend/apps/palworld/src/lib/data.ts
git commit -m "feat(palworld): effigy & boss markers are completable on the map"
```

---

### Task 6: Playwright e2e

**Files:**
- Create: `frontend/apps/palworld/e2e/completion.spec.ts`

Prereq: Task 2 (regenerated `data-palworld`) — the e2e dev server serves the sibling repo's `types.json`, which must carry `canComplete`.

- [ ] **Step 1: Write the e2e spec**

Create `frontend/apps/palworld/e2e/completion.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// Effigy & boss subtypes are completable: the popup pill toggles a per-map
// completed set persisted in localStorage, and the subtype filter button
// shows an X/N progress badge instead of a plain count.

test('marking a field boss completed flips the pill, badge, and survives reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  // Completable subtypes render a progress badge (starts at 0/N).
  const toggle = page.getByTestId('subtype-toggle-fieldBoss')
  await expect(toggle).toContainText(/0\/\d+/)

  // fieldBoss is not defaultActive — enable it. Boss markers are circular pal
  // portraits (…_icon_normal); pal spawns are hidden by default, so the first
  // portrait marker is a boss.
  await toggle.click()
  const boss = page
    .locator('.leaflet-marker-pane .leaflet-marker-icon img[src*="_icon_normal"]')
    .first()
  await expect(boss).toBeVisible({ timeout: 15_000 })
  await boss.click()

  const pill = page.getByTestId('marker-complete-toggle')
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText(/1\/\d+/)

  // Persistence: the badge is computed from localStorage + marker data, so it
  // shows 1/N again after a reload even before re-enabling the subtype.
  await page.reload()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByTestId('subtype-toggle-fieldBoss')).toContainText(/1\/\d+/, { timeout: 15_000 })
})

test('non-completable subtypes keep a plain count (no slash)', async ({ page }) => {
  await page.goto('/')
  const ft = page.getByTestId('subtype-toggle-fastTravel')
  await expect(ft).toBeVisible()
  await expect(ft).not.toContainText('/')
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `cd E:/arkive-games/arkive/frontend/apps/palworld && pnpm e2e`
Expected: the two new tests PASS. Known pre-existing failure: the ko-KR
language smoke test fails deterministically (memory: predates this work) —
do not chase it; every other test should pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/e2e/completion.spec.ts
git commit -m "test(palworld): e2e for completable boss markers"
```

---

### Task 7: Verify, merge back, live-test

- [ ] **Step 1: Full verification in the worktree**

```bash
cd <worktree>/tools && uv run pytest apps/palworld/tests -q
cd <worktree>/frontend && pnpm test
cd <worktree>/frontend/apps/palworld && pnpm build && pnpm lint && pnpm e2e
```
Expected: all pass (modulo the known ko-KR e2e failure).

- [ ] **Step 2: Merge back with rebase (workspace convention)**

Use superpowers:finishing-a-development-branch. Convention: rebase onto
`master`, no merge commits; stage explicit paths only (the user edits files
mid-session — never `git add -A`).

- [ ] **Step 3: Live test**

Probe the fixed palworld dev port first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:15174`.
If it responds, open `http://localhost:15174`, enable Field Boss / an effigy
subtype, mark a marker completed, and confirm: pill flips to "Completed",
marker dims with a green check, filter badge increments, reload persists.
If nothing responds, report that the dev server needs starting instead of
starting one unasked.
