import { describe, expect, it, vi } from "vitest";
import type { InstancedBufferGeometry, Mesh, ShaderMaterial } from "three";
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
import { PIN_BASE_SIZE, PinAtlas, SELECTED_SCALE, type PinCanvas, type PinContext2D } from "./pinAtlas.ts";
import { LayerOrder, type RenderFrameContext } from "./renderer.ts";

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

function makeAtlas(over: { pageSize?: number } = {}): PinAtlas {
  return new PinAtlas({
    createCanvas: fakeCanvas,
    loadImage: () => Promise.resolve({ width: 40, height: 40 }),
    devicePixelRatio: 1,
    pageSize: over.pageSize ?? 1024,
  });
}

function makeLayer(
  markers: LayerMarker[],
  over: {
    camera?: Camera;
    atlas?: PinAtlas;
    map?: GameMapMeta;
    visibleSubtypes?: ReadonlySet<string> | undefined;
    forceShowIds?: ReadonlySet<string>;
    lodEnabled?: boolean;
  } = {},
): { layer: MarkerLayer; camera: Camera; atlas: PinAtlas; invalidate: MockInvalidate } {
  const camera = over.camera ?? makeCamera();
  const invalidate = vi.fn();
  const atlas = over.atlas ?? makeAtlas();
  const layer = new MarkerLayer({
    camera,
    map: over.map ?? makeMap(),
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
  return { layer, camera, atlas, invalidate };
}

type MockInvalidate = ReturnType<typeof vi.fn>;

/** One frame's worth of renderer context (see `renderer.ts`). */
function frame(pixelRatio: number): RenderFrameContext {
  return { pixelRatio };
}

/** The instanced batches the layer attached, in scene order. */
function batches(layer: MarkerLayer): Mesh<InstancedBufferGeometry, ShaderMaterial>[] {
  return layer.object3D.children as Mesh<InstancedBufferGeometry, ShaderMaterial>[];
}

function instanceCountOf(mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>): number {
  return mesh.geometry.instanceCount;
}

function centreOf(
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>,
  slot: number,
): { x: number; y: number } {
  const array = mesh.geometry.getAttribute("aCenter").array as Float32Array;
  return { x: array[slot * 2], y: array[slot * 2 + 1] };
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
    // Marker at the camera centre → screen (400, 300); Leaflet's 40px wrapper.
    const { layer } = makeLayer([marker({ id: "m1" })]);
    expect(layer.hitTest({ x: 400, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 419, y: 319 })).toBe("m1");
    expect(layer.hitTest({ x: 421, y: 300 })).toBeNull();
    expect(layer.hitTest({ x: 400, y: 321 })).toBeNull();
    layer.dispose();
  });

  it("uses the 40px wrapper box, not the overflowing icon", () => {
    // iconScale 2 paints an 80px icon, but the DOM `<img>` is pointer-transparent
    // — only the 40px wrapper is clickable, at any scale.
    const { layer } = makeLayer([
      marker({ id: "big", subtypeMeta: subtype({ iconScale: 2 }) }),
    ]);
    expect(layer.hitTest({ x: 419, y: 300 })).toBe("big");
    expect(layer.hitTest({ x: 421, y: 300 })).toBeNull();
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
    // ...and the sprite is still 40 CSS px wide (screen-constant size).
    expect(layer.hitTest({ x: 500, y: 300 })).toBeNull();
    expect(layer.hitTest({ x: 619, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 621, y: 300 })).toBeNull();
    layer.dispose();
  });

  it("enlarges the hit rect by the 1.2 selection scale", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    // 40px box → half 20: 22px out misses.
    expect(layer.hitTest({ x: 422, y: 300 })).toBeNull();
    layer.setSelected("m1");
    // 40 × 1.2 = 48px box → half 24: the same point now hits.
    expect(PIN_BASE_SIZE * SELECTED_SCALE).toBe(48);
    expect(layer.hitTest({ x: 422, y: 300 })).toBe("m1");
    expect(layer.hitTest({ x: 425, y: 300 })).toBeNull();
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

  it("breaks an exact tie by atlas page before marker index — as the GPU does", () => {
    // Batches draw in page order (`renderOrder = page`), so a LOWER-index marker
    // on a HIGHER page still draws on top. Set that up by filling page 0 to its
    // last slot before the layer resolves anything.
    const atlas = makeAtlas({ pageSize: 128 });
    const shared = subtype({ id: "shared", name: "shared", icon: undefined, pinVariant: "pin", color: "#aa0000" });
    const other = subtype({ id: "other", name: "other", icon: undefined, pinVariant: "pin", color: "#00bb00" });
    for (let i = 0; i < 8; i++) {
      atlas.get({
        variant: "pin",
        iconUrl: "",
        iconScale: 1.25,
        completed: false,
        dot: `#0000${i}${i}`,
        ring: "rgba(255,255,255,0.9)",
        selected: false,
        theme: {
          pinDiscBg: "rgba(0,0,0,0.6)",
          pinBorder: "rgba(255,255,255,1)",
          pinDot: "#2E97FF",
          circularBorder: "rgba(255,255,255,0.9)",
          completedAccent: "#22c55e",
        },
      });
    }
    const { layer } = makeLayer(
      [
        // idx 0 takes page 0's last slot with the `shared` appearance.
        marker({ id: "warm", subtype: "shared", subtypeMeta: shared, x: 6000, y: 6000 }),
        // idx 1 needs a new appearance → page 1.
        marker({ id: "onPage1", subtype: "other", subtypeMeta: other, x: 4010, y: 3000 }),
        // idx 2 reuses the `shared` appearance → back on page 0.
        marker({ id: "onPage0", subtype: "shared", subtypeMeta: shared, x: 4000, y: 3000 }),
      ],
      { atlas, visibleSubtypes: new Set(["shared", "other"]) },
    );
    expect(atlas.pageCount).toBe(2);
    // Equidistant from both centres → the one the GPU draws last must win.
    expect(layer.hitTest({ x: 405, y: 300 })).toBe("onPage1");
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

  it("reprojects every marker when the map changes", () => {
    // A world-coordinate map: DATA is NOT pixels, so a dropped reprojection shows.
    const world = makeMap({
      id: "WorldTree",
      worldBounds: { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } },
      orientation: { pxAxis: "X", flipX: false, flipY: false },
    });
    const { layer } = makeLayer([marker({ id: "m1", x: 500, y: 250 })]);
    // Legacy map: DATA passes through untouched.
    expect(layer.positionOf("m1")).toEqual({ x: 500, y: 250 });
    layer.setMap(world);
    // 8192px grid over a 1000-unit world → ×8.192.
    expect(layer.positionOf("m1")).toEqual({ x: 4096, y: 2048 });
    expect(layer.visibleMarkerIds()).toEqual(["m1"]);
    // ...and the instance buffer carries the reprojected centre.
    expect(centreOf(batches(layer)[0], 0)).toEqual({ x: 4096, y: 2048 });
    layer.dispose();
  });

  it("is dispose-idempotent", () => {
    const { layer } = makeLayer([marker({ id: "m1" })]);
    layer.dispose();
    layer.dispose();
    expect(layer.visibleMarkerCount).toBe(0);
  });
});

// ========================================================= instance buffers ===

describe("MarkerLayer instance buffers", () => {
  it("fills far past the initial capacity without corrupting instance data", () => {
    // 300 > INITIAL_BATCH_CAPACITY (256): the presize path must kick in.
    const markers = Array.from({ length: 300 }, (_, i) =>
      marker({ id: `m${i}`, x: 1000 + i, y: 2000 + i * 2 }),
    );
    const { layer } = makeLayer(markers);
    expect(layer.visibleMarkerCount).toBe(300);
    const mesh = batches(layer)[0];
    expect(instanceCountOf(mesh)).toBe(300);
    // Spot-check the first, a middle and the last instance.
    expect(centreOf(mesh, 0)).toEqual({ x: 1000, y: 2000 });
    expect(centreOf(mesh, 150)).toEqual({ x: 1150, y: 2300 });
    expect(centreOf(mesh, 299)).toEqual({ x: 1299, y: 2598 });
    const sizes = mesh.geometry.getAttribute("aSize").array as Float32Array;
    expect(sizes[299]).toBeGreaterThan(0);
    layer.dispose();
  });

  it("shrinks the drawn count when markers go away", () => {
    const markers = Array.from({ length: 10 }, (_, i) =>
      marker({ id: `m${i}`, x: 1000 + i * 10 }),
    );
    const { layer } = makeLayer(markers);
    expect(instanceCountOf(batches(layer)[0])).toBe(10);
    layer.setMarkers(markers.slice(0, 2));
    expect(layer.visibleMarkerCount).toBe(2);
    expect(instanceCountOf(batches(layer)[0])).toBe(2);
    // Filtering everything out hides the mesh rather than leaving stale quads.
    layer.setVisibility({ visibleSubtypes: new Set() });
    expect(instanceCountOf(batches(layer)[0])).toBe(0);
    expect(batches(layer)[0].visible).toBe(false);
    layer.dispose();
  });

  it("pushes the camera scale into every batch — the screen-constant mechanism", () => {
    const atlas = makeAtlas({ pageSize: 128 });
    // Two appearances that will not share a page (9 pins fit a 128px page).
    const markers = Array.from({ length: 12 }, (_, i) =>
      marker({
        id: `m${i}`,
        subtype: `s${i}`,
        x: 1000 + i * 50,
        subtypeMeta: subtype({
          id: `s${i}`,
          name: `s${i}`,
          icon: undefined,
          pinVariant: "pin",
          color: `#0000${i.toString(16).padStart(2, "0")}`,
        }),
      }),
    );
    const camera = makeCamera({ zoom: 0 });
    const { layer } = makeLayer(markers, {
      atlas,
      camera,
      visibleSubtypes: new Set(markers.map((m) => m.subtype)),
    });
    expect(atlas.pageCount).toBeGreaterThan(1);
    expect(batches(layer).length).toBe(atlas.pageCount);

    layer.update(camera, frame(1));
    for (const mesh of batches(layer)) {
      expect(mesh.material.uniforms.uScale.value).toBe(1);
    }
    camera.setView(camera.center, 2);
    layer.update(camera, frame(1));
    for (const mesh of batches(layer)) {
      expect(mesh.material.uniforms.uScale.value).toBe(4);
    }
    layer.dispose();
  });

  it("draws pages in page order so hitTest's tie rule matches the GPU", () => {
    const atlas = makeAtlas({ pageSize: 128 });
    const markers = Array.from({ length: 12 }, (_, i) =>
      marker({
        id: `m${i}`,
        subtype: `s${i}`,
        x: 1000 + i * 50,
        subtypeMeta: subtype({
          id: `s${i}`,
          name: `s${i}`,
          icon: undefined,
          pinVariant: "pin",
          color: `#0000${i.toString(16).padStart(2, "0")}`,
        }),
      }),
    );
    const { layer } = makeLayer(markers, {
      atlas,
      visibleSubtypes: new Set(markers.map((m) => m.subtype)),
    });
    const orders = batches(layer).map((mesh) => mesh.renderOrder);
    expect(orders).toEqual(orders.map((_, i) => i));
    layer.dispose();
  });
});

// ==================================================== device pixel ratio ===

describe("MarkerLayer device pixel ratio", () => {
  it("recomposes the atlas when the renderer's ratio changes", () => {
    const atlas = makeAtlas();
    const { layer, camera } = makeLayer([marker({ id: "m1" })], { atlas });
    expect(atlas.devicePixelRatio).toBe(1);
    const before = atlas.pageTexture(0);

    layer.update(camera, frame(2));
    expect(atlas.devicePixelRatio).toBe(2);
    // The old page textures were disposed, so the batches must have rebound.
    const mesh = batches(layer)[0];
    expect(mesh.material.uniforms.uMap.value).toBe(atlas.pageTexture(0));
    expect(mesh.material.uniforms.uMap.value).not.toBe(before);
    expect(instanceCountOf(mesh)).toBe(1);
    // Sprites stay the same CSS size, so hit-testing is unaffected.
    expect(layer.hitTest({ x: 400, y: 300 })).toBe("m1");
    layer.dispose();
  });

  it("does no work while the ratio holds steady", () => {
    const atlas = makeAtlas();
    const { layer, camera, invalidate } = makeLayer([marker({ id: "m1" })], { atlas });
    layer.update(camera, frame(1));
    invalidate.mockClear();
    layer.update(camera, frame(1));
    layer.update(camera, frame(1));
    expect(invalidate).not.toHaveBeenCalled();
    layer.dispose();
  });

  it("rebinds a SHARED atlas recomposed by another layer", () => {
    const atlas = makeAtlas();
    const first = makeLayer([marker({ id: "a" })], { atlas });
    const second = makeLayer([marker({ id: "b", x: 4100 })], { atlas });
    // The first layer to see the new ratio recomposes for everyone.
    first.layer.update(first.camera, frame(2));
    expect(atlas.generation).toBe(1);
    second.layer.update(second.camera, frame(2));
    expect(batches(second.layer)[0].material.uniforms.uMap.value).toBe(atlas.pageTexture(0));
    expect(instanceCountOf(batches(second.layer)[0])).toBe(1);
    first.layer.dispose();
    second.layer.dispose();
  });

  it("composes an owned atlas at the ratio it was handed at construction", () => {
    const invalidate = vi.fn();
    const layer = new MarkerLayer({
      camera: makeCamera(),
      map: makeMap(),
      assets,
      invalidate,
      devicePixelRatio: 2,
      visibility: { visibleSubtypes: new Set(["chest"]) },
      // No atlas: the layer builds one. The browser canvas factory is never
      // reached because nothing is composed until `setMarkers`.
    });
    expect(layer.isDisposed).toBe(false);
    layer.dispose();
  });
});

// ================================================== resilience ===

describe("MarkerLayer resilience", () => {
  it("retries markers the atlas refused instead of caching the failure", () => {
    // `PinAtlas.get` also returns null once disposed, so caching null would leave
    // a layer sharing someone else's atlas permanently blank.
    const atlas = makeAtlas();
    const refuse = vi.spyOn(atlas, "get").mockReturnValue(null);
    const { layer } = makeLayer([marker({ id: "m1" })], { atlas });
    expect(layer.hitTest({ x: 400, y: 300 })).toBeNull();
    expect(batches(layer)).toHaveLength(0);

    refuse.mockRestore();
    layer.setVisibility({ visibleSubtypes: new Set(["chest"]) });
    expect(layer.hitTest({ x: 400, y: 300 })).toBe("m1");
    layer.dispose();
  });
});
