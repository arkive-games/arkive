# AION2 Wiki Subsite — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming), pending implementation plan
**Repos touched:** `frontend/` (routes, embedded map, wiki pages), `tools/` (new wiki emitter), `data/` (new generated output)

## 1. Goal

Add a wiki to the AION2 site whose pages are **fully auto-generated** from the parsed
game data, and which is **deeply integrated with the interactive map** in both directions:

- A wiki page (e.g. a quest) can render an inline map showing **only that entity's POIs** —
  no default markers, no sidebar.
- Markers on the main map can **deep-link to their wiki page**.

The wiki is not a human-authoring CMS. All content is derived from the game export by
`tools/` and served as JSON, exactly like markers are today.

## 2. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Delivery | **Same app, new `/wiki/*` routes** | Deep map integration wants one component tree; reuses router, i18n, theme, markdown. |
| Content source | **Fully auto-generated** from game data | No hand-authoring; regenerates cleanly on game patches. |
| Rendering foundation | **Dynamic site with JSON** (SPA fetches per-entity JSON) | Preserves the existing `data/`↔`frontend/` decoupling: a game patch regenerates `data/` only, frontend never rebuilds. SSG would couple the frontend build to data and force a full rebuild+redeploy on every patch. |
| SEO | **Prerender snapshots layered on top** (deferred phase) | Buys back the one thing SSG wins (crawlability/first paint) without giving up decoupling. |
| Embedded map | **Extract a shared presentational `<EmbeddedMap>`** | Avoids duplicating projection/tile/marker logic (which would drift); improves the current map code. |
| v1 entity scope | **Quests, NPCs/Monsters, Items** | Quests are the flagship; NPCs/monsters have coords; items link to sources. |

## 3. Data availability (verified against the raw export)

- `tools/` is **Python**. The wiki generator is a new emitter alongside
  `tools/aion2/tools/maps/emit_frontend.py`.
- Markers today have **no entity link** — IDs are synthetic (`<Map>-<subtype>-<index>`).
  Cross-linking requires a new field (see §5).
- **Quests** (`Data/Table/Quest.json`) have **no direct world coordinates**. Coordinates are
  resolved by joining **Quest → `AcquireNpcTalk` → `NpcData.json` → per-map `MapData.json`
  `SpawnInfo` (Location X,Y,Z)**. Fields available: `ID`, `Name`, `AcquireMapId`,
  `AcquireNpcTalk`, `CompleteMapId`.
- **NPCs / monsters** (`NpcData.json` + `MapData.json` `SpawnInfo`) **do have coordinates**.
  `NpcData` gives `Desc.Key` (L10N), `Level`, `bNamed` (named/boss), `NpcType`.
- **Items** (`Item.json`) have **no coordinates**; sources are indirect via gather nodes and
  `NpcLoot.json`. Item pages link to *sources*, not their own map markers.

**Implication:** the flagship "quest page → map POIs" feature is feasible but depends on a
cross-table join that can partially fail (a quest whose giver NPC has no spawn). The design
must degrade gracefully (§7).

## 4. Architecture

```
Raw export (Quest.json, NpcData.json, Item.json, per-map MapData.json SpawnInfo)
   │
   ▼  tools/  (new emit_wiki.py — joins + resolves coords + L10N)
data/wiki/<type>/<id>.json         (per-entity page data + pois[])
data/wiki/index/<type>.json        (hub/list + search index)
data/locales/<lang>/wiki/...       (localized text, mirrors marker-locale pattern)
data/markers/<Map>.json            (extended: optional entityType/entityId)
   │
   ▼  HTTP (same as markers today)
frontend/  /wiki/* routes  ──uses──▶  <EmbeddedMap> ◀──uses── main map route
```

No new framework, no second build. One shared map engine.

## 5. Data model & pipeline (`tools/`)

New module (e.g. `tools/aion2/tools/wiki/emit_wiki.py`) that:

1. Parses `Quest.json`, `NpcData.json`, `Item.json`.
2. Resolves POIs:
   - **Quest:** `AcquireNpcTalk` → NpcData → SpawnInfo → `{mapId, x, y}` (+ `CompleteMapId`
     context). Multiple spawns → multiple POIs.
   - **NPC/Monster:** NpcData → all SpawnInfo entries → POIs.
   - **Item:** no POIs; instead `sources: [{kind: 'gather'|'drop', ref}]`.
