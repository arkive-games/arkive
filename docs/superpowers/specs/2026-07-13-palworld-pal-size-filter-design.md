# Palworld: Pal Size Filter + Size in List Views — Design

**Date:** 2026-07-13
**Scope:** `frontend/apps/palworld` only (no pipeline / data-artifact changes)

## Goal

Make pal **size** (`XS` / `S` / `M` / `L` / `XL`) filterable on the `/pals` list page and
visible in both list views. The detail page already shows size in its Details card and is
unchanged.

## Background

- `data-palworld/pals.json` already emits `size` per pal (from `EPalSizeType`, stripped by
  the pipeline). Current roster: XS 52, S 54, M 85, L 67, XL 28 — all five values present.
- `PalEntry.size: string` already exists in `frontend/apps/palworld/src/lib/pals.ts`.
- The game ships **no localized labels** for pal sizes (checked `DT_UI_Common_Text*`); the
  codes are language-neutral, so chips/columns show the raw codes — no invented
  translations (per the project L10N rule).
- The `filters` facet block in `pals.json` (elements/works/reactions/nocturnal) does NOT
  include sizes, and we deliberately don't add it there: the frontend derives the facet
  from the loaded roster, the same pattern the loot filter already uses. This avoids a
  cross-repo tools change + `data-palworld` republish for data the client already holds,
  and still hides a chip if a size ever has no pals.

## Changes

### 1. Filter model — `src/features/pals/useFilteredPals.ts`

- Add `sizes: string[]` to `PalFilter` and `EMPTY_FILTER` (`[]`).
- Predicate: `if (f.sizes.length && !f.sizes.includes(p.size)) return false` — a pal has
  exactly one size, so multi-select is **OR** within the group (same as reactions),
  AND-ed with the other groups.
- Include `sizes` in `isFilterActive` and in the memo dependency list.
- Persistence needs no migration: `readStoredFilter` in `PalListPage` merges stored JSON
  onto `EMPTY_FILTER`, so pre-existing stored filters gain `sizes: []`.
- **Refactor for testability:** extract the filter+sort body into an exported pure
  function `filterPals(bundle, f): PalEntry[]`; `useFilteredPals` becomes a thin
  `useMemo(() => filterPals(bundle, f), ...)` wrapper.

### 2. Canonical size order — `src/lib/pals.ts`

- Export `SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'] as const` next to the other enum-order
  constants. The filter UI derives its chip list as
  `SIZE_ORDER.filter(s => roster has s)`.

### 3. Filter UI — `src/features/pals/components/PalFilters.tsx`

- New chip `Group` labeled with `fs.size`, placed between **Reaction** and **Sleepless**.
- Text-only chips (no glyph), labels = raw codes `XS S M L XL`, toggling
  `filter.sizes` via the existing `toggle` helper.
- The clear-filters button also resets `sizes: []`.

### 4. Strings — `src/features/pals/filterStrings.ts`

- Add `size: string` (group label) and `col.size: string` (table header) to
  `FilterStrings`, with hand-authored values for the existing override set:
  - en-US: `Size`, zh-CN: `尺寸`, zh-TW: `尺寸`, ja-JP: `サイズ`, ko-KR: `크기`.

### 5. Table view — `src/features/pals/components/PalTable.tsx`

- New centered `Size` column immediately **before Rarity**: header `fs.col.size`, cell =
  raw code with the same muted/tabular styling as the Rarity cell.

### 6. Grid cards — `src/features/pals/components/PalCard.tsx`

- The card's top row becomes a two-ended flex row: Paldeck number left (as today), a
  small muted size tag (e.g. `XL`, `text-xs text-muted-foreground`) on the right.
  Always visible.

### 7. Detail page

- No change (size already renders in the Details card).

## Testing

- **Unit (vitest):** new `src/features/pals/useFilteredPals.test.ts` against the
  extracted `filterPals`:
  - size OR-semantics (two sizes selected → union),
  - size AND element combination,
  - empty `sizes` = no size filtering,
  - `readStoredFilter`-style merge keeps old stored filters valid (spread onto
    `EMPTY_FILTER`).
- **Live check:** dev server (`http://localhost:15174`) — toggle size chips, verify
  counts, table column, and grid tags in grid + list views and a couple of languages.

## Out of scope

- Pipeline / `data-palworld` changes (no `sizes` facet emitted).
- Detail-page header badge (explicitly not chosen).
- Any size-based sorting.
