import { describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import type { GameMapMeta } from "@gamemap/data-contract";
import type { MapAssets } from "./assets.ts";
import { Camera } from "./camera.ts";
import { LayerOrder } from "./renderer.ts";
import {
  isEmptyTileRange,
  isInGrid,
  TileLayer,
  tileKey,
  tileRangeCount,
  visibleTileRange,
  WatermarkLayer,
  type TileLoader,
} from "./tileLayer.ts";
import type { PixelBounds } from "./types.ts";

// A palworld-shaped map: 256 px tiles, 32×32 grid = 8192² px.
function makeMap(over: Partial<GameMapMeta> = {}): GameMapMeta {
  return {
    id: "MainWorld",
    name: "Main World",
    type: "world",
    tileWidth: 256,
    tileHeight: 256,
    tilesCountX: 32,
    tilesCountY: 32,
    isVisible: true,
    ...over,
  };
}

function bounds(minX: number, minY: number, maxX: number, maxY: number): PixelBounds {
  return { minX, minY, maxX, maxY };
}

// ------------------------------------------------------------- index math ---

describe("visibleTileRange", () => {
  it("covers exactly the tiles a view touches (pad 0)", () => {
    // 256 px tiles: [300, 800] × [10, 260] touches x 1..3, y 0..1.
    expect(visibleTileRange(bounds(300, 10, 800, 260), 256, 32, 32, 0)).toEqual({
      minX: 1,
      minY: 0,
      maxX: 3,
      maxY: 1,
    });
  });

  it("excludes a tile the view only touches at its very edge", () => {
    // The right edge lands exactly on the boundary of tile 2 → tiles 0..1.
    expect(visibleTileRange(bounds(0, 0, 512, 512), 256, 32, 32, 0)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
    });
  });

  it("grows by `pad` tiles on every side", () => {
    const padless = visibleTileRange(bounds(1000, 1000, 1500, 1500), 256, 32, 32, 0);
    expect(padless).toEqual({ minX: 3, minY: 3, maxX: 5, maxY: 5 });
    expect(visibleTileRange(bounds(1000, 1000, 1500, 1500), 256, 32, 32, 1)).toEqual({
      minX: 2,
      minY: 2,
      maxX: 6,
      maxY: 6,
    });
    expect(visibleTileRange(bounds(1000, 1000, 1500, 1500), 256, 32, 32, 3)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 8,
      maxY: 8,
    });
  });

  it("clamps to the grid instead of returning out-of-grid indices", () => {
    // A whole-map view at min zoom: the viewport overhangs the grid on all sides.
    const range = visibleTileRange(bounds(-4000, -4000, 12000, 12000), 256, 32, 32, 1);
    expect(range).toEqual({ minX: 0, minY: 0, maxX: 31, maxY: 31 });
    expect(tileRangeCount(range)).toBe(32 * 32);
  });

  it("clamps a non-square grid per axis", () => {
    expect(visibleTileRange(bounds(-100, -100, 9000, 9000), 256, 8, 4, 1)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 7,
      maxY: 3,
    });
  });

  it("is empty when the view sits entirely off the grid", () => {
    const left = visibleTileRange(bounds(-5000, 100, -4000, 900), 256, 32, 32, 1);
    expect(isEmptyTileRange(left)).toBe(true);
    expect(tileRangeCount(left)).toBe(0);
    const below = visibleTileRange(bounds(100, 20000, 900, 21000), 256, 32, 32, 1);
    expect(isEmptyTileRange(below)).toBe(true);
  });

  it("is empty for degenerate metadata instead of producing NaN indices", () => {
    expect(isEmptyTileRange(visibleTileRange(bounds(0, 0, 100, 100), 0, 32, 32))).toBe(
      true,
    );
    expect(
      isEmptyTileRange(visibleTileRange(bounds(0, 0, 100, 100), Number.NaN, 32, 32)),
    ).toBe(true);
    expect(isEmptyTileRange(visibleTileRange(bounds(0, 0, 100, 100), 256, 0, 32))).toBe(
      true,
    );
    expect(
      isEmptyTileRange(
        visibleTileRange(bounds(Number.NaN, 0, 100, 100), 256, 32, 32),
      ),
    ).toBe(true);
  });

  it("treats a non-finite pad as 0", () => {
    expect(
      visibleTileRange(bounds(1000, 1000, 1500, 1500), 256, 32, 32, Number.NaN),
    ).toEqual({ minX: 3, minY: 3, maxX: 5, maxY: 5 });
  });
});

