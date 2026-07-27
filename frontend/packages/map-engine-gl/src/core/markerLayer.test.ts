import { describe, expect, it, vi } from "vitest";
import type { GameMapMeta, MarkerTypeSubtype } from "@gamemap/data-contract";
import type { MapAssets } from "./assets.ts";
import { Camera } from "./camera.ts";
import {
  FAN_RADIUS_PX,
  MarkerLayer,
  TIER2_MIN_ZOOM,
  TIER3_MIN_ZOOM,
  fanOutPositions,
  isMarkerVisible,
  visibleTierForZoom,
  type LayerMarker,
} from "./markerLayer.ts";
import { PinAtlas, SELECTED_SCALE, type PinCanvas, type PinContext2D } from "./pinAtlas.ts";
import { LayerOrder } from "./renderer.ts";

// ------------------------------------------------------------------ fixtures ---

/** A no-op 2D surface: these tests exercise placement/visibility, not pixels. */
function fakeCanvas(width: number, height: number): PinCanvas {
  const ctx: PinContext2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    clearRect: () => {},
    drawImage: () => {},
    fillText: () => {},
  };
  return { width, height, getContext: () => ctx };
}

/** Legacy pixel map (no worldBounds) → DATA space IS pixel space. */
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

const assets: MapAssets = {
  tileUrl: (map, x, y) => `/tiles/${map.id}_${x}_${y}.webp`,
  markerIconUrl: (icon) => (icon ? `/icons/${icon}.webp` : ""),
};

function subtype(over: Partial<MarkerTypeSubtype> = {}): MarkerTypeSubtype {
  return { id: "chest", name: "chest", icon: "chest", ...over };
}

function marker(over: Partial<LayerMarker> = {}): LayerMarker {
  return {
    id: "m1",
    subtype: "chest",
    x: 4000,
    y: 3000,
    images: [],
    contributors: [],
    indexInSubtype: 0,
    subtypeMeta: subtype(),
    ...over,
  };
}

function makeCamera(over: { zoom?: number; center?: { x: number; y: number } } = {}): Camera {
  return new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: 800,
    viewportHeight: 600,
    center: over.center ?? { x: 4000, y: 3000 },
    zoom: over.zoom ?? 0,
  });
}

function makeLayer(
  markers: LayerMarker[],
  over: {
    camera?: Camera;
    visibleSubtypes?: ReadonlySet<string> | undefined;
    forceShowIds?: ReadonlySet<string>;
    lodEnabled?: boolean;
  } = {},
): { layer: MarkerLayer; camera: Camera; invalidate: () => void } {
  const camera = over.camera ?? makeCamera();
  const invalidate = vi.fn();
  const atlas = new PinAtlas({
    createCanvas: fakeCanvas,
    loadImage: () => Promise.resolve({ width: 40, height: 40 }),
    devicePixelRatio: 1,
    pageSize: 1024,
  });
  const layer = new MarkerLayer({
    camera,
    map: makeMap(),
    assets,
    invalidate,
    atlas,
    visibility: {
      visibleSubtypes:
        "visibleSubtypes" in over ? over.visibleSubtypes : new Set(["chest", "pal", "boss"]),
      forceShowIds: over.forceShowIds,
      lodEnabled: over.lodEnabled,
    },
  });
  layer.setMarkers(markers);
  return { layer, camera, invalidate };
}

// ================================================================= LOD tiers ===

describe("visibleTierForZoom", () => {
  it("unlocks tier 2 at exactly the threshold, not a hair below", () => {
    expect(TIER2_MIN_ZOOM).toBe(-1.25);
    expect(visibleTierForZoom(-1.2501)).toBe(1);
    expect(visibleTierForZoom(TIER2_MIN_ZOOM)).toBe(2);
    expect(visibleTierForZoom(-1.24)).toBe(2);
  });

  it("unlocks tier 3 at exactly zoom 0", () => {
    expect(TIER3_MIN_ZOOM).toBe(0);
    expect(visibleTierForZoom(-0.0001)).toBe(2);
    expect(visibleTierForZoom(TIER3_MIN_ZOOM)).toBe(3);
    expect(visibleTierForZoom(2)).toBe(3);
  });

  it("floors at tier 1", () => {
    expect(visibleTierForZoom(-3)).toBe(1);
    expect(visibleTierForZoom(-100)).toBe(1);
  });
});

// =============================================================== visibility ===

