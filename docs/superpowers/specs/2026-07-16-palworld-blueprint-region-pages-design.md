# Palworld: Blueprint Region Detail Pages + Source Hovercards

**Date:** 2026-07-16
**Status:** Approved

## Problem

Blueprint items list acquisition sources like "chest — Sakurajima — Grade 3 — 2.1%", but the
`area` on a chest/fishing source is just a lottery area key with no way to see *where* those
chests actually are. Chest markers exist on the map with positions and named-region stamps,
but nothing links a placed chest to its lottery pool. Fishing spots are not on the map at all.

## Design

### Data gap being bridged

Two disconnected namespaces today:

- Blueprint `chest`/`fishing`/`supply`/`camp`/`oilrig` sources carry a **lottery area key**
  (`Grass`, `Desert`, `Sakurajima`, `Oilrig`, …) derived from lottery `FieldName`s
  (`blueprint_sources._classify` / `_area_key`). No positions.
- Map `chest` markers carry world positions + a `DT_WorldMapAreaData` region stamp, but no
  loot linkage. Fishing spots are absent.

Bridge: each treasure/fishing spawner blueprint carries its lottery `FieldName` as a
**class default**; extract already records each chest POI's spawner class (`sourceName`).
Reading spawner CDOs lets us stamp each placed marker with its lottery area.

### 1. Tools pipeline (`tools/apps/palworld`)

- **Extract** (`maps/extract.py`):
  - Read `FieldName` (and grade where present) from treasure/fishing spawner class defaults;
    produce a `spawnerFields` map `{className: fieldName}` in `parsed.json`.
  - Extract **fishing spot** actors from world-partition cells as new POI subtype `fishing`
    (class discovered from the export, e.g. `BP_PalMapObjectSpawner_FishingSpot*`), with
    world positions via the existing `_actor_location` chain.
- **Emit** (`maps/emit.py`):
  - Classify each chest/fishing/oilrigTreasure marker's spawner `FieldName` with the same
    logic as `blueprint_sources._classify`, and stamp the marker with optional
    **`lootArea`** — the same key blueprint sources use.
  - Emit **`areas.json`**: `{areas: {<areaKey>: {maps: {<mapId>: {<subtype>: count}}}}}` —
    a tiny index so the frontend hovercard can show counts without loading markers.
  - Add `fishing` subtype to `data_src/types.yaml` (category `collectible`), with a
    game-localized name if one exists in the text tables (prefer game L10N; fall back to a
    sensible English label only if the game has none).
- Supply drops / camps: include only if placed actors with resolvable lottery fields exist
  in the export; otherwise those source chips stay link-less (chip renders as today).

### 2. Data contract (`packages/data-contract`)

- `MarkerInstance.lootArea?: string` in `types.ts` + `markerInstanceSchema` + schema test.
- `areas.json` is app-local (catalog-style loader), not part of the map contract.

### 3. Frontend — region detail page (`apps/palworld`)

- Route **`/regions/$id`** (id = lottery area key), registered in `main.tsx`, standard
  `ContentPage` detail-page pattern.
- Content:
  - Title: localized area name (`areaLabels` from labels.json, fallback `bp.area.*`).
  - **Embedded mini-map** (pattern: `DungeonEntranceMap` — `MapContainer` + `GameMapTiles`),
    showing all markers whose `lootArea` matches, icon/color-coded by subtype
    (chest / fishing / oilrigTreasure), auto-fit bounds to the points, "view on full map"
    link. Biome areas (`Grass` …) are represented by the point cloud; no polygon needed.
  - **Reverse blueprint index**: all items whose `sources` include this area, grouped by
    kind, with grade/chance chips — computed client-side from `items.json`.
- User-facing term is "region" even though the id namespace is lottery area keys (distinct
  from `REGION_Wide_*` trigger volumes).

### 4. Frontend — source chip hovercard

- In `BlueprintSections.tsx`, area-bearing chips (chest/fishing/supply/camp/oilrig) become
  `Link`s to `/regions/$id` wrapped in the existing radix `HoverCard` pattern
  (`features/catalog/components/hover.tsx` conventions): card shows localized region name,
  marker counts from `areas.json` (e.g. "142 chests · 12 fishing spots"), the grade/chance
  of this source, and a "view region" link.
- Chips whose area has no entry in `areas.json` (no placed actors found) render as today
  (plain fact chip, no link).

### 5. Main map

- New `fishing` markers flow through the generic taxonomy (filter toggle, pins, popups,
  region stamping) with no special-case code.

## Testing

- Tools: pytest units for spawner-field CDO parsing, `lootArea` stamping, `areas.json`
  emission, fishing POI extraction (fixture-based, consistent with existing tests).
- Frontend: typecheck + build; `check:engine`/`check:shell` unaffected (app-level code);
  live smoke on the dev server (15174) after rebase-merge back, per workspace convention.

## Out of scope

- Per-chest loot popups on the main map (chest → full drop table).
- Salvage (`rank`-keyed), treasureMap, raid, shrine, merchant, arena sources — not
  region-based.
- Linking lottery areas to `REGION_Wide_*` trigger-volume polygons.
