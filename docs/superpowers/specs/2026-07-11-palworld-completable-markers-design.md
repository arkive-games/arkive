# Palworld Map — Completable Effigy & Boss Markers

**Date:** 2026-07-11
**Status:** Approved (autonomous session — scope taken literally from the request
"the effigies and bosses should be completable"; widening scope later is a
one-line `canComplete: true` per subtype in `types.yaml`)

## Problem

The Palworld map has no progress tracking: `App.tsx` hardcodes `completed: false`
on every marker, and the tools never emit `canComplete` on any subtype (the
2026-07-02 palworld map spec explicitly deferred it: "Marker `canComplete` is
`false` everywhere"). Players collecting Lifmunk Effigies or clearing field
bosses can't mark what they've done.

All the machinery already exists elsewhere:

- **data-contract** — `MarkerTypeSubtype.canComplete` (`schemas.ts`, `types.ts`).
- **map-engine** — `GameMarker` renders a completed marker dimmed with a green
  check badge whenever `EngineMarker.completed` is true (no `iconComplete` swap
  needed here); `MarkerFocusController` already ignores completion-only updates.
- **map-shell** — `FilterPanel` subtype rows accept a `badge` string (`X/N`).
- **aion2** — `MarkersContext` demonstrates the store shape (localStorage,
  per-map) and `MarkerPopupContent` the popup completion pill.

Only the palworld data pipeline and app wiring are missing.

## Scope

Completable subtypes (this change):

| Category | Subtypes |
| --- | --- |
| `boss` | `fieldBoss`, `wanted`, `predator` |
| `effigy` | `lifmunkEffigy` (hand-authored) + every generated per-pal `effigy*` subtype |

Explicitly **not** in scope: Sealed Realms, Ancient Shrines, Towers, and
collectibles (notes, treasure maps, chests, skill fruits, eggs, oil rigs).
Each becomes completable later by adding `canComplete: true` to its
`types.yaml` entry — no code change.

Also not in scope: backend-synced progress (stays local, like aion2), a
"hide completed" filter, and a "clear all completed" control (YAGNI until
asked for).

## Approaches considered

1. **Data flag + app-local completion store (chosen).** Tools emit
   `canComplete`; the palworld app keeps a small localStorage-backed hook and
   passes `completed` into the engine. Smallest change, reuses every existing
   rendering/UI affordance, no cross-app refactor.
2. **Extract aion2's `MarkersContext` completion logic into map-shell.**
   Rejected for now: aion2's context is entangled with its v1→v2 migration,
   i18n namespaces, and marker loading. Two consumers with different storage
   histories don't yet justify the abstraction; revisit if a third surface
   needs completion.
3. **Backend progress sync (auth'd).** Rejected: the backend progress API is
   an aion2 concern today; local persistence matches how the aion2 map
   shipped and needs no login.

## Design

### 1. Tools (data pipeline)

- `tools/apps/palworld/data_src/types.yaml`: add `canComplete: true` to
  `fieldBoss`, `wanted`, `predator`, and `lifmunkEffigy`.
- `tools/apps/palworld/maps/emit.py`:
  - pass `canComplete` through into the `types.json` subtype row (same
    pattern as `defaultActive` — only emit when true);
  - set `canComplete: True` on each generated per-pal effigy subtype.
- Tests: `test_emit.py` asserts a `canComplete: true` boss subtype and that
  non-flagged subtypes omit the key; `test_effigy.py` asserts generated
  effigy subtypes carry `canComplete: true`.
- Regenerate `data-palworld` (env paths from `tools/.env`) and commit the
  dataset change there.

### 2. Frontend (palworld app)

**Completion store** — new `frontend/apps/palworld/src/lib/completedMarkers.ts`
with a `useCompletedMarkers(mapId)` hook:

- Storage: one key per map, `palworld.map.completed.<mapId>`, holding a JSON
  array of marker ids (ids are `"<map>-<subtype>-<index>"`, emitted stably by
  the tools). Malformed/absent storage → empty set. Same
  read-once-then-persist pattern as the existing `MAP_VISIBLE_KEY` handling.
- API: `{ completed: Set<string>, toggleCompleted(id: string): void }`.
  Reloads when `mapId` changes.
- Unit tests (vitest, like `techModel.test.ts`): toggle on/off, persistence
  round-trip, per-map isolation, corrupt-JSON fallback.

**App wiring** (`App.tsx`):

- `engineMarkers`: `completed: completed.has(m.id)` — the engine then renders
  the dim + green check automatically.
- Popup (`renderPopupContent`): when `marker.subtypeMeta?.canComplete`, append
  a footer pill inside `MarkerPopupCard` (as `children`), styled like aion2's
  (`Check` icon, green `#55B34C` outline/fill states, `aria-pressed`), toggling
  via `toggleCompleted(marker.id)`. Labels from i18n: `markCompleted`
  ("Mark as completed") / `markedCompleted` ("Completed").
- Filter panel (`filterCategories`): for `canComplete` subtypes, set
  `badge: "<done>/<total>"` (done = completed ids of that subtype on the
  current map) instead of `count`; other subtypes keep the plain count.

**i18n** (`i18n.ts`): add the two label strings for all 17 languages, following
the existing `Record<Language, string>` table pattern.

### 3. Data flow

```
types.yaml canComplete ──emit──▶ data-palworld types.json
  ──HTTP──▶ App.tsx subtypeMeta.canComplete
       ├─▶ popup pill (toggle) ──▶ useCompletedMarkers ──▶ localStorage
       ├─▶ FilterPanel badge X/N
       └─▶ EngineMarker.completed ──▶ GameMarker dim + green check
```

### 4. Error handling

- localStorage unavailable/corrupt → in-memory set, feature degrades to
  non-persistent; never throws.
- Markers whose subtype lacks `canComplete` never show the pill and are never
  counted in badges, even if stale ids linger in storage (harmless leftovers).
- Dataset regeneration can renumber ids within a subtype if the game adds
  markers that sort earlier; stored progress may then misalign. Accepted —
  identical trade-off to aion2's `indexInSubtype` keys.

### 5. Testing

- Python: emit tests above (`uv run pytest` in `tools/`).
- Vitest: completion-store unit tests.
- Playwright e2e (palworld): enable a completable subtype, click a marker,
  mark completed, assert the popup pill state flips and the filter badge
  increments; reload and assert persistence.

## Workflow

Per workspace conventions: implement in a git worktree, merge back with
rebase, then live-test on the palworld dev server (port 15174).