3. Emits per-entity JSON:
   ```json
   {
     "id": 1100010,
     "type": "quest",
     "name": "<localized-or-key>",
     "fields": { "level": 12, "acquireMapId": 1110, "...": "..." },
     "pois": [{ "mapId": "World_D_A", "x": 3607.9, "y": 2963.0, "label": "...", "markerId": null }],
     "related": [{ "type": "npc", "id": 2010549504 }]
   }
   ```
4. Emits `data/wiki/index/<type>.json` (list + `minisearch`-ready search index).
5. Emits localized text under `data/locales/<lang>/wiki/...`.
6. **Extends the marker emitter** to add optional `entityType` / `entityId` on markers that
   correspond to a wiki entity, enabling map→wiki deep links.

The emitter is idempotent and re-runnable (same contract as `emit_frontend.py`).

## 6. Frontend

### Routes (TanStack file-based, code-split)
- `/wiki` — landing / overview.
- `/wiki/$type` — searchable list (uses `minisearch`, already a dependency).
- `/wiki/$type/$id` — entity page. Route loader fetches the entity JSON.

### Templates
- `QuestPage`, `NpcPage`, `ItemPage` — typed renderers over the entity JSON.
- Rich text via `react-markdown` + `remark-gfm`, sanitized with `dompurify`, styled with
  `@tailwindcss/typography` (all already dependencies).

### `<EmbeddedMap>` (extracted from `GameMapView`)
- Props: `mapId`, `markers`, `interactive?` (default read-only for wiki), `initialView?`,
  `onMarkerClick?`.
- Presentational: takes markers as props, **no context coupling**.
- The existing full map route becomes a thin wrapper that feeds `<EmbeddedMap>` markers and
  handlers from the current contexts (`GameMapContext`, `MarkersContext`, `GameDataContext`).
- Wiki pages render it with only the entity's POIs and no sidebar.

## 7. Integration (both directions)

- **Map → wiki:** `SelectedMarkerPopup` / marker popup shows a "View in wiki" link when the
  marker carries `entityType`/`entityId` → navigates to `/wiki/$type/$id`.
- **Wiki → map:** POIs in the embedded map link to the full map focused on that marker
  (`/?map=<mapId>&marker=<markerId>` or coord focus); inline entity references
  (`related[]`) link to other wiki pages.

## 8. SEO / prerender

- **v1:** client-rendered + generated `sitemap.xml` + runtime `<title>`/OG meta per page.
- **Later phase:** post-build headless-Chrome snapshot of `/wiki/...` routes to static HTML
  for stronger crawlability. Deferred — not required for launch.

## 9. Error handling

- Missing entity id → wiki 404 page.
- Failed coord join (quest giver has no spawn) → page renders **without** a map (or "location
  unknown"); the emitter logs the broken reference. A bad cross-ref never blocks the page.
- Missing localization → fall back to key/base language (existing marker-locale behavior).

## 10. Testing

- **`tools/`:** unit tests for the join logic with fixtures (quest→npc→spawn, including the
  no-spawn failure path) and the emitted JSON shape.
- **Frontend (Playwright, already configured):**
  - Entity page renders from JSON.
  - Embedded map shows exactly the entity's POIs and no default markers.
  - Marker → wiki link navigates to the correct page.
  - Wiki POI → map link focuses the correct marker.

## 11. Phasing

1. **Foundation + flagship:** extract `<EmbeddedMap>`; wiki route scaffold; **Quest pages**;
   `entityType`/`entityId` marker field; both link directions; sitemap + runtime meta.
2. **NPCs/Monsters:** NPC/monster wiki pages; named-NPC/boss markers on the main map.
3. **Items:** item pages with source links (gather nodes / loot).
4. **SEO upgrade:** post-build prerender snapshots.

Each phase is independently shippable. Phase 1 delivers the full "quest → embedded map → POIs"
+ "marker → wiki" loop that motivates the feature.

## 12. Open risks / assumptions

- **Join completeness:** unknown what fraction of quests resolve to a spawnable giver NPC.
  Emitter must report coverage stats so we know how many quest pages get a map.
- **Marker↔entity mapping:** current markers are synthetic; wiring `entityType`/`entityId`
  requires deciding which existing marker subtypes map to which entity types (Phase 1 scopes
  this to quest-relevant markers; broaden later).
- **Locale volume:** thousands of entities × N languages may be large; consider sharding
  locale files per type/map as markers already do.