describe("isMarkerVisible", () => {
  const base = { id: "m1", subtype: "chest", tier: 1 };
  const ctx = {
    selectedId: null as string | null,
    visibleSubtypes: new Set(["chest"]) as ReadonlySet<string>,
    lodEnabled: false,
    visibleTier: 1,
  };

  it("hides EVERYTHING when the subtype filter is undefined", () => {
    expect(
      isMarkerVisible(base, { ...ctx, visibleSubtypes: undefined }),
    ).toBe(false);
    // ...including with LOD off and a tier that would otherwise pass.
    expect(
      isMarkerVisible({ ...base, tier: undefined }, { ...ctx, visibleSubtypes: undefined }),
    ).toBe(false);
  });

  it("applies the subtype filter", () => {
    expect(isMarkerVisible(base, ctx)).toBe(true);
    expect(isMarkerVisible({ ...base, subtype: "pal" }, ctx)).toBe(false);
    expect(isMarkerVisible(base, { ...ctx, visibleSubtypes: new Set() })).toBe(false);
  });

  it("lets the selected marker bypass the filter and LOD", () => {
    const hidden = { id: "m1", subtype: "pal", tier: 3 };
    expect(isMarkerVisible(hidden, { ...ctx, lodEnabled: true })).toBe(false);
    expect(
      isMarkerVisible(hidden, { ...ctx, lodEnabled: true, selectedId: "m1" }),
    ).toBe(true);
    expect(
      isMarkerVisible(hidden, {
        ...ctx,
        lodEnabled: true,
        visibleSubtypes: undefined,
        selectedId: "m1",
      }),
    ).toBe(true);
  });

  it("lets forceShowIds bypass the filter and LOD", () => {
    const hidden = { id: "m1", subtype: "pal", tier: 3 };
    expect(
      isMarkerVisible(hidden, {
        ...ctx,
        lodEnabled: true,
        forceShowIds: new Set(["m1"]),
      }),
    ).toBe(true);
    expect(
      isMarkerVisible(hidden, {
        ...ctx,
        lodEnabled: true,
        forceShowIds: new Set(["other"]),
      }),
    ).toBe(false);
  });

  it("gates tiers only when LOD is enabled", () => {
    const tier3 = { id: "m1", subtype: "chest", tier: 3 };
    expect(isMarkerVisible(tier3, { ...ctx, lodEnabled: false })).toBe(true);
    expect(isMarkerVisible(tier3, { ...ctx, lodEnabled: true, visibleTier: 1 })).toBe(false);
    expect(isMarkerVisible(tier3, { ...ctx, lodEnabled: true, visibleTier: 2 })).toBe(false);
    expect(isMarkerVisible(tier3, { ...ctx, lodEnabled: true, visibleTier: 3 })).toBe(true);
  });

  it("hides tier-less markers when LOD is enabled, shows them when it is not", () => {
    const untiered = { id: "m1", subtype: "chest", tier: undefined };
    expect(isMarkerVisible(untiered, { ...ctx, lodEnabled: false })).toBe(true);
    expect(
      isMarkerVisible(untiered, { ...ctx, lodEnabled: true, visibleTier: 3 }),
    ).toBe(false);
  });
});

describe("MarkerLayer visibility", () => {
  const markers = [
    marker({ id: "chest1", subtype: "chest", tier: 1 }),
    marker({ id: "pal1", subtype: "pal", tier: 2, x: 4100 }),
    marker({ id: "boss1", subtype: "boss", tier: 3, x: 4200 }),
    marker({ id: "untiered", subtype: "chest", tier: undefined, x: 4300 }),
  ];

  it("draws nothing until the app initialises its subtype filter", () => {
    const { layer } = makeLayer(markers, { visibleSubtypes: undefined });
    expect(layer.visibleMarkerIds()).toEqual([]);
    layer.dispose();
  });

  it("draws exactly the enabled subtypes", () => {
    const { layer } = makeLayer(markers);
    expect(layer.visibleMarkerIds()).toEqual(["chest1", "pal1", "boss1", "untiered"]);
    layer.setVisibility({ visibleSubtypes: new Set(["pal"]) });
    expect(layer.visibleMarkerIds()).toEqual(["pal1"]);
    layer.dispose();
  });

  it("keeps the selected marker and forced ids visible through every filter", () => {
    const { layer } = makeLayer(markers, { visibleSubtypes: new Set() });
    layer.setSelected("boss1");
    expect(layer.visibleMarkerIds()).toEqual(["boss1"]);
    layer.setVisibility({ visibleSubtypes: undefined, forceShowIds: new Set(["pal1"]) });
    // Selection survives a visibility update; the forced id joins it.
    expect(layer.visibleMarkerIds().sort()).toEqual(["boss1", "pal1"]);
    layer.dispose();
  });

  it("gates LOD tiers at the zoom thresholds and rebuilds on crossing", () => {
    const camera = makeCamera({ zoom: -3 });
    const { layer } = makeLayer(markers, { camera, lodEnabled: true });
    // zoom -3 → tier 1 only; the tier-less marker is hidden with LOD on.
    expect(layer.visibleMarkerIds()).toEqual(["chest1"]);

    camera.setView(camera.center, TIER2_MIN_ZOOM);
    layer.update(camera);
    expect(layer.visibleMarkerIds()).toEqual(["chest1", "pal1"]);

    camera.setView(camera.center, TIER3_MIN_ZOOM);
    layer.update(camera);
    expect(layer.visibleMarkerIds()).toEqual(["chest1", "pal1", "boss1"]);

    // Just below the tier-3 threshold drops the tier-3 marker again.
    camera.setView(camera.center, -0.0001);
    layer.update(camera);
    expect(layer.visibleMarkerIds()).toEqual(["chest1", "pal1"]);
    layer.dispose();
  });

  it("never culls by viewport — panning and zooming leave the set alone", () => {
    const { layer, camera } = makeLayer(markers);
    const before = layer.visibleMarkerIds();
    camera.setView({ x: 0, y: 0 }, 2);
    layer.update(camera);
    expect(layer.visibleMarkerIds()).toEqual(before);
    layer.dispose();
  });

  it("uses the markers layer draw order", () => {
    const { layer } = makeLayer(markers);
    expect(layer.order).toBe(LayerOrder.markers);
    layer.dispose();
  });
});

