# Palworld Pal Size Filter + Size in List Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pal size (`XS`/`S`/`M`/`L`/`XL`) filterable on the `/pals` list page and visible in the table view (new column) and grid view (card corner tag).

**Architecture:** Frontend-only change in `frontend/apps/palworld`. The size facet is derived client-side from the loaded roster (same pattern as the loot filter) — no pipeline or `data-palworld` change. The filter predicate lives in `useFilteredPals.ts`; its pure core is extracted as `filterPals()` so it can be unit-tested. Labels reuse the existing 17-language `pal.stat.size` string; the size codes themselves are language-neutral (the game ships no L10N for them).

**Tech Stack:** React 19 + TypeScript, TanStack Router, i18next, Tailwind, vitest (unit), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-13-palworld-pal-size-filter-design.md`

**Commands** (run from repo root `E:\arkive-games\arkive`):
- Unit tests: `pnpm -C frontend test useFilteredPals` (workspace `test` script = `vitest run`; the arg filters test files)
- All unit tests: `pnpm -C frontend test`
- Typecheck+build: `pnpm -C frontend/apps/palworld build` (`tsc -b && vite build`)
- Lint: `pnpm -C frontend/apps/palworld lint`

---

### Task 1: Filter model — `sizes` in `PalFilter` + pure `filterPals` extraction

**Files:**
- Modify: `frontend/apps/palworld/src/features/pals/useFilteredPals.ts`
- Test (create): `frontend/apps/palworld/src/features/pals/useFilteredPals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/apps/palworld/src/features/pals/useFilteredPals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PalEntry, PalStats } from '../../lib/pals'
import { EMPTY_FILTER, filterPals, isFilterActive } from './useFilteredPals'

const STATS: PalStats = {
  hp: 0, meleeAttack: 0, shotAttack: 0, defense: 0, craftSpeed: 0, stamina: 0,
  foodAmount: 0, maxFullStomach: 0, captureRate: 0, price: 0, maleProbability: 50,
  slowWalkSpeed: 0, walkSpeed: 0, runSpeed: 0, rideSprintSpeed: 0,
  transportSpeed: 0, swimSpeed: 0,
}

let seq = 0
/** A minimal roster entry; only the fields the filter reads vary per test. */
function pal(over: Partial<PalEntry> & { id: string }): PalEntry {
  seq += 1
  return {
    zukanIndex: seq,
    zukanIndexSuffix: '',
    icon: '',
    elements: ['Normal'],
    genus: '',
    size: 'M',
    rarity: 1,
    egg: '',
    nocturnal: false,
    reaction: 'Escape',
    stats: STATS,
    work: {},
    bestWork: 'Handcraft',
    partnerSkill: {},
    activeSkills: [],
    passives: [],
    drops: [],
    summonable: false,
    ...over,
  }
}

const bundleOf = (pals: PalEntry[]) => ({ pals, text: {} })

