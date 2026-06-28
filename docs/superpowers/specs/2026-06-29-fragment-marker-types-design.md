# Distinguish three fragment types (ground / air / water) — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

God-fragment ("Monolith") markers are currently all rendered and described
identically. In the game, fragments come in three physical kinds — **ground**,
**air**, and **water** — which matters to players hunting them (you reach air
fragments by flying, water fragments by swimming/diving). We want to:

1. Show the fragment's type in the marker detail dialog.
2. Add a small green directional badge on the marker icon for air (up) and
   water (down). Ground markers are unchanged.

## Key discovery — the type is derivable from the raw export

The distinction is **not** in the parsed dataset today, but each god fragment's
`EnvObj` row in `Data/Table/EnvObjData.json` has a `Name` whose suffix encodes
the kind, e.g.:

- `E_L1_Verteron_fragment_Ground`
- `E_L1_Verteron_fragment_Air`
- `E_L1_Verteron_fragment_Water`

Classification across all 575 `MapData.json` files (matching the spawned
fragment's first `EnvObjId` back to its `EnvObjData` `Name`):

| type    | count |
|---------|-------|
| ground  | 1000  |
| air     | 351   |
| water   | 67    |
| untyped | 2     |

The 2 untyped fragments are the "HQ" spawns `E_D1_HQ_GodFragment_02_001` and
`E_L1_HQ_GodFragment_01` (no suffix). **Decision: fold untyped → `ground`.**

## Approach

Derive the type in **`tools`** (the only layer that sees the raw export) and
persist it as a `fragmentType` field on the emitted marker in
`data/markers/*.json`. The frontend stays a pure renderer.

Rejected alternatives:
- *Derive in the frontend* — impossible; the frontend never sees the `EnvObj`
  name.
- *Ship the raw `EnvObj` name and parse the suffix client-side* — pushes parsing
  and noisy data into the UI; the canonical dataset should already be clean.

This keeps the existing data-flow contract intact: `tools` own the
world→dataset transform and classification; the frontend renders what it's given.

## Changes

### 1. tools — derive & emit the type

`tools/aion2/tools/maps/extract.py`, god-fragment loop (~L444–458):

- Add a cached `EnvObjId → Name` lookup (reuse `_table("EnvObjData.json")`).
- For each fragment, classify by the `Name` suffix, case-insensitive:
  - ends with `_air`  → `"air"`
  - ends with `_water` → `"water"`
  - otherwise          → `"ground"` (covers `_ground` **and** the untyped HQ
    fragments)
- Add `"Type": <classification>` to each entry appended to `fragments`.

`tools/aion2/tools/maps/emit_frontend.py`, `build_markers` fragments block
(~L341–352):

- Add `"fragmentType": f.get("Type", "ground")` to the emitted marker dict.

**Regeneration:** run the extract step then the emit step to rewrite
`data/markers/*.json`. `tools/` and `data/` are independent git repos and are
committed separately.

### 2. frontend — type model

`frontend/src/types/game.ts`, `MarkerInstance`:

```ts
/** For fragment markers: which physical kind (drives dialog text + icon badge). */
fragmentType?: "ground" | "air" | "water";
```

### 3. frontend — dialog (append to meta line)

`frontend/src/features/map/popup/MarkerPopupContent.tsx`:

- When `marker.fragmentType` is present, append a localized label to the
  existing category/subtype meta line with a middot separator, before the
  coordinates. Example rendered line:

  `Collection / Monolith · Air (4708, 3924)`

- Label via `t(\`common:fragmentType.${marker.fragmentType}\`)`. Text only — no
  glyph in the dialog.

### 4. frontend — marker icon badge (air/water only)

`frontend/src/features/map/canvas/markerIcons.tsx`, `createPinIcon`:

- Add an optional param (e.g. `fragmentType?: "ground" | "air" | "water"`).
- Include it in `cacheKey` so distinct badges don't share a cached `DivIcon`.
- In the relative-positioned 40×40 wrapper, render — **only when not
  completed**:
  - `air`   → `<ChevronUp>` (lucide), `size={12}`, `color="#22c55e"`,
    `position:absolute; right:-2px; bottom:-2px`
  - `water` → `<ChevronDown>` same placement/color
  - `ground` → nothing
- **Overlap rule:** the completion `CheckCircle` already occupies bottom-right
  and dims the icon to 0.4. The chevron uses the same slot, so it is rendered
  only when the marker is **not** completed; when completed, the check wins and
  existing behavior is unchanged.

`frontend/src/features/map/canvas/GameMarker.tsx`:

- Fragments carry a game icon, so they render through the `image` branch. Pass
  `marker.fragmentType` into that `createPinIcon(...)` call. (Other branches are
  unaffected; non-fragment markers have no `fragmentType`.)

### 5. locales — static enum labels

Hand-authored UI strings (not per-marker data), so they go in the app's own
namespace `common` under `frontend/public/locales/<lng>/common.yaml`:

```yaml
fragmentType:
  ground: "Ground"   # zh-CN/zh-TW: 地面
  air: "Air"         # zh-CN/zh-TW: 空中
  water: "Water"     # zh-CN/zh-TW: 水中
```

Add to `en`, `zh-CN`, and `zh-TW`. The Chinese labels (地面 / 空中 / 水中) are
UI-invented (the game L10N has no direct string for these) and were approved for
review.

## Out of scope (YAGNI)

- No sidebar/legend filter by fragment type.
- No badge for ground (explicitly unchanged).
- No change to fragment grouping, LOD tier, or the Monolith achievement-group
  linkage.

## Verification

- **tools:** after regeneration, spot-check `data/markers/World_L_A.json` (or any
  L-map with Verteron fragments) contains `fragmentType` on every `fragments`
  marker, with a plausible ground/air/water mix and no missing values.
- **frontend:** load a map with air + water fragments; confirm the dialog meta
  line shows the localized type, air markers show a green up-chevron, water a
  green down-chevron, ground none, and a completed fragment shows only the check.
