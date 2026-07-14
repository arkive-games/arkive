# Palworld: exact per-pal spawn points on the pal detail map

**Date:** 2026-07-14
**Status:** approved (implement in auto mode)

## Problem

The pal detail page's spawn map currently reuses the map-wide clustered markers
(`markers/<mapId>.json`, cluster radius 200 px), so it shows the same clusters as the main
interactive map. Users want the detail map to show **exact spawn positions**. The exact
positions already exist in the pipeline: clustering is applied only at emit time, and
`parsed.json` holds 7,720 spawner placements with precise world coordinates (~58,860
placement × pal instances across 275 species).

## Decision

Emit one JSON file per pal with exact points, and make the detail map load that file
instead of filtering the shared cluster files. Clusters remain unchanged on the main
interactive map. (Alternatives rejected: embedding member points inside the existing
marker files would balloon the 1.8 MB `markers/MainWorld.json` ~10×; a single combined
all-pals file would be a ~3–4 MB download to show one pal.)

## Data schema — `spawns/<palId>.json` (data-palworld)

Emitted only for pals (`zukanIndex > 0`) that have at least one wild point or boss point.

```json
{
  "maps": {
    "MainWorld": {
      "points": [
        { "x": -583141, "y": -452306, "z": -444, "lvMin": 60, "lvMax": 65 }
      ],
      "bosses": [
        { "x": -335225, "y": 180735, "z": 475, "kind": "fieldBoss", "level": 7 }
      ]
    },
    "WorldTree": { "points": [], "bosses": [] }
  }
}
```

- Coordinates are rounded to **integers** (world cm; sub-cm precision is meaningless at
  8,192 px map resolution) to keep files ~30% smaller. Worst case (MimicDog, 5,327
  points) is ~250–350 KB; typical pals are a few KB.
- Level ranges are numeric; the frontend formats `Lv.{min}–{max}` itself — no locale
  files needed for this data.
- `bosses[].kind` is `"fieldBoss" | "predator"`, matching the marker subtypes the detail
  map shows today; `level` may be absent if unknown. Bosses are included so the detail
  map needs exactly one data fetch.
- Maps with no content for the pal are omitted (or emitted empty — frontend treats both
  the same); pals with no content at all get **no file** (frontend treats 404 as
  "no spawns").

## Emitter changes (`tools/apps/palworld/maps/emit.py`)

In the existing per-(map, pal) bucketing that feeds `cluster_points`, also collect the
raw pre-cluster points (with per-instance `lvMin`/`lvMax`) and the fieldBoss/predator
placements back-linked to catchable pals. Write `spawns/<palId>.json` through the same
output plumbing as the other artifacts. Cluster markers and all existing outputs are
byte-identical to before.

## Frontend changes (`frontend/apps/palworld`)

- `loadPalSpawns(palId)` (`src/lib/pals.ts`) fetches `${DATA_BASE}/spawns/<palId>.json`;
  404/missing → "no spawns". This replaces downloading + filtering both map-wide marker
  files (~2.6 MB → a few KB per detail page). Map labels still come from
  `locales/<lng>/maps.json`.
- `PalSpawnMap.tsx` rendering:
  - **≤ 300 wild points on a map:** current circular pal-icon pins, no count badge
    (every pin is one spawn); tooltip shows `Lv.{min}–{max}`.
  - **> 300 wild points:** small dots via `L.circleMarker` on a canvas renderer so
    MimicDog-class pals stay smooth; tooltip on hover still available.
  - Bosses always render as pins with the existing red ring + legend.
  - Per-map toggle and "View on map" deep link unchanged.

## Testing

- Tools: pytest asserting the per-pal file schema, integer rounding, point counts
  matching pre-cluster totals for a synthetic parsed input, boss inclusion/backlink,
  and no file for pals without spawns.
- Frontend: existing checks/build; manual verification of a low-count pal (pins), a
  high-count pal (dots path, e.g. MimicDog), a boss-bearing pal (legend), and a
  no-spawn pal (empty message) on the dev server.
