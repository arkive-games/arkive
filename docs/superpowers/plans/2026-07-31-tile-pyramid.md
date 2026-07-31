# Tile Pyramid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Downscaled tile levels (z-1/z-2/z-3) for palworld plus native-level support in both map engines, so whole-map views decode ~4 MB instead of 144–268 MB (fixes the iOS pal-detail tab-OOM reload).

**Architecture:** The palworld tools pipeline slices three halving pyramid levels next to the existing flat level-0 tiles; an optional `tileLevels` field rides in `maps.json`; the Leaflet engine exposes the pyramid via `minNativeZoom` and a level-aware `getTileUrl`, the GL engine picks a level per frame from the continuous camera zoom. Apps' `tileUrl` resolvers gain an optional `level` parameter; absent `tileLevels` keeps today's behavior bit-for-bit.

**Tech Stack:** Pillow (tools, Python/uv/pytest), TypeScript + zod (data-contract), Leaflet `L.TileLayer` native-zoom mechanics, three.js tile layer (map-engine-gl), vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-tile-pyramid-design.md`

---

## Preamble for the executor

- **Worktree** (project convention). **Local `master` is ahead of `origin/master`** — after `EnterWorktree`, immediately run `git rebase master` in the worktree or you build against stale code.
- Commits sign automatically; never `--no-gpg-sign`. Stage explicit paths, never `git add -A`. Pure English in all repo content; the changelog step's zh locales are locale data (allowed).
- Frontend commands run from `frontend/`; tools commands from `tools/` (`uv run ...`).
- Artifact regeneration (Task 6) writes to the **sibling repos** `E:\arkive-games\data-palworld` and `E:\arkive-games\resource-palworld` — real repos, commit locally there, do NOT push.
- The palworld raw export lives at `E:\SteamLibrary\steamapps\common\Palworld\Exports`; the pipeline reads paths from `tools/.env` (gitignored, already configured — missing vars raise).

### Level math (used everywhere; keep consistent)

- `level` = number of halvings; 0 = native. Palworld: `tileLevels = 3`.
- Grid at level L: `ceil(tilesCount / 2^L)` (exact for palworld: 8→4→2→1).
- Tile size in MAP pixels at level L: `tileWidth * 2^L`. Tile IMAGE stays 1024².
- URL layout: level 0 `tiles/<Map>/<Map>_XX_YY.webp` (unchanged); level L>0 `tiles/<Map>/z-<L>/<Map>_XX_YY.webp`.

---

### Task 1: Data contract — optional `tileLevels`

**Files:**
- Modify: `frontend/packages/data-contract/src/types.ts` (GameMapMeta, ~line 29-42)
- Modify: `frontend/packages/data-contract/src/schemas.ts` (gameMapMetaSchema, ~line 22-31)
- Test: `frontend/packages/data-contract/src/schemas.test.ts` (create if absent; check for an existing schema test file first and extend it instead)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { gameMapMetaSchema } from "./schemas";

const BASE = {
  id: "MainWorld",
  name: "MainWorld",
  type: "world",
  tileWidth: 1024,
  tileHeight: 1024,
  tilesCountX: 8,
  tilesCountY: 8,
  isVisible: true,
};

describe("gameMapMetaSchema tileLevels", () => {
  it("accepts a map without tileLevels (single-level data)", () => {
    expect(gameMapMetaSchema.safeParse(BASE).success).toBe(true);
  });
  it("accepts a non-negative integer tileLevels", () => {
    expect(gameMapMetaSchema.safeParse({ ...BASE, tileLevels: 3 }).success).toBe(true);
    expect(gameMapMetaSchema.safeParse({ ...BASE, tileLevels: 0 }).success).toBe(true);
  });
  it("rejects negative or fractional tileLevels", () => {
    expect(gameMapMetaSchema.safeParse({ ...BASE, tileLevels: -1 }).success).toBe(false);
    expect(gameMapMetaSchema.safeParse({ ...BASE, tileLevels: 1.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `pnpm vitest run packages/data-contract`
Expected: FAIL (tileLevels not in schema → strict? if the schema is non-strict the accept cases pass but reject cases fail — either way at least one test fails).

- [ ] **Step 3: Implement**

In `types.ts`, add to `GameMapMeta` after `tilesCountY`:

```ts
  /**
   * Number of downscaled halving tile levels available IN ADDITION to the
   * native level 0 (3 ⇒ tiles/<Map>/z-1..z-3 exist, each level halving the
   * previous one's map coverage per tile). Absent or 0 ⇒ single-level tiles,
   * the pre-pyramid behavior.
   */
  tileLevels?: number;