describe("isInGrid", () => {
  it("rejects negative and past-the-end indices", () => {
    expect(isInGrid(0, 0, 4, 4)).toBe(true);
    expect(isInGrid(3, 3, 4, 4)).toBe(true);
    expect(isInGrid(-1, 0, 4, 4)).toBe(false);
    expect(isInGrid(0, -1, 4, 4)).toBe(false);
    expect(isInGrid(4, 0, 4, 4)).toBe(false);
    expect(isInGrid(0, 4, 4, 4)).toBe(false);
  });
});

// ------------------------------------------------------------- layer setup ---

interface LoadRecord {
  url: string;
  texture: Texture;
  resolve: () => void;
  fail: () => void;
  cancelled: boolean;
}

/**
 * A loader that records every request and hands out real `THREE.Texture`s, so
 * disposal can be asserted on the real objects. `auto` resolves synchronously
 * (the common case in these tests); manual mode lets a test hold tiles pending.
 */
function stubLoader(auto = true): TileLoader & { loads: LoadRecord[] } {
  const loads: LoadRecord[] = [];
  return {
    loads,
    load(url, onLoad, onError) {
      const texture = new Texture();
      vi.spyOn(texture, "dispose");
      const record: LoadRecord = {
        url,
        texture,
        resolve: () => onLoad(texture),
        fail: () => onError?.(new Error("boom")),
        cancelled: false,
      };
      loads.push(record);
      if (auto) record.resolve();
      return () => {
        record.cancelled = true;
      };
    },
  };
}

function makeAssets(over: Partial<MapAssets> = {}): MapAssets {
  return {
    tileUrl: vi.fn((map: GameMapMeta, x: number, y: number) => `${map.id}/${x}_${y}.webp`),
    markerIconUrl: vi.fn(() => ""),
    ...over,
  };
}

function makeCamera(map: GameMapMeta, over: Partial<{ zoom: number; center: { x: number; y: number } }> = {}) {
  return new Camera({
    mapWidthPx: map.tileWidth * map.tilesCountX,
    mapHeightPx: map.tileHeight * map.tilesCountY,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: 1200,
    viewportHeight: 800,
    center: over.center ?? { x: 4096, y: 4096 },
    zoom: over.zoom ?? 0,
  });
}

function setup(
  opts: {
    map?: GameMapMeta;
    assets?: MapAssets;
    auto?: boolean;
    padTiles?: number;
    maxNewTilesPerFrame?: number;
    cacheFactor?: number;
    zoom?: number;
    center?: { x: number; y: number };
  } = {},
) {
  const map = opts.map ?? makeMap();
  const assets = opts.assets ?? makeAssets();
  const loader = stubLoader(opts.auto ?? true);
  const invalidate = vi.fn();
  const camera = makeCamera(map, { zoom: opts.zoom, center: opts.center });
  const layer = new TileLayer({
    map,
    assets,
    invalidate,
    loader,
    padTiles: opts.padTiles,
    maxNewTilesPerFrame: opts.maxNewTilesPerFrame,
    cacheFactor: opts.cacheFactor,
  });
  return { map, assets, loader, invalidate, camera, layer };
}

/** Tiles the layer considers visible for the current view. */
function visibleCount(camera: Camera, map: GameMapMeta, pad = 1): number {
  return tileRangeCount(
    visibleTileRange(
      camera.visibleBounds(0),
      map.tileWidth,
      map.tilesCountX,
      map.tilesCountY,
      pad,
    ),
  );
}

// ------------------------------------------------------------------ layer ---