// ================================================================== fan-out ===

describe("fanOutPositions", () => {
  const identity = (x: number, y: number) => ({ x, y });

  it("leaves a lone marker exactly where it is", () => {
    expect(fanOutPositions([{ x: 100, y: 200 }], identity)).toEqual([{ x: 100, y: 200 }]);
  });

  it("spreads a shared coordinate onto a circle of radius 18", () => {
    const shared = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ];
    const out = fanOutPositions(shared, identity);
    expect(out).toHaveLength(4);
    const keys = new Set(out.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
    expect(keys.size).toBe(4);
    for (const p of out) {
      const distance = Math.hypot(p.x - 100, p.y - 100);
      expect(distance).toBeCloseTo(FAN_RADIUS_PX, 9);
    }
    // Leaflet's angle 0 lands due EAST; the y sign is flipped because this
    // engine's pixel space points y DOWN.
    expect(out[0].x).toBeCloseTo(118, 9);
    expect(out[0].y).toBeCloseTo(100, 9);
    expect(out[1].x).toBeCloseTo(100, 9);
    expect(out[1].y).toBeCloseTo(100 - FAN_RADIUS_PX, 9);
  });

  it("fans each shared coordinate independently and keeps distinct ones untouched", () => {
    const out = fanOutPositions(
      [
        { x: 10, y: 10 },
        { x: 50, y: 50 },
        { x: 10, y: 10 },
        { x: 70, y: 70 },
      ],
      identity,
    );
    expect(out[1]).toEqual({ x: 50, y: 50 });
    expect(out[3]).toEqual({ x: 70, y: 70 });
    expect(Math.hypot(out[0].x - 10, out[0].y - 10)).toBeCloseTo(FAN_RADIUS_PX, 9);
    expect(Math.hypot(out[2].x - 10, out[2].y - 10)).toBeCloseTo(FAN_RADIUS_PX, 9);
    expect(out[0]).not.toEqual(out[2]);
  });

  it("projects through the supplied transform before fanning", () => {
    const out = fanOutPositions(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      (x, y) => ({ x: x * 100, y: y * 100 }),
    );
    expect(Math.hypot(out[0].x - 100, out[0].y - 100)).toBeCloseTo(FAN_RADIUS_PX, 9);
  });

  it("is what the layer reports as a marker's rendered position", () => {
    const { layer } = makeLayer([
      marker({ id: "a", x: 4000, y: 3000 }),
      marker({ id: "b", x: 4000, y: 3000 }),
      marker({ id: "c", x: 1000, y: 1000 }),
    ]);
    expect(layer.positionOf("c")).toEqual({ x: 1000, y: 1000 });
    const a = layer.positionOf("a");
    expect(a).not.toBeNull();
    expect(Math.hypot((a as { x: number }).x - 4000, (a as { y: number }).y - 3000)).toBeCloseTo(
      FAN_RADIUS_PX,
      9,
    );
    expect(layer.positionOf("missing")).toBeNull();
    layer.dispose();
  });
});

// ================================================================== hitTest ===

