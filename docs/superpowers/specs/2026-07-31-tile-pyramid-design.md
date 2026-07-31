# Tile Pyramid — Design

**Date:** 2026-07-31
**Status:** Approved
**Scope:** Sub-project 1 of the iOS whole-map-view OOM fix: downscaled tile levels for
palworld, native-level support in both map engines, artifact regeneration. Sub-project 2
(porting the Leaflet embeds to `GameMapEmbed`) is designed separately afterwards.

## Problem (diagnosed 2026-07-31)

Map tiles ship as a **single native zoom level** (palworld: 8×8 grid of 1024² webp per
8192² map) and both engines pin native zoom 0, scaling those same tiles across the whole
zoom range (`map-engine` `GameMapTiles.tsx` `minNativeZoom/maxNativeZoom: 0`;
`map-engine-gl` `tileLayer.ts` "level-0 only, by design"). Any whole-map view therefore
keeps the full map's pixels resident at native resolution. Measured on a 390×844
viewport: the pal-detail spawn embed (`PalSpawnMap`, fit-to-whole-map, `minZoom -4`)
holds **36 tiles = 144 MB** of decoded image memory (worst case 64 = 268 MB) in a
288-px-tall box — while the page has only ~800 DOM nodes and 7 markers. iOS jetsams the
tab and auto-reloads: "sliding to pal detail always refreshes", for **every** pal,
because the cost is constant. A GL swap alone does not fix this — the GL tile layer
would hold the same bytes as non-purgeable WebGL textures.

The same pathology is latent in all whole-map views (region/dungeon embeds, both main
engines at far zoom, aion2's wiki embed).

## Fix

A halving **tile pyramid**. Palworld's grids are exact powers of two, so three levels
divide cleanly with no partial tiles:

| level | grid | tile px | map px | decoded (whole map) |
|-------|------|---------|--------|---------------------|
| 0 (existing) | 8×8 | 1024² | 8192² | 268 MB |
| −1 | 4×4 | 1024² | 4096² | 67 MB |
| −2 | 2×2 | 1024² | 2048² | 16 MB |
| −3 | 1×1 | 1024² | 1024² | **4 MB** |

At the embeds' whole-map view the engines fetch the single z−3 tile: **144–268 MB → 4 MB**.

## Components

### 1. Resource layout (artifact contract)

Level 0 stays exactly where it is: `tiles/<Map>/<Map>_XX_YY.webp` (no URL breakage for
existing consumers). Downscaled levels go to sibling dirs keyed by native zoom:

```
tiles/<Map>/z-1/<Map>_XX_YY.webp   (4×4)
tiles/<Map>/z-2/<Map>_XX_YY.webp   (2×2)
tiles/<Map>/z-3/<Map>_00_00.webp   (1×1)
```

Same `XX_YY` zero-padded col_row naming, y-down, webp quality 90 method 6. Storage:
≈ +33% of the existing ~4.8 MB per map.

### 2. Data contract (`@gamemap/data-contract`)

`GameMapMeta` gains `tileLevels?: number` — the count of downscaled halving levels
available (palworld: 3). Absent or 0 ⇒ single-level behavior, bit-identical to today.
`gameMapMetaSchema` adds it as an optional non-negative integer. Compatibility is
two-way: old data + new frontend falls back to level 0 only; new data + old frontend
ignores the field.

### 3. Tools pipeline (`tools/apps/palworld/maps/`)

`tiles.py`: after the existing void-clear, slice each level by successively halving the
source image (`PIL`, LANCZOS) and cutting 1024² tiles; write to the layout above.
`emit.py`: write `"tileLevels": 3` into each map's `maps.json` entry, and **import**
`TILE`/`COUNT` from `tiles.py` instead of duplicating them as literals (existing
duplication, fixed in passing). Palworld only — vrising (non-power-of-two 1216×5 grid)
and aion2 (pre-shipped tiles, odd sizes) adopt pyramids in their own later projects.

### 4. Leaflet engine (`@gamemap/map-engine`)

`GameMapTiles.tsx`: `minNativeZoom: -(selectedMap.tileLevels ?? 0)` (both the base and
watermark layers keep `maxNativeZoom: 0`). Leaflet then requests the nearest native
level for any fractional zoom and scales it. `GameTileLayer.getTileUrl` becomes
level-aware: `level = -coords.z` (0 when Leaflet asks for z ≥ 0), the level's grid is
`ceil(tilesCount / 2^level)` (exact for palworld), bounds-check against that grid, and
resolve via `assets.tileUrl(selectedMap, x, y, level)`.

`MapAssets.tileUrl` gains an optional trailing `level = 0` parameter. App resolvers
update: palworld inserts `/z-${level}/` for level > 0; aion2/vrising resolvers accept
the parameter and ignore it (their data never sets `tileLevels`).

### 5. GL engine (`@gamemap/map-engine-gl`)

`tileLayer.ts`: per `update()`, pick
`level = min(map.tileLevels ?? 0, max(0, floor(-camera.zoom)))` — tiles are never
rendered above native resolution, and level 0 is used from zoom > −1 upward. The
level's tile size in map pixels is `tileWidth × 2^level`; `visibleTileRange` is computed
with that size against the level's grid; cache keys become `level:x:y` so an LRU entry
never collides across levels; quads scale to the level tile size. Throttle, LRU
eviction, watermark layer, and the continuous camera are unchanged — only URL/geometry
selection is discretized. `MapAssets.tileUrl` (GL `core/assets.ts`) gains the same
optional `level` parameter.

### 6. Rollout

1. Merge frontend + tools changes (worktree, rebase integration).
2. Run the palworld tiles + emit stages; commit/push `resource-palworld` (new `z-*`
   dirs) and `data-palworld` (`tileLevels: 3`). The live site picks the data change up
   via the `version.json` cache-buster; old cached frontends ignore the new field.
3. Palworld changelog **PATCH** entry (user-visible fix: mobile pal-detail crash).
4. Toy update: rebuild `pnpm toy:build --app palworld` (bundles the regenerated
   artifacts) and republish via the preview → confirm → `--submit` flow.

## Testing

- Unit: level math in both engines — Leaflet `getTileUrl` level/grid mapping;
  GL `visibleTileRange`/level selection/cache keying across levels (the GL core is
  DOM-free and already has tileLayer tests to extend).
- Pipeline: slicing a synthetic small image produces the expected files and pixel
  content at every level; `emit` output carries `tileLevels`.
- Contract: `pnpm validate-data` against the regenerated `data-palworld`.
- Regression: full `pnpm test`, palworld e2e suite (63 known-good baseline), visual
  check that far-zoom rendering shows no seams/blur regressions.
- Acceptance: repeat the 390×844 pal-detail measurement — tile decode ≤ ~8 MB at the
  embed's initial view (was 144 MB).

## Out of scope

- Porting `PalSpawnMap` / `RegionLootMap` / `DungeonEntranceMap` to `GameMapEmbed`
  (sub-project 2; needs a point-cloud-overlay design for the paldex habitat clouds).
- vrising / aion2 pyramid generation.
- Marker clustering changes; `SHOW_ALL_MAX` stays as-is until sub-project 2.