describe("TileLayer grid + out-of-grid rejection", () => {
  it("requests exactly the visible tiles of a small map", () => {
    // 2×2 tiles of 256 px = 512² px, in a 1200×800 viewport at zoom 0: the whole
    // grid is visible and the view overhangs it on every side.
    const map = makeMap({ tilesCountX: 2, tilesCountY: 2 });
    const { layer, camera, assets, invalidate } = setup({
      map,
      center: { x: 256, y: 256 },
      maxNewTilesPerFrame: 64,
    });
    layer.update(camera);
    const calls = (assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, x, y]) => tileKey(x as number, y as number),
    );
    expect(calls.sort()).toEqual(["0:0", "0:1", "1:0", "1:1"]);
    expect(invalidate).toHaveBeenCalled(); // textures arrived
  });

  it("never calls assets.tileUrl for an out-of-grid index", () => {
    const map = makeMap({ tilesCountX: 4, tilesCountY: 3 });
    const { layer, camera, assets } = setup({
      map,
      center: { x: 0, y: 0 },
      maxNewTilesPerFrame: 999,
    });
    // Sweep the corners and the zoom range; the camera clamps its centre to the
    // map rect, so every one of these views overhangs the grid.
    for (const zoom of [-3, -1, 0, 2]) {
      for (const centre of [
        { x: 0, y: 0 },
        { x: 1024, y: 768 },
        { x: 512, y: 0 },
        { x: 0, y: 768 },
      ]) {
        camera.setView(centre, zoom);
        layer.update(camera);
      }
    }
    const spy = assets.tileUrl as ReturnType<typeof vi.fn>;
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const [, x, y] of spy.mock.calls) {
      expect(isInGrid(x as number, y as number, 4, 3)).toBe(true);
    }
  });

  it("places each tile quad at its map-pixel centre (y down, no flip)", () => {
    const { layer, camera } = setup({
      center: { x: 128, y: 128 },
      maxNewTilesPerFrame: 999,
      padTiles: 0,
      zoom: 2,
    });
    layer.update(camera);
    const meshes = layer.object3D.children;
    expect(meshes.length).toBeGreaterThan(0);
    const first = meshes.find((m) => m.position.x === 128 && m.position.y === 128);
    // Tile (0,0) spans [0,256)² → centred at (128,128); no vertical mirroring.
    expect(first).toBeDefined();
    expect(first?.scale.x).toBe(256);
    expect(first?.scale.y).toBe(256);
  });

  it("defaults to LayerOrder.tiles", () => {
    const { layer } = setup();
    expect(layer.order).toBe(LayerOrder.tiles);
  });
});