describe("MarkerLayer.hitTest", () => {
  it("hits inside the sprite's screen rect and misses outside it", () => {
    // Marker at the camera centre → screen (400, 300); 40 × 1.25 = 50px box.
    const { layer } = makeLayer([marker({ id: "m1" })]);
    expect(layer.hitTest({ x: 400, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 424, y: 324 })).toBe("m1");
    expect(layer.hitTest({ x: 426, y: 300 })).toBeNull();
    expect(layer.hitTest({ x: 400, y: 326 })).toBeNull();
    layer.dispose();
  });

  it("is correct at two different zooms", () => {
    const camera = makeCamera({ zoom: 0 });
    const { layer } = makeLayer([marker({ id: "m1", x: 4100, y: 3000 })], { camera });
    // zoom 0: 1 map px = 1 CSS px → 100 px right of centre.
    expect(layer.hitTest({ x: 500, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 600, y: 300 })).toBeNull();

    camera.setView({ x: 4000, y: 3000 }, 1);
    // zoom 1: the same marker is now 200 CSS px right of centre...
    expect(layer.hitTest({ x: 600, y: 300 })).toBe("m1");
    // ...and the sprite is still 50 CSS px wide (screen-constant size).
    expect(layer.hitTest({ x: 500, y: 300 })).toBeNull();
    expect(layer.hitTest({ x: 624, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 626, y: 300 })).toBeNull();
    layer.dispose();
  });

  it("enlarges the hit rect by the 1.2 selection scale", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    // 50px box → half 25: 28px out misses.
    expect(layer.hitTest({ x: 428, y: 300 })).toBeNull();
    layer.setSelected("m1");
    // 50 × 1.2 = 60px box → half 30: the same point now hits.
    expect(50 * SELECTED_SCALE).toBe(60);
    expect(layer.hitTest({ x: 428, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 431, y: 300 })).toBeNull();
    layer.dispose();
  });

  it("prefers the marker whose centre is nearest, then the later one on a tie", () => {
    const { layer } = makeLayer([
      marker({ id: "left", x: 4000, y: 3000 }),
      marker({ id: "right", x: 4010, y: 3000 }),
    ]);
    expect(layer.hitTest({ x: 402, y: 300 })).toBe("left");
    expect(layer.hitTest({ x: 408, y: 300 })).toBe("right");
    // Exactly between the two → the later marker, which draws on top.
    expect(layer.hitTest({ x: 405, y: 300 })).toBe("right");
    layer.dispose();
  });

  it("prefers the selected marker even when another centre is nearer", () => {
    const { layer } = makeLayer([
      marker({ id: "left", x: 4000, y: 3000 }),
      marker({ id: "right", x: 4010, y: 3000 }),
    ]);
    layer.setSelected("right");
    expect(layer.hitTest({ x: 402, y: 300 })).toBe("right");
    layer.dispose();
  });

  it("ignores markers that are not drawn", () => {
    const { layer } = makeLayer([marker({ id: "m1" })], {
      visibleSubtypes: new Set(["something-else"]),
    });
    expect(layer.hitTest({ x: 400, y: 300 })).toBeNull();
    layer.dispose();
  });

  it("returns null once disposed", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    layer.dispose();
    expect(layer.hitTest({ x: 400, y: 300 })).toBeNull();
    expect(layer.isDisposed).toBe(true);
  });
});

// ============================================================ layer plumbing ===

describe("MarkerLayer plumbing", () => {
  it("asks for a repaint whenever the drawn set can have changed", () => {
    const camera = makeCamera();
    const invalidate = vi.fn();
    const atlas = new PinAtlas({
      createCanvas: fakeCanvas,
      loadImage: () => Promise.resolve({ width: 40, height: 40 }),
      devicePixelRatio: 1,
      pageSize: 1024,
    });
    const layer = new MarkerLayer({
      camera,
      map: makeMap(),
      assets,
      invalidate,
      atlas,
      visibility: { visibleSubtypes: new Set(["chest"]) },
    });
    layer.setMarkers([marker({ id: "m1" })]);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();
    layer.setSelected("m1");
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();
    layer.setVisibility({ visibleSubtypes: new Set() });
    expect(invalidate).toHaveBeenCalled();
    layer.dispose();
  });

  it("ignores a selection that is already active", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    layer.setSelected("m1");
    expect(layer.selected).toBe("m1");
    layer.setSelected(null);
    expect(layer.selected).toBeNull();
    layer.dispose();
  });

  it("attaches one draw batch per atlas page in use", () => {
    const { layer } = makeLayer([
      marker({ id: "a", subtype: "chest" }),
      marker({ id: "b", subtype: "chest", x: 4100 }),
    ]);
    // Both markers share one appearance → one page, one batch.
    expect(layer.object3D.children).toHaveLength(1);
    layer.setSelected("a");
    // The selected marker gets its own batch so it can draw on top.
    expect(layer.object3D.children).toHaveLength(2);
    layer.dispose();
    expect(layer.object3D.children).toHaveLength(0);
  });

  it("keeps working after the map changes", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    layer.setMap(makeMap({ id: "WorldTree" }));
    expect(layer.visibleMarkerIds()).toEqual(["m1"]);
    expect(layer.positionOf("m1")).toEqual({ x: 4000, y: 3000 });
    layer.dispose();
  });

  it("is dispose-idempotent", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    layer.dispose();
    layer.dispose();
    expect(layer.visibleMarkerCount).toBe(0);
  });
});
