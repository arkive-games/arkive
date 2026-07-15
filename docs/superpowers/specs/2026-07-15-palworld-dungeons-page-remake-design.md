# Palworld Dungeons Page Remake — Design

**Date:** 2026-07-15
**Status:** Approved (brainstormed interactively; implementation in auto mode)

## Goal

Split the single stacked `/dungeons` page into a list-only main page plus one dedicated
detail page per dungeon, with an improved detail-page layout. 14 dungeons total
(`dungeons.json`, ids `Grass001` … `Yakushima001`).

## 1. Routes & link migration

- `/dungeons` → **DungeonListPage** (list only). TopNav / BottomTabBar entries unchanged.
- `/dungeons/$id` → **DungeonDetailPage** (new route, same pattern as `/pals/$id`,
  `/items/$id`, `/quests/$id`).
- **Back-compat:** the list route keeps its `d` search param (`/dungeons?d=<SpawnAreaId>`)
  and immediately redirects to `/dungeons/$id` when present, so previously shared links
  keep working.
- In-app links move to direct detail links:
  - map portal-marker popup in `App.tsx` (`marker.dungeonArea`),
  - "Found in dungeons" chips in `ItemDetailPage.tsx`.

## 2. List page (`/dungeons`)

Quest-list style: one bordered `bg-card` container, divided rows, difficulty-ordered
(ascending `bonusExpRate`, ties by id — same ordering as today). Each row links to the
detail page and shows:

- dungeon name (locale) + mono id,
- enemy level range derived across all spawn buckets ("Lv. 12–19"),
- EXP-bonus badge (`×1.2`),
- boss preview: up to 3 circular boss-pal icons.

No search/filter — 14 rows, and the page is deliberately list-only.

## 3. Detail page (`/dungeons/$id`)

Sectioned scroll, `ContentPage` with `max-w-5xl`, reusing `CatalogSection` and the
existing loot renderers. Unknown id → `CatalogNotFound` with back link.

1. **Header** — name (`text-3xl`), mono id, EXP-bonus badge, level-range badge;
   prev/next dungeon links (difficulty order) for flipping through dungeons.
2. **Notable drops strip** — up to 8 `ItemLink` chips: unique items across all the
   dungeon's lotteries (`dungeonLotteries`), ranked by chest-tier grade (desc), then
   best per-roll chance (desc). Deterministic; non-empty for every dungeon (verified
   against the dataset: 34–174 unique items each).
3. **Overview grid** (`lg:grid-cols-[minmax(0,1fr)_380px]`):
   - left — **Encounters**: enemy-pool chip rows, boss first (boss pools hold up to
     30 pals, so spotlight cards would dwarf the page);
   - right — **Entrances map widget** (§4).
4. **Loot grid** (`lg:grid-cols-2`): left = Chest loot + Technology chest;
   right = Boss-room rewards. Existing `LotteryTable` / `RewardEntryRow` components,
   restyled spacing only.
5. Footer: back-to-list link.

## 4. Entrance map widget (`DungeonEntranceMap`)

Modeled on `PalSpawnMap` (bare Leaflet `MapContainer` + `GameMapTiles`, no engine
chrome):

- Data: `loadStatic(lng)` for MainWorld map meta + `loadMarkers('MainWorld', lng)`,
  filtered to `dungeonArea === id`. All 157 portals are on MainWorld (1–30 per
  dungeon); the marker fetch is the same cached loader the map page uses.
- Pin markers (dungeon portal icon via `palworldAssets.markerIconUrl`) with
  entrance-name tooltips; entrance count in the section title.
- "View on full map" link → `/?map=MainWorld&q=<dungeon name>`. Portal markers carry
  real localized names matching the dungeon name, so the search prefill surfaces them.
- Marker-load failure hides the widget (best-effort, like the item page's dungeon row).

## 5. Code layout

- `features/dungeons/DungeonListPage.tsx` — list page.
- `features/dungeons/DungeonDetailPage.tsx` — detail page (+ redirect handling stays in
  the list page component).
- `features/dungeons/DungeonEntranceMap.tsx` — map widget.
- `features/dungeons/components.tsx` — shared loot renderers moved out of the deleted
  `DungeonsPage.tsx`: `LotteryTable`, `PalPool`, `RewardEntryRow`, `ChanceBadge`,
  `gradeBadgeClass`, `TIER_KEY`, `LOTUS_STAT`.
- `lib/dungeons.ts` — new pure helpers: `dungeonLevelRange(d)` (min–max across enemy
  buckets, null when no enemies) and `notableDrops(file, d, cap = 8)`.

## 6. i18n

New keys in the typed `DungeonStrings` table, translated for all 17 locales:
`encounters`, `entrances` (count interpolation), `notableDrops`, `backToList`,
`notFound` (id interpolation), `viewOnMap`, `prevDungeon` / `nextDungeon` (aria
labels). Existing keys unchanged (`viewLoot` popup wording still fits the detail page).
Levels render as "Lv. {min}–{max}" inline, matching existing pages (no key).

## 7. Error handling

- Data load failure → existing `loadError` pattern (message, no crash).
- Unknown `$id` → `CatalogNotFound`.
- Entrance widget failures degrade to hiding the widget.

## 8. Testing

New `e2e/dungeons.spec.ts`:

- list renders 14 rows; clicking a row navigates to its detail page;
- detail page renders header, notable-drops strip, encounters, entrance map, loot
  sections (testids);
- `/dungeons?d=Grass001` redirects to `/dungeons/Grass001`;
- item detail page's dungeon chip navigates to the dungeon detail page.

## Trade-offs

- The `?d=` redirect keeps old links alive at the cost of one extra route hop.
- The entrance widget loads the full MainWorld marker file (~7.5k rows), but it is the
  same cached fetch the map page performs.
