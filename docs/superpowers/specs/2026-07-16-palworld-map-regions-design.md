# Palworld map regions: marker region names + region areas on the map

2026-07-16. Follow-up to the blueprint-sources work: blueprint chest sources
name a region, so the map should (1) tell you which region a marker is in and
(2) draw the regions themselves.

## Ground truth (raw export)

The game defines its named regions as **trigger volumes**: 124 placed
`BP_PalRegionTriggerBox_C` / `BP_PalRegionTriggerSphere_C` actors (85 files:
`Maps/MainWorld_5/PL_MainWorld5.json` + world-partition `MainGrid_*` cells).
Each actor carries `AreaName.Key` (one distinct key per actor, matching
`DT_WorldMapAreaData`'s rows) and its geometry as a transform chain: the root
`DefaultSceneRoot` (location / yaw / scale) × the Box/Sphere child component
(its own relative transform + `BoxExtent`/`SphereRadius`, engine default 32).
**Both levels must be composed** — island volumes carry their scale on the
child, mainland ones on the root; reading only the root yields 32-unit boxes.

Localized names: `DT_WorldMapAreaData[key].MsgID` → `DT_WorldMap_Common_Text`
(all 17 languages + JA base). Coverage: volumes are 3D rotated boxes/circles;
~70 % of emitted markers fall inside one. The gaps are genuine: ocean, small
islets, and the island-wide `REGION_Wide_*` / World-Tree sub-region names have
**no volumes** (the game resolves those via UI mask textures / C++), so
markers there simply carry no region — no invented fallback.

Key families: `Grass_*`, `Forest_*`, `Frost_*`, `Volcano_*`, `Desert_*`,
`Sakurajima_*`, `Darkisland*`, `Skyisland*`, `SmallIsland*`, `PvPIsland_*`,
`Preserve_*`, plus interior volumes (`*UndergroundCave*`, `*FixedDungeon*`,
`Tower_*`) that overlap surface regions in 2D but separate cleanly in Z.

## Data design (maps pipeline)

`extract.py` gains a region-volume pass → `parsed.json`:
* `regionVolumes`: `[{area, shape: box|sphere, x, y, z, hx, hy, hz, yaw}]`
  (world units, composed transforms).
* `regionNames`: `{areaKey: {lng: localizedName}}` from the area-data → world-
  map-text join.

`emit.py`:
* `regions/MainWorld.json` — contract `RegionInstance` per volume:
  `id` = `name` = area key, `type` ∈ `region` (surface) / `cave` / `dungeon` /
  `tower` (interior, classified by key), `borders` = one polygon in **map
  pixel space** (rotated-rect corners; spheres as 24-gons) via the existing
  world→pixel transform. WorldTree stays empty (no volumes).
* `locales/<lng>/regions/MainWorld.json` — `{areaKey: {name}}` (en-US
  fallback, then the key).
* Every marker gets `region: <areaKey>` (contract field already exists):
  containment prefers 3D hits (z inside the volume) so cave/dungeon/tower
  markers resolve to the interior volume, falls back to 2D, and breaks ties
  by smallest 2D area (most specific region wins). Markers outside all
  volumes carry no field.

## Frontend design (palworld app)

* `lib/data.ts`: `loadRegions(mapId, lng)` → `{regions, l10n}` (best-effort,
  map renders without it).
* Marker popup: the meta line gains the localized region name (from
  `marker.region` → regions l10n).
* Status bar: `subzoneAt(x, y)` implemented like aion2's `useSubzoneLookup` —
  world→pixel, smallest-area point-in-polygon over **surface** regions only
  (the cursor has no Z, interior volumes would win wrongly), localized name.
* Region overlay: pass surface regions to `GameMapView` and add a
  "Show regions" toggle next to the existing tooltip toggle (`showBorders`,
  hover highlight comes free from `GameMapBorders`). New `showRegions` UI
  string ×17 in the app i18n.

## Testing

* tools: integration test — volume count/coverage, a known marker's stamped
  region (tower → `Tower_*`), pixel borders inside the map, locale names.
* frontend: e2e — popup shows a region name; region toggle draws borders;
  status bar shows a region under the cursor.
* Live check on :15174, then ff-merge, regenerate + commit data-palworld.