describe("TileLayer texture creation throttle", () => {
  it("creates at most 4 textures per frame and finishes on later frames", () => {
    // 1200×800 at zoom 0 with pad 1 → 8×6 = 48 tiles, far more than one frame's
    // budget: this is exactly the upload hitch the throttle exists to spread out.
    const { layer, camera, map, loader, invalidate } = setup();
    const total = visibleCount(camera, map);
    expect(total).toBe(48);

    layer.update(camera);
    expect(loader.loads).toHaveLength(4);
    expect(invalidate).toHaveBeenCalled(); // work left over → another frame

    layer.update(camera);
    expect(loader.loads).toHaveLength(8);
    layer.update(camera);
    expect(loader.loads).toHaveLength(12);

    // 48 tiles / 4 per frame = 12 frames total; 3 have run.
    for (let i = 0; i < 9; i++) layer.update(camera);
    expect(loader.loads).toHaveLength(total);

    // Fully loaded view: no new work and no follow-up frame requested.
    invalidate.mockClear();
    layer.update(camera);
    expect(loader.loads).toHaveLength(total);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("honours a custom per-frame budget", () => {
    const { layer, camera, loader } = setup({ maxNewTilesPerFrame: 1 });
    layer.update(camera);
    expect(loader.loads).toHaveLength(1);
    layer.update(camera);
    expect(loader.loads).toHaveLength(2);
  });
});

describe("TileLayer LRU cache", () => {
  it("reuses cached textures when a view is re-entered", () => {
    const { layer, camera, loader, invalidate, assets } = setup({
      maxNewTilesPerFrame: 999,
      zoom: 0,
    });
    layer.update(camera);
    const loadsAfterFirst = loader.loads.length;
    const urlCalls = (assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(loadsAfterFirst).toBeGreaterThan(0);

    // Same view again: no new work at all.
    layer.update(camera);
    expect(loader.loads).toHaveLength(loadsAfterFirst);
    expect((assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(urlCalls);

    // Nudge by a few pixels (same tile range) and back — still nothing new.
    camera.panBy(10, 10);
    layer.update(camera);
    camera.panBy(-10, -10);
    layer.update(camera);
    expect(loader.loads).toHaveLength(loadsAfterFirst);
    expect(invalidate).toHaveBeenCalled();
  });

  it("keeps ~2x the visible tiles and evicts the coldest first", () => {
    // padTiles 0 and a tight view keep the numbers small and predictable.
    const { layer, camera, map, loader } = setup({
      padTiles: 0,
      maxNewTilesPerFrame: 999,
      zoom: -1,
      center: { x: 1200, y: 1200 },
    });
    layer.update(camera);
    const firstVisible = visibleCount(camera, map, 0);
    expect(layer.cachedCount).toBe(firstVisible);

    // Pan far enough for a completely different tile range twice over.
    camera.setView({ x: 4000, y: 1200 }, -1);
    layer.update(camera);
    expect(layer.cachedCount).toBeLessThanOrEqual(visibleCount(camera, map, 0) * 2);

    camera.setView({ x: 7000, y: 1200 }, -1);
    layer.update(camera);
    expect(layer.cachedCount).toBeLessThanOrEqual(visibleCount(camera, map, 0) * 2);

    // The first view's textures are the coldest → they are the ones released.
    const firstViewTextures = loader.loads.slice(0, firstVisible).map((l) => l.texture);
    const disposed = firstViewTextures.filter(
      (t) => (t.dispose as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    );
    expect(disposed.length).toBe(firstViewTextures.length);
    // ...and the newest view's textures are still alive.
    const newest = loader.loads[loader.loads.length - 1].texture;
    expect((newest.dispose as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("disposes the material and detaches the mesh of an evicted tile", () => {
    const { layer, camera } = setup({
      padTiles: 0,
      maxNewTilesPerFrame: 999,
      zoom: -1,
      center: { x: 1200, y: 1200 },
    });
    layer.update(camera);
    const firstMeshes = [...layer.object3D.children];
    const materials = firstMeshes.map((m) =>
      vi.spyOn((m as unknown as { material: { dispose(): void } }).material, "dispose"),
    );

    camera.setView({ x: 4000, y: 1200 }, -1);
    layer.update(camera);
    camera.setView({ x: 7000, y: 1200 }, -1);
    layer.update(camera);

    expect(materials.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    for (const mesh of firstMeshes) {
      expect(layer.object3D.children).not.toContain(mesh);
    }
  });

  it("hides cached-but-off-screen tiles instead of dropping them", () => {
    const { layer, camera, loader } = setup({
      padTiles: 0,
      maxNewTilesPerFrame: 999,
      zoom: 0,
      center: { x: 4096, y: 4096 },
    });
    layer.update(camera);
    const kept = layer.cachedCount;
    // Move by one tile: most tiles stay visible, a column drops out of view.
    camera.setView({ x: 4096 + 256, y: 4096 }, 0);
    layer.update(camera);
    expect(layer.cachedCount).toBeGreaterThan(kept);
    const hidden = layer.object3D.children.filter((m) => !m.visible);
    expect(hidden.length).toBeGreaterThan(0);
    expect(loader.loads.every((l) => !l.cancelled)).toBe(true);
  });
});

describe("TileLayer async lifecycle", () => {
  it("cancels and discards a texture that arrives after eviction", () => {
    const { layer, camera, loader } = setup({
      auto: false,
      padTiles: 0,
      maxNewTilesPerFrame: 999,
      zoom: -1,
      center: { x: 1200, y: 1200 },
    });
    layer.update(camera);
    const pending = loader.loads[0];

    // Evict everything by moving far away twice (nothing has loaded, so the
    // cache is full of pending entries).
    camera.setView({ x: 4000, y: 1200 }, -1);
    layer.update(camera);
    camera.setView({ x: 7000, y: 1200 }, -1);
    layer.update(camera);
    expect(pending.cancelled).toBe(true);

    // A late arrival must not resurrect the tile nor leak the texture.
    const children = layer.object3D.children.length;
    pending.resolve();
    expect(layer.object3D.children.length).toBe(children);
    expect(pending.texture.dispose).toHaveBeenCalled();
  });

  it("does not retry a tile whose url is empty", () => {
    const assets = makeAssets({ tileUrl: vi.fn(() => "") });
    const { layer, camera, loader, invalidate } = setup({
      assets,
      maxNewTilesPerFrame: 999,
    });
    layer.update(camera);
    expect(loader.loads).toHaveLength(0);
    const calls = (assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    layer.update(camera);
    expect((assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps a failed tile cached rather than re-requesting it forever", () => {
    const { layer, camera, loader, assets } = setup({
      auto: false,
      maxNewTilesPerFrame: 999,
    });
    layer.update(camera);
    const requested = loader.loads.length;
    for (const load of loader.loads) load.fail();
    layer.update(camera);
    expect(loader.loads).toHaveLength(requested);
    expect((assets.tileUrl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requested);
  });
});

describe("TileLayer map switching", () => {
  it("drops every texture of the old map and rebuilds on the new grid", () => {
    const { layer, camera, loader, invalidate } = setup({ maxNewTilesPerFrame: 999 });
    layer.update(camera);
    const oldTextures = loader.loads.map((l) => l.texture);
    expect(oldTextures.length).toBeGreaterThan(0);

    const next = makeMap({ id: "WorldTree", tilesCountX: 4, tilesCountY: 4 });
    layer.setMap(next);
    expect(layer.cachedCount).toBe(0);
    expect(layer.object3D.children).toHaveLength(0);
    expect(
      oldTextures.every((t) => (t.dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1),
    ).toBe(true);
    expect(invalidate).toHaveBeenCalled();

    // The new grid is 4×4: nothing outside it may be requested.
    const camera2 = makeCamera(next, { center: { x: 512, y: 512 } });
    layer.update(camera2);
    for (const load of loader.loads.slice(oldTextures.length)) {
      expect(load.url.startsWith("WorldTree/")).toBe(true);
    }
    expect(layer.cachedCount).toBeGreaterThan(0);
    expect(layer.cachedCount).toBeLessThanOrEqual(16);
  });

  it("ignores setMap with the same meta", () => {
    const { layer, camera, map, invalidate } = setup({ maxNewTilesPerFrame: 999 });
    layer.update(camera);
    const cached = layer.cachedCount;
    invalidate.mockClear();
    layer.setMap(map);
    expect(layer.cachedCount).toBe(cached);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("releases everything on dispose and goes inert", () => {
    const { layer, camera, loader } = setup({ maxNewTilesPerFrame: 999 });
    layer.update(camera);
    const textures = loader.loads.map((l) => l.texture);
    layer.dispose();
    expect(layer.cachedCount).toBe(0);
    expect(
      textures.every((t) => (t.dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1),
    ).toBe(true);
    const loads = loader.loads.length;
    layer.update(camera);
    expect(loader.loads).toHaveLength(loads);
  });
});

// -------------------------------------------------------------- watermark ---

describe("WatermarkLayer", () => {
  it("tiles one texture over the visible grid at 0.2 opacity", () => {
    const map = makeMap({ tilesCountX: 4, tilesCountY: 4 });
    const loader = stubLoader(false);
    const invalidate = vi.fn();
    const layer = new WatermarkLayer({
      map,
      url: "watermark.webp",
      invalidate,
      loader,
    });
    expect(layer.order).toBe(LayerOrder.watermark);
    expect(loader.loads).toHaveLength(1);

    const camera = makeCamera(map, { center: { x: 512, y: 512 } });
    layer.update(camera);
    const material = (
      layer.object3D.children[0] as unknown as {
        material: { visible: boolean; opacity: number };
      }
    ).material;
    // Nothing is drawn before the image arrives (an untextured material would
    // flash a white sheet over the map).
    expect(material.visible).toBe(false);
    expect(material.opacity).toBeCloseTo(0.2, 9);

    loader.loads[0].resolve();
    expect(invalidate).toHaveBeenCalled();
    expect(material.visible).toBe(true);

    const expected = tileRangeCount(
      visibleTileRange(camera.visibleBounds(0), 256, 4, 4, 1),
    );
    const shown = layer.object3D.children.filter((m) => m.visible);
    expect(shown).toHaveLength(expected);
    // One texture and one material for the whole layer — no per-tile loads.
    expect(loader.loads).toHaveLength(1);
  });

  it("reuses its quad pool as the view shrinks", () => {
    const map = makeMap();
    const loader = stubLoader();
    const layer = new WatermarkLayer({ map, url: "w.webp", invalidate: vi.fn(), loader });
    const camera = makeCamera(map);
    layer.update(camera);
    const pooled = layer.object3D.children.length;
    expect(pooled).toBeGreaterThan(0);

    camera.setView(camera.center, 2);
    layer.update(camera);
    expect(layer.object3D.children.length).toBe(pooled);
    const shown = layer.object3D.children.filter((m) => m.visible).length;
    expect(shown).toBeLessThan(pooled);

    layer.dispose();
    expect(layer.object3D.children).toHaveLength(0);
    expect(loader.loads[0].texture.dispose).toHaveBeenCalled();
  });
});