```

In `schemas.ts`, add to `gameMapMetaSchema` after `tilesCountY`:

```ts
  tileLevels: z.number().int().nonnegative().optional(),
```

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run packages/data-contract` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/data-contract/src/types.ts frontend/packages/data-contract/src/schemas.ts frontend/packages/data-contract/src/schemas.test.ts
git commit -m "feat(data-contract): optional tileLevels on GameMapMeta"
```

---

### Task 2: Leaflet engine — native pyramid levels

**Files:**
- Modify: `frontend/packages/map-engine/src/engineTypes.ts:57` (MapAssets.tileUrl)
- Modify: `frontend/packages/map-engine/src/components/GameMapTiles.tsx`
- Modify: `frontend/packages/map-engine/README.md:105` (tileUrl doc line)
- Test: `frontend/packages/map-engine/src/components/resolveTileCoords.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import type { GameMapMeta } from "@gamemap/data-contract";
import { resolveTileCoords } from "./GameMapTiles";

const MAP: GameMapMeta = {
  id: "MainWorld", name: "MainWorld", type: "world",
  tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8,
  isVisible: true, tileLevels: 3,
};

describe("resolveTileCoords", () => {
  it("maps level-0 coords (z=0, negative y) to the top-left-origin grid", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -8, z: 0 })).toEqual({ level: 0, x: 0, y: 0 });
    expect(resolveTileCoords(MAP, { x: 7, y: -1, z: 0 })).toEqual({ level: 0, x: 7, y: 7 });
  });
  it("maps native zoom -1 to level 1 with a 4x4 grid", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -4, z: -1 })).toEqual({ level: 1, x: 0, y: 0 });
    expect(resolveTileCoords(MAP, { x: 3, y: -1, z: -1 })).toEqual({ level: 1, x: 3, y: 3 });
  });
  it("maps native zoom -3 to the single whole-map tile", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -1, z: -3 })).toEqual({ level: 3, x: 0, y: 0 });
  });
  it("rejects out-of-grid indices per level", () => {
    expect(resolveTileCoords(MAP, { x: 8, y: -1, z: 0 })).toBeNull();
    expect(resolveTileCoords(MAP, { x: 4, y: -1, z: -1 })).toBeNull();
    expect(resolveTileCoords(MAP, { x: 0, y: 0, z: 0 })).toBeNull(); // y >= 0 is below the map
  });
  it("clamps the level to the map's tileLevels (positive z stays level 0)", () => {
    expect(resolveTileCoords(MAP, { x: 0, y: -8, z: 2 })).toEqual({ level: 0, x: 0, y: 0 });
    const single: GameMapMeta = { ...MAP, tileLevels: undefined };
    expect(resolveTileCoords(single, { x: 0, y: -8, z: 0 })).toEqual({ level: 0, x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run to verify fail**: `pnpm vitest run packages/map-engine` → FAIL (`resolveTileCoords` not exported).

- [ ] **Step 3: Implement**

`engineTypes.ts` — replace the `tileUrl` declaration (keep the surrounding doc, extend it):

```ts
  /**
   * URL of the map tile at grid indices (x, y) of pyramid level `level`
   * (halvings from native; 0/omitted = native level 0). The engine only asks
   * for levels ≤ `map.tileLevels ?? 0`, and rejects out-of-range indices for
   * the level's grid (`ceil(tilesCount / 2^level)`) rather than clamping.
   * Orientation: (x=0, y=0) is the top-left tile; y increases downward.
   */
  tileUrl(map: GameMapMeta, x: number, y: number, level?: number): string;
```

`GameMapTiles.tsx` — add the exported pure helper above the class, rewrite `getTileUrl` to use it, and wire `minNativeZoom`:

```ts
export interface TileGridRef {
  level: number;
  x: number;
  y: number;
}

/**
 * Leaflet tile coords (z = the clamped NATIVE zoom Leaflet chose, y negative
 * above the CRS.Simple origin) → pyramid level + top-left-origin grid indices.
 * Null = outside the level's grid (noWrap: no tile requested).
 */
export function resolveTileCoords(
  map: GameMapMeta,
  coords: { x: number; y: number; z: number },
): TileGridRef | null {
  const levels = Math.max(0, map.tileLevels ?? 0);
  const level = Math.min(levels, Math.max(0, -coords.z));
  const countX = Math.ceil(map.tilesCountX / 2 ** level);
  const countY = Math.ceil(map.tilesCountY / 2 ** level);
  const x = coords.x;
  const y = countY + coords.y;
  if (x < 0 || y < 0 || x >= countX || y >= countY) return null;
  return { level, x, y };
}
```

Replace the body of `GameTileLayer.getTileUrl` with:

```ts
  getTileUrl(coords: L.Coords): string {
    const { selectedMap, assets, isWatermark } = this.gameOptions;
    const ref = resolveTileCoords(selectedMap, coords);
    if (!ref) return "";
    if (isWatermark) return assets.watermarkUrl ?? "";
    // The engine owns grid math; the app owns URL construction.
    return assets.tileUrl(selectedMap, ref.x, ref.y, ref.level);
  }
```

In the `GameMapTiles` component effect, change BOTH layer constructions (base and watermark) from `minNativeZoom: 0` to:

```ts
      minNativeZoom: -(selectedMap.tileLevels ?? 0),
```

(`maxNativeZoom: 0` stays.) Leaflet then requests z-`L` native tiles at far zooms and CSS-scales between levels — no other Leaflet mechanics change.

`README.md:105` — update the doc line to: `` `tileUrl(map, x, y, level = 0)` — tile at grid indices of pyramid level `level` (halvings from native); ... ``

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run packages/map-engine` → PASS. Also `pnpm check:engine` → exit 0 (grep-based purity gate must stay clean).

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/map-engine/src/engineTypes.ts frontend/packages/map-engine/src/components/GameMapTiles.tsx frontend/packages/map-engine/src/components/resolveTileCoords.test.ts frontend/packages/map-engine/README.md
git commit -m "feat(map-engine): pyramid-level tile resolution via tileLevels"
```

---

### Task 3: GL engine — per-frame level selection

**Files:**
- Modify: `frontend/packages/map-engine-gl/src/core/assets.ts:21` (tileUrl signature — same text as Task 2's engineTypes change)
- Modify: `frontend/packages/map-engine-gl/src/core/tileLayer.ts`
- Test: extend `frontend/packages/map-engine-gl/src/core/tileLayer.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the existing test file; reuse its existing fake-loader/map helpers if present, otherwise these are self-contained)

```ts
import { Camera } from "./camera";
import { levelForZoom, TileLayer, tileKey } from "./tileLayer";
import type { GameMapMeta } from "@gamemap/data-contract";

const PYRAMID_MAP: GameMapMeta = {
  id: "M", name: "M", type: "world",
  tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8,
  isVisible: true, tileLevels: 3,
};

describe("levelForZoom", () => {
  it("stays at native level near full zoom", () => {
    expect(levelForZoom(0, 3)).toBe(0);
    expect(levelForZoom(-0.99, 3)).toBe(0);
    expect(levelForZoom(1.5, 3)).toBe(0);
  });
  it("halves per zoom step out and clamps to the available levels", () => {
    expect(levelForZoom(-1, 3)).toBe(1);
    expect(levelForZoom(-2.4, 3)).toBe(2);
    expect(levelForZoom(-3, 3)).toBe(3);
    expect(levelForZoom(-4, 3)).toBe(3);
  });
  it("is 0 for single-level maps regardless of zoom", () => {
    expect(levelForZoom(-4, 0)).toBe(0);
  });
});

describe("TileLayer pyramid", () => {
  const makeLayer = (map: GameMapMeta, urls: string[]) =>
    new TileLayer({
      map,
      assets: {
        tileUrl: (m, x, y, level = 0) => {
          const u = `t/${level}/${x}_${y}`;
          urls.push(u);
          return u;
        },
        markerIconUrl: () => "",
      },
      invalidate: () => {},
      loader: { load: () => () => {} }, // never resolves; we only assert URLs
      maxNewTilesPerFrame: 99,
      padTiles: 0,
    });

  it("requests the single z-3 tile at whole-map zoom", () => {
    const urls: string[] = [];
    const layer = makeLayer(PYRAMID_MAP, urls);
    const camera = new Camera({
      mapWidthPx: 8192, mapHeightPx: 8192, minZoom: -4, maxZoom: 2,
      viewportWidth: 400, viewportHeight: 300,
    });
    camera.setView({ x: 4096, y: 4096 }, -4);
    layer.update(camera);
    expect(urls).toEqual(["t/3/0_0"]);
    layer.dispose();
  });

  it("requests level-0 tiles near full zoom and keys the cache per level", () => {
    const urls: string[] = [];
    const layer = makeLayer(PYRAMID_MAP, urls);
    const camera = new Camera({
      mapWidthPx: 8192, mapHeightPx: 8192, minZoom: -4, maxZoom: 2,
      viewportWidth: 400, viewportHeight: 300,
    });
    camera.setView({ x: 4096, y: 4096 }, 0);
    layer.update(camera);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("t/0/"))).toBe(true);
    expect(tileKey(3, 0, 0)).not.toBe(tileKey(0, 0, 0));
    layer.dispose();
  });
});
```

- [ ] **Step 2: Run to verify fail**: `pnpm vitest run packages/map-engine-gl/src/core/tileLayer.test.ts` → FAIL (`levelForZoom` not exported; `tileKey` arity).

- [ ] **Step 3: Implement** in `tileLayer.ts`:

a) `assets.ts`: change the signature to `tileUrl(map: GameMapMeta, x: number, y: number, level?: number): string;` with the same doc text as Task 2's engineTypes.ts change.

b) Add near the index-math section:

```ts
/**
 * Pyramid level for a camera zoom: the deepest level whose tiles are still
 * displayed at ≤ native resolution (`floor(-zoom)`), clamped to what the map
 * ships (`tileLevels`). Level 0 from zoom > -1 upward.
 */
export function levelForZoom(zoom: number, tileLevels: number): number {
  if (!Number.isFinite(zoom) || tileLevels <= 0) return 0;
  return Math.min(Math.floor(tileLevels), Math.max(0, Math.floor(-zoom)));
}
```

c) `tileKey` gains the level: `export function tileKey(level: number, x: number, y: number): string { return `${level}:${x}:${y}`; }` — update the JSDoc ("Cache/identity key of a tile at a pyramid level").

d) `TileEntry` gains `level: number`.

e) `update(camera)`: compute the level and level-scaled geometry before the range:

```ts
    const levels = Math.max(0, this.map.tileLevels ?? 0);
    const level = levelForZoom(camera.zoom, levels);
    const size = this.tileSize * 2 ** level;
    const countX = Math.ceil(this.map.tilesCountX / 2 ** level);
    const countY = Math.ceil(this.map.tilesCountY / 2 ** level);
    const bounds = camera.visibleBounds(0);
    const range = visibleTileRange(bounds, size, countX, countY, this.padTiles);
```

Inside the loop use `tileKey(level, x, y)`; `missing` entries stay `{x, y}` and `this.beginTile(level, tile.x, tile.y)` starts them. `sortTilesFromCentre(missing, {...}, size)` uses the level size.

f) `beginTile(level: number, x: number, y: number)`: guard with `isInGrid(x, y, countX, countY)` computed from the level (recompute `Math.ceil(this.map.tilesCountX / 2 ** level)` locally); entry `{ level, x, y, mesh: null, texture: null, cancel: null }`; key `tileKey(level, x, y)`; URL `this.assets.tileUrl(this.map, x, y, level)`.

g) `attach(entry, texture)`: `const size = this.tileSize * 2 ** entry.level;` (mesh scale + `tileCentre(entry.x, size)` position as today).

The watermark layer, LRU eviction, throttle, and `clearTiles` are untouched (keys are unique across levels, so eviction Just Works; a level flip leaves the old level's tiles invisible and they age out of the LRU).

- [ ] **Step 4: Run to verify pass**: `pnpm vitest run packages/map-engine-gl` → PASS (including all pre-existing tileLayer/renderer/marker tests). Also `pnpm check:engine-gl` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/map-engine-gl/src/core/assets.ts frontend/packages/map-engine-gl/src/core/tileLayer.ts frontend/packages/map-engine-gl/src/core/tileLayer.test.ts
git commit -m "feat(map-engine-gl): pyramid level selection in the tile layer"
```

---

### Task 4: Palworld asset resolver + app build

**Files:**
- Modify: `frontend/apps/palworld/src/lib/assets.ts:6-11`

- [ ] **Step 1: Implement** (no unit-test harness for URL strings exists in the app; the engine tests cover the level math — keep this a direct change):

```ts
export const palworldAssets: MapAssets = {
  // Level 0 tiles sit flat in tiles/<Map>/; pyramid levels in tiles/<Map>/z-<L>/
  // (same XX_YY naming). See the tile-pyramid design spec.
  tileUrl: (map, x, y, level = 0) =>
    `${RES_BASE}/tiles/${map.id}/${level > 0 ? `z-${level}/` : ''}${map.id}_${pad2(x)}_${pad2(y)}.webp`,
  markerIconUrl: (icon) =>
    icon ? `${RES_BASE}/icons/${icon}.webp` : '',
}
```

aion2/vrising resolvers need NO change: their 3-argument functions still satisfy the widened interface (structural typing), and their data never sets `tileLevels`, so the engines never pass `level > 0`.

- [ ] **Step 2: Verify the whole workspace builds and tests pass**

Run (from `frontend/`): `pnpm test` → PASS; `pnpm build:palworld` → clean; `pnpm --filter aion2 exec tsc -b && pnpm --filter vrising exec tsc -b` → clean (confirms the widened signature breaks no app).

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/palworld/src/lib/assets.ts
git commit -m "feat(palworld): pyramid-aware tile URLs"
```

---

### Task 5: Tools pipeline — slice pyramid levels, emit tileLevels

**Files:**
- Modify: `tools/apps/palworld/maps/tiles.py` (constants + `slice_tiles`)
- Modify: `tools/apps/palworld/maps/emit.py:113-122` (maps metadata) — and import the constants
- Test: `tools/apps/palworld/tests/test_tiles_pyramid.py` (new)

- [ ] **Step 1: Write the failing test**

```python
"""Pyramid slicing: every level's file set and pixel size, on a tiny synthetic map."""
from pathlib import Path

from PIL import Image

from palworld.maps import tiles


def test_slice_tiles_emits_all_pyramid_levels(tmp_path, monkeypatch):
    # Shrink the world: 8x8 grid of 32px tiles = 256px source, 3 halving levels.
    monkeypatch.setattr(tiles, "TILE", 32)
    monkeypatch.setattr(tiles, "MAP_IMAGES", {"Mini": "mini.png"})
    monkeypatch.setattr(tiles, "VOID_PARAMS", {"Mini": {"tol": 140, "inset": 0}})
    raw = tmp_path / "raw"
    raw.mkdir()
    Image.new("RGBA", (256, 256), (200, 60, 60, 255)).save(raw / "mini.png")
    res = tmp_path / "res"

    tiles.slice_tiles(raw, res)

    base = res / "tiles" / "Mini"
    assert len(list(base.glob("Mini_*.webp"))) == 64
    assert len(list((base / "z-1").glob("Mini_*.webp"))) == 16
    assert len(list((base / "z-2").glob("Mini_*.webp"))) == 4
    assert len(list((base / "z-3").glob("Mini_*.webp"))) == 1
    with Image.open(base / "z-3" / "Mini_00_00.webp") as im:
        assert im.size == (32, 32)  # whole map in one tile-sized image
    with Image.open(base / "z-1" / "Mini_03_03.webp") as im:
        assert im.size == (32, 32)


def test_grid_divides_cleanly_for_all_levels():
    # COUNT must halve LEVELS times without remainder (8 -> 4 -> 2 -> 1).
    assert tiles.COUNT % (1 << tiles.LEVELS) == 0
```

- [ ] **Step 2: Run to verify fail**

Run (from `tools/`): `uv run pytest apps/palworld/tests/test_tiles_pyramid.py -v`
Expected: FAIL — `tiles` has no attribute `LEVELS`, and no `z-*` dirs are produced.

- [ ] **Step 3: Implement**

`tiles.py` — add after `COUNT = 8`:

```python
# Downscaled halving pyramid levels emitted alongside level 0 (z-1..z-3;
# z-3 = the whole map in one TILE-px tile). Mirrored into maps.json as
# `tileLevels` so the frontend engines know the levels exist.
LEVELS = 3
```

Rewrite `slice_tiles` to loop levels (level 0 keeps its flat output path and existing bytes):

```python
def slice_tiles(raw: Path, res_out: Path) -> None:
    """Slice each world map image into the pyramid: level 0 is the native 8x8
    ``TILE``-px grid (flat in ``tiles/<Map>/``); levels 1..``LEVELS`` halve the
    (void-cleared) image per step into ``tiles/<Map>/z-<L>/``, so far-out views
    fetch a handful of small tiles instead of the full-resolution grid. Kept
    separate from icon/note conversion so tiles can be regenerated on their own.
    """
    raw, res_out = Path(raw), Path(res_out)
    for map_id, img_rel in MAP_IMAGES.items():
        dir_ = res_out / "tiles" / map_id
        params = VOID_PARAMS[map_id]
        with Image.open(raw / img_rel) as img:
            img = _clear_void(img, params["tol"], params["inset"])
            total = 0
            for lvl in range(LEVELS + 1):
                count = COUNT >> lvl
                if count == 0:
                    break
                lvl_dir = dir_ if lvl == 0 else dir_ / f"z-{lvl}"
                lvl_dir.mkdir(parents=True, exist_ok=True)
                size = TILE * count
                src = img if lvl == 0 else img.resize((size, size), Image.LANCZOS)
                for x in range(count):
                    for y in range(count):
                        tile = src.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE))
                        _save_webp(tile, lvl_dir / f"{map_id}_{x:02d}_{y:02d}.webp")
                total += count * count
        print(f"tiles: {map_id} {total} tiles across {LEVELS + 1} levels")
```

`emit.py` — add the import at the top (near the other relative imports): `from .tiles import COUNT, LEVELS, TILE` and replace the hardcoded literals in the maps entry (line ~115):

```python
        "tileWidth": TILE, "tileHeight": TILE, "tilesCountX": COUNT, "tilesCountY": COUNT,
        "tileLevels": LEVELS,
```

- [ ] **Step 4: Run to verify pass**

Run (from `tools/`): `uv run pytest apps/palworld/tests/ -v`
Expected: the two new tests PASS, all pre-existing palworld tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/palworld/maps/tiles.py tools/apps/palworld/maps/emit.py tools/apps/palworld/tests/test_tiles_pyramid.py
git commit -m "feat(tools): palworld tile pyramid (z-1..z-3) and tileLevels metadata"
```

---

### Task 6: Regenerate artifacts (sibling repos, commit locally, NO push)

- [ ] **Step 1: Check the artifact repos are clean**: `git -C E:/arkive-games/data-palworld status --short` and same for `resource-palworld` — if dirty, STOP and report (the user may have uncommitted work).

- [ ] **Step 2: Run the stages** (from `tools/`):

```bash
uv run python -m palworld.maps emit
uv run python -m palworld.maps tiles
```

Expected: `tiles: MainWorld 85 tiles across 4 levels` (64+16+4+1) and same for WorldTree; emit rewrites `maps.json`. If env vars are missing the runner raises — report rather than improvising paths.

- [ ] **Step 3: Verify the outputs**

```bash
ls E:/arkive-games/resource-palworld/tiles/MainWorld/z-1 | wc -l   # 16
ls E:/arkive-games/resource-palworld/tiles/MainWorld/z-3           # MainWorld_00_00.webp
grep -o '"tileLevels": *3' E:/arkive-games/data-palworld/maps.json # two hits (MainWorld, WorldTree)
git -C E:/arkive-games/resource-palworld status --short | head     # ONLY new z-* files (level-0 bytes unchanged ⇒ not listed)
```

Then contract-validate (from `frontend/`): `pnpm validate-data` → PASS. (If level-0 webp bytes DID change — Pillow version drift — that's not an error, but note it in the report.)

- [ ] **Step 4: Commit the artifact repos** (each locally, do NOT push):

```bash
git -C E:/arkive-games/data-palworld add maps.json && git -C E:/arkive-games/data-palworld commit -m "maps: tileLevels 3 (pyramid)"
git -C E:/arkive-games/resource-palworld add tiles && git -C E:/arkive-games/resource-palworld commit -m "tiles: z-1..z-3 pyramid levels for MainWorld and WorldTree"
```

(Plus any changed level-0 files if Step 3 showed drift — stage `tiles/` as above either way.)

---

### Task 7: Full verification sweep

- [ ] **Step 1** (from `frontend/`): `pnpm test` → all pass; `pnpm build:palworld` → clean.
- [ ] **Step 2**: palworld e2e: `pnpm e2e:palworld` — baseline is **63 passed + 2 known pre-existing failures** (ko-KR smoke, dungeons "Hard · bonus"); anything beyond those two failing = investigate before proceeding.
- [ ] **Step 3**: report done — the acceptance memory measurement is run by the coordinator after integration (dev server picks the merged code + regenerated sibling artifacts up automatically).

---

### Task 8: Integrate + changelog (coordinator-level)

- [ ] Rebase the worktree branch onto `master`, fast-forward `master`, run `pnpm test` on the merged result, remove the worktree (`ExitWorktree`), per `superpowers:finishing-a-development-branch`.
- [ ] Acceptance measurement (coordinator, playwright vs the dev server at `http://localhost:15174/pals/SheepBall`, 390×844 viewport): tile decode at the spawn embed must be **≤ ~8 MB** (was 144 MB) — count `.leaflet-tile-container img` naturalWidth×naturalHeight×4.
- [ ] Changelog PATCH (after the merge, from `frontend/`):

```bash
pnpm changelog:add --app palworld --bump patch --kind fix \
  --en "Fixed the page reloading itself on iPhone/iPad when opening a pal's detail page — the spawn mini-map now uses a fraction of the memory." \
  --zh-cn "修复 iPhone/iPad 打开帕鲁详情页时页面自动刷新的问题——出没位置小地图的内存占用大幅降低。" \
  --zh-tw "修復 iPhone/iPad 開啟帕魯詳情頁時頁面自動重新整理的問題——出沒位置小地圖的記憶體佔用大幅降低。"
git add frontend/apps/palworld/src/changelog.json
git commit -m "docs(palworld): changelog for the mobile detail-page crash fix"
pnpm changelog:verify
```

---

## Operational follow-up (after the plan)

1. Rebuild + republish the toy: `pnpm toy:build --app palworld` then `pnpm toy:publish --app palworld` (preview), user checks, explicit confirmation, `--submit`.
2. Pushing the monorepo / artifact repos to origin (deploys the live site's data): user's call — surface it, don't push unprompted.
3. Sub-project 2 (GameMapEmbed port) gets its own brainstorm/spec.