describe('filterPals — size filter', () => {
  it('keeps only pals whose size is selected (OR within the group)', () => {
    const roster = [
      pal({ id: 'A', size: 'XS' }),
      pal({ id: 'B', size: 'M' }),
      pal({ id: 'C', size: 'XL' }),
    ]
    const out = filterPals(bundleOf(roster), { ...EMPTY_FILTER, sizes: ['XS', 'XL'] })
    expect(out.map((p) => p.id)).toEqual(['A', 'C'])
  })

  it('applies no size filtering when none selected', () => {
    const roster = [pal({ id: 'A', size: 'XS' }), pal({ id: 'B', size: 'L' })]
    expect(filterPals(bundleOf(roster), EMPTY_FILTER)).toHaveLength(2)
  })

  it('ANDs sizes with the other filter groups', () => {
    const roster = [
      pal({ id: 'FireXS', size: 'XS', elements: ['Fire'] }),
      pal({ id: 'FireL', size: 'L', elements: ['Fire'] }),
      pal({ id: 'WaterXS', size: 'XS', elements: ['Water'] }),
    ]
    const out = filterPals(bundleOf(roster), {
      ...EMPTY_FILTER,
      sizes: ['XS'],
      elements: ['Fire'],
    })
    expect(out.map((p) => p.id)).toEqual(['FireXS'])
  })

  it('counts sizes toward isFilterActive', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, sizes: ['M'] })).toBe(true)
  })

  it('keeps pre-sizes stored filters valid via the EMPTY_FILTER merge', () => {
    // Simulates PalListPage.readStoredFilter: an old stored object without
    // `sizes`, spread onto EMPTY_FILTER, must yield a usable filter.
    const legacy = {
      query: '', elements: [], works: [], reactions: [], nocturnal: false, loot: null,
    }
    const merged = { ...EMPTY_FILTER, ...legacy }
    expect(merged.sizes).toEqual([])
    expect(isFilterActive(merged)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C frontend test useFilteredPals`
Expected: FAIL — `useFilteredPals.ts` has no export `filterPals`, and `PalFilter` has no `sizes` (type + runtime errors).

- [ ] **Step 3: Implement — add `sizes`, extract `filterPals`**

Replace the full contents of `frontend/apps/palworld/src/features/pals/useFilteredPals.ts` with:

```ts
import { useMemo } from 'react'
import type { Element, PalEntry, PalsBundle, WorkType } from '../../lib/pals'

/** Pals-list filter state. Elements & work are AND (a pal must match every
 *  selected one); reactions and sizes are OR (a pal has exactly one of each). */
export interface PalFilter {
  query: string
  elements: Element[]
  works: WorkType[]
  reactions: string[]
  sizes: string[]
  nocturnal: boolean
  loot: string | null
}

export const EMPTY_FILTER: PalFilter = {
  query: '',
  elements: [],
  works: [],
  reactions: [],
  sizes: [],
  nocturnal: false,
  loot: null,
}

export function isFilterActive(f: PalFilter): boolean {
  return Boolean(
    f.query || f.elements.length || f.works.length || f.reactions.length ||
      f.sizes.length || f.nocturnal || f.loot,
  )
}

/** Toggle a value in an array (add if absent, remove if present). */
export function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

/** Filter + sort the roster (pure core of {@link useFilteredPals}). When a work
 *  filter is active, results are sorted by the max suitability level among the
 *  selected work types (desc); otherwise by Paldeck order. */
export function filterPals(bundle: Pick<PalsBundle, 'pals' | 'text'>, f: PalFilter): PalEntry[] {
  const q = f.query.trim().toLowerCase()
  const digits = q.replace(/^no\.?/, '').replace(/^0+/, '')
  const out = bundle.pals.filter((p) => {
    if (q) {
      const name = (bundle.text[p.id]?.name ?? p.id).toLowerCase()
      const idMatch = /^\d+$/.test(digits) && String(p.zukanIndex) === digits
      if (!name.includes(q) && !idMatch) return false
    }
    if (f.elements.length && !f.elements.every((e) => p.elements.includes(e))) return false
    if (f.works.length && !f.works.every((w) => p.work[w] != null)) return false
    if (f.reactions.length && !f.reactions.includes(p.reaction)) return false
    if (f.sizes.length && !f.sizes.includes(p.size)) return false
    if (f.nocturnal && !p.nocturnal) return false
    if (f.loot && !p.drops.some((d) => d.item === f.loot)) return false
    return true
  })
  const byIndex = (a: PalEntry, b: PalEntry) =>
    a.zukanIndex - b.zukanIndex || a.zukanIndexSuffix.localeCompare(b.zukanIndexSuffix)
  if (f.works.length) {
    const maxLvl = (p: PalEntry) => Math.max(...f.works.map((w) => p.work[w] ?? 0))
    return [...out].sort((a, b) => maxLvl(b) - maxLvl(a) || byIndex(a, b))
  }
  return [...out].sort(byIndex)
}

export function useFilteredPals(bundle: PalsBundle | null, f: PalFilter): PalEntry[] {
  return useMemo(() => (bundle ? filterPals(bundle, f) : []), [bundle, f])
}
```

Notes:
- The memo dep list collapses to `[bundle, f]` — `PalListPage` always produces a new
  filter object via `setFilter({ ...filter, ... })`, so identity tracking is equivalent
  and stays correct as fields are added.
- No `PalListPage` change is needed for persistence: `readStoredFilter` spreads the
  stored JSON onto `EMPTY_FILTER`, so old stored filters gain `sizes: []`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C frontend test useFilteredPals`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole unit suite (regression)**

Run: `pnpm -C frontend test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/palworld/src/features/pals/useFilteredPals.ts frontend/apps/palworld/src/features/pals/useFilteredPals.test.ts
git commit -m "feat(palworld): size filter model — sizes in PalFilter, pure filterPals core"
```

---

### Task 2: Size chip row in the filter panel

**Files:**
- Modify: `frontend/apps/palworld/src/lib/pals.ts` (add `SIZE_ORDER` after `REACTIONS`, ~line 28)
- Modify: `frontend/apps/palworld/src/features/pals/components/PalFilters.tsx`

- [ ] **Step 1: Add the canonical size order to `lib/pals.ts`**

Insert after the `REACTIONS` block (after `export type Reaction = ...`, line 28):

```ts
/** Pal body size (raw `EPalSizeType` codes, smallest→largest). The game ships no
 *  localized names for these; the codes are shown as-is in every language. */
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'] as const
```

- [ ] **Step 2: Add the chip row to `PalFilters.tsx`**

Three edits:

(a) Import `SIZE_ORDER` — the pals import (line 17) becomes:

```ts
import { SIZE_ORDER, type PalsBundle } from '../../../lib/pals'
```

(b) In the `PalFilters` component, destructure `t` (line 87 currently only takes `i18n`):

```ts
const { t, i18n } = useTranslation()
```

and below the `const { elements, works, reactions } = bundle.filters` line add:

```ts
// Size facet is derived client-side (not in the pipeline's `filters` block):
// canonical order, hiding any size with no pals — same idea as the loot list.
const sizes = useMemo(
  () => SIZE_ORDER.filter((s) => bundle.pals.some((p) => p.size === s)),
  [bundle],
)
```

(c) Insert a new group between the **reactions** group (`{reactions.length ? ... : null}`)
and the **nocturnal** group (`{bundle.filters.nocturnal ? ... : null}`):

```tsx
{sizes.length ? (
  <Group label={t('pal.stat.size')}>
    {sizes.map((s) => (
      <Chip
        key={s}
        active={filter.sizes.includes(s)}
        onClick={() => onChange({ ...filter, sizes: toggle(filter.sizes, s) })}
      >
        {s}
      </Chip>
    ))}
  </Group>
) : null}
```

(d) The clear-filters button's `onClick` (bottom of the component) must also reset sizes:

```ts
onClick={() => onChange({ ...filter, elements: [], works: [], reactions: [], sizes: [], nocturnal: false, loot: null })}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm -C frontend/apps/palworld build && pnpm -C frontend/apps/palworld lint`
Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/palworld/src/lib/pals.ts frontend/apps/palworld/src/features/pals/components/PalFilters.tsx
git commit -m "feat(palworld): size chip row in the pal-list filter panel"
```

---

### Task 3: Size column in the table view

**Files:**
- Modify: `frontend/apps/palworld/src/features/pals/components/PalTable.tsx`

- [ ] **Step 1: Add the column**

Three edits:

(a) In `PalTable`, split the `useTranslation()` call so `t` is available (line 97
currently reads `const fs = filterStrings(useTranslation().i18n.resolvedLanguage ?? 'en-US')`):

```ts
const { t, i18n } = useTranslation()
const fs = filterStrings(i18n.resolvedLanguage ?? 'en-US')
```

(b) In the `<thead>` row, insert before the Rarity header
(`<th className="px-2 py-2 text-center">{fs.col.rarity}</th>`):

```tsx
<th className="px-2 py-2 text-center">{t('pal.stat.size')}</th>
```

(c) In `PalRow`, insert before the Rarity cell
(`<td className="px-2 py-1.5 text-center tabular-nums text-xs text-muted-foreground">{pal.rarity}</td>`):

```tsx
<td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{pal.size || '—'}</td>
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm -C frontend/apps/palworld build && pnpm -C frontend/apps/palworld lint`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/src/features/pals/components/PalTable.tsx
git commit -m "feat(palworld): size column in the pal-list table view"
```

---

### Task 4: Size tag on grid cards

**Files:**
- Modify: `frontend/apps/palworld/src/features/pals/components/PalCard.tsx`

- [ ] **Step 1: Replace the card's top row**

Replace the current pid-only block:

```tsx
{pid ? (
  <span className="w-full truncate text-xs tabular-nums text-muted-foreground">
    {pid.text}
    {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
  </span>
) : null}
```

with a two-ended row — Paldeck number left, size tag right (always visible; the
empty left span keeps the tag right-aligned for uncatalogued pals):

```tsx
<div className="flex w-full items-baseline justify-between gap-1">
  {pid ? (
    <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
      {pid.text}
      {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
    </span>
  ) : (
    <span />
  )}
  {pal.size ? (
    <span className="shrink-0 text-xs text-muted-foreground">{pal.size}</span>
  ) : null}
</div>
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm -C frontend/apps/palworld build && pnpm -C frontend/apps/palworld lint`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/src/features/pals/components/PalCard.tsx
git commit -m "feat(palworld): size tag on pal grid cards"
```

---

### Task 5: Full verification (live)

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `pnpm -C frontend test`
Expected: all PASS.

- [ ] **Step 2: Live check on the dev server**

Probe `http://localhost:15174` first (`curl -s -o /dev/null -w "%{http_code}" http://localhost:15174`); only ask the user to start it if nothing responds. Then in a browser (Playwright tools):

1. Open `http://localhost:15174/pals`. Verify a **Size** chip row (XS S M L XL) sits between Reaction and Sleepless.
2. Click `XL` — the count drops to **28**; every visible card shows the `XL` corner tag.
3. Also click `XS` — count becomes **80** (28+52, OR semantics).
4. Add an element chip (e.g. Dragon) — count shrinks further (AND across groups).
5. Switch to **List** view — Size column appears before Rarity with matching values.
6. **Clear filters** — count returns to the full roster and the size chips deactivate.
7. Reload the page — the size selection persists (localStorage), then clear again.
8. Switch language to 中文(简体) — the group label / column header read **体型**.
9. Open any pal detail page — Details card still shows Size (unchanged).

Expected: all observations as stated; no console errors attributable to this change
(the known `fitBounds` max-update-depth flood is pre-existing — ignore).

- [ ] **Step 3: Note completion**

No commit (nothing changed). Report verification results.
