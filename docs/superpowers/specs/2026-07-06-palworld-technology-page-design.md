# Palworld Technology Page Redesign

Date: 2026-07-06
Status: Approved (design), pending implementation plan
Scope: `frontend/apps/palworld` — the `/technology` route only

## Goal

Rebuild the Technology page so it reads like the in-game tech screen: a wide
**normal** technology region on the left and a narrow **ancient** technology
region on the right, techs grouped into per-level rows, each tech shown as a
compact tile (image + type badge + name + tech-point cost). Clicking a tile
opens a dialog with the tech's full details.

Reference: the in-game 科技 / 古代科技 screen (two-region split, level rows, tiles
with a type badge on top and a name on the bottom, name search at the bottom).

## Context / current state

- `features/technology/TechnologyPage.tsx` currently renders techs grouped by
  level in a single-column card grid; each card inlines the description and the
  unlocked items/buildings. It does **not** split normal vs. ancient and has no
  tiles/dialog. This file is replaced by the new design.
- Data comes from `technology.json` via `loadTech(lng)` (`lib/catalog.ts`),
  which returns `TechBundle { techs, byId, text }`.
- `TechEntry` fields: `id`, `level` (1–80), `cost`, `isBoss`, `unlockItems[]`,
  `unlockBuildings[]`, optional `requireBoss`, optional `requireTech`.
  588 techs total; 51 have `isBoss: true`.
- Existing building blocks reused as-is: `ItemGlyph`, `BuildingGlyph`,
  `ItemLink`, `BuildingLink` (self-hide on missing asset), `CatalogPageLoading`,
  `CatalogSection`; `Dialog`/`Input` from `@gamemap/ui`; `itemTypeLabel` /
  label strings; icon URL helpers `itemIconUrl` / `buildingIconUrl`.

### Key data mapping (derivations — no schema change)

- **Normal vs. ancient**: `isBoss === false` → normal (left region);
  `isBoss === true` → **ancient** (right region). "古代科技" in-game corresponds
  to the boss/ancient-point track.
- **Tile image**: the tech has no icon of its own. Use the icon of the first
  unlocked entry — prefer `unlockItems[0]` (via `ItemGlyph`), else
  `unlockBuildings[0]` (via `BuildingGlyph`). If neither has an asset, the glyph
  components self-hide and the tile shows a neutral placeholder box.
- **Type badge**: derived. A tech that unlocks any building (and no item) →
  **Structure** (建筑); otherwise → **Item** (道具). Techs unlocking both are
  rare; treat "has any item unlock" as Item, else Structure. A tech unlocking
  nothing (e.g. `Workbench` in the data) → Structure (it gates a build station).
- **No player-progress state**: this is a static encyclopedia. There are no
  locked / "?" placeholder slots and no "points remaining" counter — those are
  per-player in-game and have no data source here.

## Architecture

New/changed files under `features/technology/`:

- `TechnologyPage.tsx` — page shell (TopNav, load bundles, search state, region
  layout). Rewritten.
- `components/TechTile.tsx` — the clickable tile (image + type badge + name +
  cost). Presentational.
- `components/TechDialog.tsx` — the details modal (Dialog) for a selected tech.
- `techModel.ts` — pure helpers: `splitByRegion`, `groupByLevel`,
  `techType(tech) → 'item' | 'structure'`, `techImage(tech) → {kind, icon} | null`,
  `matchesQuery(tech, name, q)`. Unit-testable, no React.

Data flow:

```
loadTech(lng) + loadItems(lng) + loadBuildings(lng)   (already loaded together today)
  → techModel: split normal/ancient, group each by level, apply search filter
  → TechnologyPage renders region headers + level rows of <TechTile>
  → clicking a tile sets selected tech → <TechDialog> renders its details
```

Items and buildings bundles are still loaded (needed for tile icons, unlocked-
entry names, and the dialog's cross-link chips), exactly as the current page
already does.

## Layout

- **Header row (sticky)**: left region titled **科技 / Technology**, right region
  titled **古代科技 / Ancient Technology** with a purple tint, mirroring the game.
- **Per-level rows**: for each level that has ≥1 matching tech, one row:
  `[level label] | [normal tiles] | [ancient tiles]`. The level label is a small
  badge on the left (reusing `tech.level`). Normal and ancient tiles for the
  same level sit on the same horizontal band, separated by a persistent divider
  between the two regions. Levels with no matching tech (after search) are
  omitted. The ancient region is visually narrower; when a level has no ancient
  tech the right cell is simply empty.
- **Tiles** flow (wrap) within their region — adaptive, not fixed N-slot columns.
- **Responsive**: on narrow screens the two regions stack (normal section, then
  ancient section), each keeping its level rows. Region headers remain.

### TechTile

- Fixed-ish aspect tile: type badge strip on top (道具/建筑), centered image,
  name (clamped to 2 lines) and cost at the bottom.
- Ancient tiles carry a purple accent border; normal tiles a neutral/blue accent.
- Entire tile is a button → opens the dialog. Keyboard focusable, `aria-label`
  = tech name.
- `data-testid="tech-tile"` for tests.

### TechDialog (click popup — "current information")

Contents:
- Title: tech name; subtitle badges: type (道具/建筑) + Normal/Ancient.
- Tech-point **cost**.
- **Prerequisite** line when `requireTech` (name looked up in tech text) and/or
  `requireBoss` is present (reuse `tech.requires` / `tech.requiresBoss`).
- **Description** (from tech text), when present.
- **Unlocks items**: `ItemLink` chips (icon + name) → `/items/$id`.
- **Unlocks buildings**: `BuildingLink` chips (icon + name) → `/buildings/$id`.
- Empty unlock lists are omitted. This is today's `TechCard` body moved into a
  Dialog, so no information is lost.

## Search

- A name **search box** in the top bar (`Input`, matches the game's 通过名字搜索).
- Live filter on the localized tech name (`b.tech.text[id]?.name`),
  case-insensitive substring, applied before grouping. Both regions filter.
- A result count line (like the items page) using a new `tech.count` string.
- The game's separate filter dropdown is intentionally **out of scope** (YAGNI —
  type is visible on each tile and search covers lookup). Can be added later.

## i18n

Tech strings live in `catalogStrings.ts` (`CATALOG_STRINGS[lng].tech`), typed by
`CatalogStrings`. Existing keys: `title, level, boss, cost, requires,
requiresBoss, unlocksItems, unlocksBuildings, empty`.

New keys to add to the `tech` shape and every language block:
- `ancientTitle` — right region header ("Ancient Technology" / 古代科技).
- `normalTitle` — left region header ("Technology" / 科技). (`title` stays the
  page `<h1>`.)
- `typeItem` — 道具 / "Item". `typeStructure` — 建筑 / "Structure".
- `searchPlaceholder` — "Search technologies…" / 通过名字搜索.
- `count` — "{{count}} technologies".
- `costShort` — compact per-tile cost label, e.g. "{{count}} pt" (falls back to
  reusing `cost` if a separate short form isn't wanted).

English and Simplified/Traditional Chinese authored precisely; other locales
follow the existing convention in this file (translated to match the surrounding
entries). No key may be left blank — every language block must include the new
keys so the typed `CatalogStrings` contract compiles.

## Testing

- **Unit** (`techModel.ts`): region split by `isBoss`; group-by-level ordering;
  `techType` for item-only / building-only / neither / both; `techImage`
  precedence (item over building, null when no unlocks); `matchesQuery`
  case-insensitivity and localized-name matching.
- **Component/e2e** (following existing palworld test patterns): tiles render in
  the correct region; clicking a tile opens the dialog with its name and unlock
  chips; unlock chip links point to `/items/$id` / `/buildings/$id`; search
  narrows the visible tiles and updates the count.

## Out of scope

- Locked / "?" placeholder slots and player tech-point totals (no data source).
- The in-game filter dropdown.
- A per-tech route (`/technology/$id`) — details live in the Dialog.
- Any change to `technology.json` schema or the `tools` pipeline.
