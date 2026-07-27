import { describe, expect, it, vi } from "vitest";
import type { GameMapMeta, RegionInstance } from "@gamemap/data-contract";
import { Camera } from "./camera.ts";
import { dataToPoint } from "./coords.ts";
import { LayerOrder } from "./renderer.ts";
import {
  BORDER_DASH,
  BORDER_GAP,
  DEFAULT_VECTOR_COLORS,
  VectorLayer,
  dedupeRegionEdges,
  edgeKey,
  pointInRing,
  ringArea,
  segmentPositions,
  setSegmentDistances,
  triangulateRings,
  type VectorLayerOptions,
} from "./vectorLayer.ts";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Color } from "three";

// A legacy pixel map (DATA space == pixel space): keeps region fixtures readable.
const pixelMap: GameMapMeta = {
  id: "PixelMap",
  name: "Pixel Map",
  type: "world",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 32,
  tilesCountY: 32,
  isVisible: true,
};

// Palworld MainWorld: 8192² grid, world→pixel via pxAxis=Y + flipY — the same
// fixture the coords tests use, so overlay-line projection is checked against a
// real orientation rather than the identity.
const worldMap: GameMapMeta = {
  id: "MainWorld",
  name: "MainWorld",
  type: "world",
  tileWidth: 1024,
  tileHeight: 1024,
  tilesCountX: 8,
  tilesCountY: 8,
  isVisible: true,
  worldBounds: { min: { x: -1099400, y: -724400 }, max: { x: 349400, y: 724400 } },
  orientation: { pxAxis: "Y", flipX: false, flipY: true },
};

/** A closed axis-aligned square ring (first point repeated, as the data has it). */
function square(x: number, y: number, size: number): number[][] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

function region(
  id: string,
  borders: number[][][],
  over: Partial<RegionInstance> = {},
): RegionInstance {
  return { id, name: id, type: "region", borders, ...over };
}

function makeLayer(over: Partial<VectorLayerOptions> = {}) {
  const invalidate = vi.fn();
  const layer = new VectorLayer({ map: pixelMap, invalidate, ...over });
  return { layer, invalidate };
}

function makeCamera(zoom: number, viewport: [number, number] = [1200, 800]) {
  return new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: viewport[0],
    viewportHeight: viewport[1],
    center: { x: 4096, y: 4096 },
    zoom,
  });
}

/** Segment count of a fat-line object (6 position floats per segment). */
function segmentCount(object: { geometry: LineSegmentsGeometry } | null): number {
  if (!object) return 0;
  const start = object.geometry.attributes.instanceStart;
  return start ? start.count : 0;
}

// ------------------------------------------------------------- edge dedup ---

describe("edgeKey", () => {
  it("is order-independent (A→B and B→A collapse)", () => {
    expect(edgeKey([10, 20], [30, 40])).toBe(edgeKey([30, 40], [10, 20]));
  });

  it("distinguishes different edges", () => {
    expect(edgeKey([10, 20], [30, 40])).not.toBe(edgeKey([10, 20], [30, 41]));
  });

  it("uses the Leaflet engine's `${point}` string form", () => {
    // Ported verbatim from GameMapBorders: `${[10,20]}` === "10,20".
    expect(edgeKey([10, 20], [30, 40])).toBe("10,20|30,40");
  });
});

describe("dedupeRegionEdges", () => {
  // Two unit squares sharing the x = 10 edge:  [0..10] and [10..20].
  const left = region("left", [square(0, 0, 10)]);
  const right = region("right", [square(10, 0, 10)]);

  it("draws a shared edge once and records both owners", () => {
    const edges = dedupeRegionEdges([left, right]);
    // 4 edges each, minus the one they share.
    expect(edges).toHaveLength(7);
    const shared = edges.filter((e) => e.regions.length === 2);
    expect(shared).toHaveLength(1);
    expect(shared[0].regions.sort()).toEqual(["left", "right"]);
    expect(shared[0].key).toBe(edgeKey([10, 0], [10, 10]));
  });

  it("keeps every non-shared edge", () => {
    const edges = dedupeRegionEdges([left, right]);
    const single = edges.filter((e) => e.regions.length === 1);
    expect(single).toHaveLength(6);
    // Every outer edge of both squares survives exactly once.
    const keys = new Set(single.map((e) => e.key));
    expect(keys.size).toBe(6);
    expect(keys.has(edgeKey([0, 0], [10, 0]))).toBe(true);
    expect(keys.has(edgeKey([10, 0], [20, 0]))).toBe(true);
  });

  it("collapses a shared edge traversed in the opposite direction", () => {
    // Same shared edge, but the right square is wound the other way around, so
    // the pair arrives as (10,10)→(10,0) instead of (10,0)→(10,10).
    const reversed = region("right", [
      [
        [10, 0],
        [10, 10],
        [20, 10],
        [20, 0],
        [10, 0],
      ],
    ]);
    const edges = dedupeRegionEdges([left, reversed]);
    expect(edges).toHaveLength(7);
    expect(edges.filter((e) => e.regions.length === 2)).toHaveLength(1);
  });

  it("walks rings without wraparound, like Leaflet (closing edge comes from the closed ring)", () => {
    // An UNCLOSED ring: Leaflet's `i < poly.length - 1` loop emits 3 edges for 4
    // points and never synthesises the closing one.
    const open = region("open", [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ]);
    expect(dedupeRegionEdges([open])).toHaveLength(3);
    // The closed form of the same square yields all four.
    expect(dedupeRegionEdges([region("closed", [square(0, 0, 10)])])).toHaveLength(4);
  });

  it("drops zero-length edges (they would NaN out the fat-line shader)", () => {
    const edges = dedupeRegionEdges([
      region("dup", [
        [
          [0, 0],
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ]),
    ]);
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => e.a[0] !== e.b[0] || e.a[1] !== e.b[1])).toBe(true);
  });

  it("includes regions hidden by visibleRegions (Leaflet filters only the base fills)", () => {
    const { layer } = makeLayer();
    layer.setRegions([left, right]);
    layer.setVisibleRegions(new Set<string>());
    expect(layer.borderEdges).toHaveLength(7);
    layer.dispose();
  });
});

// ------------------------------------------------------------ point in ring ---

describe("pointInRing", () => {
  it("accepts an interior point and rejects an exterior one", () => {
    const ring = square(0, 0, 10);
    expect(pointInRing(5, 5, ring)).toBe(true);
    expect(pointInRing(15, 5, ring)).toBe(false);
    expect(pointInRing(5, -1, ring)).toBe(false);
  });

  it("treats a concave notch as OUTSIDE", () => {
    // A C-shape: a 30×30 square with a 20×10 bite taken out of its right side
    // between y = 10 and y = 20. (25, 15) sits in the notch.
    const c: number[][] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 20],
      [30, 20],
      [30, 30],
      [0, 30],
      [0, 0],
    ];
    expect(pointInRing(25, 15, c)).toBe(false);
    expect(pointInRing(5, 15, c)).toBe(true);
    expect(pointInRing(25, 5, c)).toBe(true);
    expect(pointInRing(25, 25, c)).toBe(true);
  });

  it("is deterministic on the boundary (top/left edges in, bottom/right out)", () => {
    const ring = square(0, 0, 10);
    // The app's half-open rule, pinned so GL hover can never drift away from
    // `subzoneAt`: the min-x and min-y edges belong to the polygon, the max-x
    // and max-y edges belong to the neighbour.
    expect(pointInRing(0, 5, ring)).toBe(true); // left edge
    expect(pointInRing(5, 0, ring)).toBe(true); // top edge
    expect(pointInRing(0, 0, ring)).toBe(true); // top-left vertex
    expect(pointInRing(10, 5, ring)).toBe(false); // right edge
    expect(pointInRing(5, 10, ring)).toBe(false); // bottom edge
    expect(pointInRing(10, 10, ring)).toBe(false); // bottom-right vertex
    expect(pointInRing(10, 0, ring)).toBe(false); // top-right vertex
    expect(pointInRing(0, 10, ring)).toBe(false); // bottom-left vertex
  });
});

describe("ringArea", () => {
  it("is the shoelace magnitude, winding-independent", () => {
    expect(ringArea(square(0, 0, 10))).toBe(100);
    expect(ringArea([...square(0, 0, 10)].reverse())).toBe(100);
  });
});

// ------------------------------------------------------------------ regionAt ---

describe("VectorLayer.regionAt", () => {
  it("finds the region containing a point and returns null outside every region", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 100)])]);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("a");
    expect(layer.regionAt({ x: 150, y: 50 })).toBeNull();
    layer.dispose();
  });

  it("returns null for a point in a concave notch", () => {
    const { layer } = makeLayer();
    layer.setRegions([
      region("c", [
        [
          [0, 0],
          [30, 0],
          [30, 10],
          [10, 10],
          [10, 20],
          [30, 20],
          [30, 30],
          [0, 30],
          [0, 0],
        ],
      ]),
    ]);
    expect(layer.regionAt({ x: 25, y: 15 })).toBeNull();
    expect(layer.regionAt({ x: 5, y: 15 })).toBe("c");
    layer.dispose();
  });

  it("resolves overlaps to the SMALLEST-AREA region", () => {
    const { layer } = makeLayer();
    const big = region("big", [square(0, 0, 100)]);
    const small = region("small", [square(40, 40, 10)]);
    // Ingestion order must not matter: the records are pre-sorted by area.
    layer.setRegions([big, small]);
    expect(layer.regionAt({ x: 45, y: 45 })).toBe("small");
    layer.setRegions([small, big]);
    expect(layer.regionAt({ x: 45, y: 45 })).toBe("small");
    // Outside the small one, the big one still answers.
    expect(layer.regionAt({ x: 90, y: 90 })).toBe("big");
    layer.dispose();
  });

  it("bbox rejection produces no false negatives (points near the bbox edges hit)", () => {
    const { layer } = makeLayer();
    // An L: bbox is 0..100 × 0..100 but only the left column and bottom row are
    // filled. Points hug the bbox corners of the filled arms.
    layer.setRegions([
      region("L", [
        [
          [0, 0],
          [30, 0],
          [30, 70],
          [100, 70],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ]),
    ]);
    expect(layer.regionAt({ x: 1, y: 1 })).toBe("L");
    expect(layer.regionAt({ x: 99, y: 99 })).toBe("L");
    expect(layer.regionAt({ x: 29, y: 69 })).toBe("L");
    // Inside the bbox but outside the polygon.
    expect(layer.regionAt({ x: 99, y: 1 })).toBeNull();
    layer.dispose();
  });

  it("treats each ring as its own polygon — no holes, matching Leaflet", () => {
    const { layer } = makeLayer();
    // A ring nested inside another. Leaflet renders both as separate <Polygon>s,
    // so the inner one is FILLED, not punched out.
    layer.setRegions([region("multi", [square(0, 0, 100), square(200, 0, 50)])]);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("multi");
    expect(layer.regionAt({ x: 220, y: 20 })).toBe("multi");
    expect(layer.regionAt({ x: 150, y: 50 })).toBeNull();

    layer.setRegions([region("nested", [square(0, 0, 100), square(40, 40, 20)])]);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("nested");
    layer.dispose();
  });

  it("honours visibleRegions (undefined = all, empty = none, keyed on NAME)", () => {
    const { layer } = makeLayer();
    const a = region("a-id", [square(0, 0, 100)], { name: "Alpha" });
    layer.setRegions([a]);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("a-id");

    layer.setVisibleRegions(new Set<string>());
    expect(layer.regionAt({ x: 50, y: 50 })).toBeNull();

    // Leaflet filters on region.name — and ONLY on it, so an id must not match.
    layer.setVisibleRegions(new Set(["a-id"]));
    expect(layer.regionAt({ x: 50, y: 50 })).toBeNull();

    layer.setVisibleRegions(new Set(["Alpha"]));
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("a-id");

    layer.setVisibleRegions(undefined);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("a-id");
    layer.dispose();
  });

  it("re-reads a Set mutated in place (no identity short-circuit)", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 100)])]);
    const visible = new Set<string>();
    layer.setVisibleRegions(visible);
    expect(layer.regionAt({ x: 50, y: 50 })).toBeNull();
    visible.add("a");
    layer.setVisibleRegions(visible);
    expect(layer.regionAt({ x: 50, y: 50 })).toBe("a");
    layer.dispose();
  });

  it("applies the opt-in regionFilter on top of visibleRegions", () => {
    // palworld's `subzoneAt` looks at surface regions only; the engine gets all
    // of them. This option is how Task 6/7 can align the two.
    const { layer } = makeLayer({ regionFilter: (r) => r.type === "region" });
    layer.setRegions([
      region("cave", [square(40, 40, 10)], { type: "cave" }),
      region("surface", [square(0, 0, 100)]),
    ]);
    // Without the filter the smaller cave would win this point.
    expect(layer.regionAt({ x: 45, y: 45 })).toBe("surface");
    layer.setHovered("cave");
    expect(layer.hoverFillObject).toBeNull();
    layer.dispose();
  });
});

// ------------------------------------------------------------- triangulation ---

describe("triangulateRings", () => {
  it("triangulates a square into 2 triangles / 6 indices", () => {
    const { positions, index } = triangulateRings([square(0, 0, 10)]);
    // The duplicated closing point is dropped: 4 corners × 3 floats.
    expect(positions).toHaveLength(12);
    expect(index).toHaveLength(6);
    expect(index.length / 3).toBe(2);
    // z is always 0 (the scene is flat).
    expect([...positions].filter((_, i) => i % 3 === 2).every((z) => z === 0)).toBe(true);
  });

  it("triangulates a concave shape without degenerate triangles", () => {
    const c: number[][] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 20],
      [30, 20],
      [30, 30],
      [0, 30],
      [0, 0],
    ];
    const { positions, index } = triangulateRings([c]);
    expect(positions).toHaveLength(24); // 8 distinct points
    expect(index.length % 3).toBe(0);
    expect(index.length).toBeGreaterThanOrEqual(18); // 8-gon → ≥ 6 triangles
    let total = 0;
    for (let i = 0; i < index.length; i += 3) {
      const [p, q, r] = [index[i], index[i + 1], index[i + 2]];
      const area =
        Math.abs(
          (positions[q * 3] - positions[p * 3]) *
            (positions[r * 3 + 1] - positions[p * 3 + 1]) -
            (positions[r * 3] - positions[p * 3]) *
              (positions[q * 3 + 1] - positions[p * 3 + 1]),
        ) / 2;
      expect(area).toBeGreaterThan(0);
      total += area;
    }
    // 30×30 square minus the 20×10 notch.
    expect(total).toBeCloseTo(900 - 200, 6);
  });

  it("offsets indices per ring so rings do not share vertices", () => {
    const { positions, index } = triangulateRings([square(0, 0, 10), square(100, 0, 10)]);
    expect(positions).toHaveLength(24);
    expect(index).toHaveLength(12);
    expect(Math.max(...index)).toBe(7);
  });

  it("skips rings with fewer than three distinct points", () => {
    const { positions, index } = triangulateRings([
      [
        [0, 0],
        [10, 0],
        [0, 0],
      ],
    ]);
    expect(positions).toHaveLength(0);
    expect(index).toHaveLength(0);
  });
});

// ----------------------------------------------------------- fat-line arrays ---

describe("segmentPositions / setSegmentDistances", () => {
  it("emits 6 floats per segment with z = 0", () => {
    const flat = segmentPositions([{ a: [1, 2], b: [3, 4] }]);
    expect([...flat]).toEqual([1, 2, 0, 3, 4, 0]);
  });

  it("leaves a segment shorter than the dash entirely solid", () => {
    // The motivating case for the per-segment reset: a 3 px edge with dash 8 / gap
    // 5. Distance 0..3 sits wholly inside the first dash → the edge is drawn. Had
    // the distances accumulated (three's computeLineDistances), the same edge
    // could start at, say, 9 and be discarded as gap.
    const segments = [{ a: [0, 0], b: [3, 0] }];
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segmentPositions(segments));
    setSegmentDistances(geometry, segments);
    expect(geometry.attributes.instanceDistanceStart.getX(0)).toBe(0);
    expect(geometry.attributes.instanceDistanceEnd.getX(0)).toBeCloseTo(3, 6);
    expect(3).toBeLessThan(BORDER_DASH);
    geometry.dispose();
  });

  it("restarts the dash cycle on every segment (Leaflet draws one polyline per edge)", () => {
    const segments = [
      { a: [0, 0], b: [3, 4] }, // length 5
      { a: [0, 0], b: [10, 0] }, // length 10
    ];
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segmentPositions(segments));
    setSegmentDistances(geometry, segments);
    const start = geometry.attributes.instanceDistanceStart;
    const end = geometry.attributes.instanceDistanceEnd;
    expect(start.getX(0)).toBe(0);
    expect(end.getX(0)).toBeCloseTo(5, 6);
    // NOT 15 — three's computeLineDistances would accumulate here.
    expect(start.getX(1)).toBe(0);
    expect(end.getX(1)).toBeCloseTo(10, 6);
    geometry.dispose();
  });
});

// ------------------------------------------------------------------- borders ---

describe("VectorLayer borders", () => {
  const left = region("left", [square(0, 0, 10)]);
  const right = region("right", [square(10, 0, 10)]);

  it("renders nothing when there are no regions at all", () => {
    const { layer } = makeLayer();
    layer.setShowBorders(true);
    expect(layer.dashedBordersObject).toBeNull();
    layer.setRegions([]);
    expect(layer.dashedBordersObject).toBeNull();
    expect(layer.object3D.children).toHaveLength(0);
    layer.dispose();
  });

  it("renders nothing until showBorders is on", () => {
    const { layer } = makeLayer();
    layer.setRegions([left, right]);
    expect(layer.dashedBordersObject).toBeNull();
    layer.setShowBorders(true);
    expect(segmentCount(layer.dashedBordersObject)).toBe(7);
    layer.setShowBorders(false);
    expect(layer.dashedBordersObject).toBeNull();
    layer.dispose();
  });

  it("styles non-hovered borders dashed 8/5 at half opacity, width 3", () => {
    const { layer } = makeLayer();
    layer.setRegions([left, right]);
    layer.setShowBorders(true);
    const material = layer.dashedBordersObject!.material;
    expect(material.dashed).toBe(true);
    expect(material.dashSize).toBe(BORDER_DASH);
    expect(material.gapSize).toBe(BORDER_GAP);
    expect(material.opacity).toBe(0.5);
    expect(material.linewidth).toBe(3);
    expect(material.color.getHexString()).toBe(
      new Color(DEFAULT_VECTOR_COLORS.region).getHexString(),
    );
    layer.dispose();
  });

  it("adds a solid full-opacity object for the hovered region's edges only", () => {
    const { layer } = makeLayer();
    layer.setRegions([left, right]);
    layer.setShowBorders(true);
    layer.setHovered("left");
    // 4 edges of the left square (its shared edge included).
    expect(segmentCount(layer.solidBordersObject)).toBe(4);
    const material = layer.solidBordersObject!.material;
    expect(material.dashed).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.linewidth).toBe(3);
    // The full dashed set is untouched — it is covered by the solid overlay.
    expect(segmentCount(layer.dashedBordersObject)).toBe(7);
    layer.setHovered(null);
    expect(layer.solidBordersObject).toBeNull();
    layer.dispose();
  });

  it("highlights every part of a multi-part region (Leaflet keys hover on the name)", () => {
    const { layer } = makeLayer();
    layer.setRegions([
      region("part-a", [square(0, 0, 10)], { name: "Twin" }),
      region("part-b", [square(100, 0, 10)], { name: "Twin" }),
    ]);
    layer.setShowBorders(true);
    layer.setHovered("part-a");
    expect(segmentCount(layer.solidBordersObject)).toBe(8);
    layer.dispose();
  });

  it("disposes the replaced border geometry when regions change", () => {
    const { layer } = makeLayer();
    layer.setRegions([left, right]);
    layer.setShowBorders(true);
    const old = layer.dashedBordersObject!;
    const geometrySpy = vi.spyOn(old.geometry, "dispose");
    const materialSpy = vi.spyOn(old.material, "dispose");
    layer.setRegions([left]);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
    expect(layer.dashedBordersObject).not.toBe(old);
    expect(segmentCount(layer.dashedBordersObject)).toBe(4);
    expect(layer.object3D.children).not.toContain(old);
    layer.dispose();
  });
});

// ---------------------------------------------------------------- hover fill ---

describe("VectorLayer hover fill", () => {
  it("renders a fill mesh for the hovered region only", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(50, 0, 10)])]);
    expect(layer.hoverFillObject).toBeNull();
    layer.setHovered("a");
    const mesh = layer.hoverFillObject!;
    expect(mesh.geometry.getIndex()!.count).toBe(6);
    expect(mesh.material.opacity).toBeCloseTo(0.18, 6);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.color.getHexString()).toBe(
      new Color(DEFAULT_VECTOR_COLORS.region).getHexString(),
    );
    layer.dispose();
  });

  it("disposes the previous fill when hover moves", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(50, 0, 10)])]);
    layer.setHovered("a");
    const old = layer.hoverFillObject!;
    const spy = vi.spyOn(old.geometry, "dispose");
    layer.setHovered("b");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(layer.hoverFillObject).not.toBe(old);
    layer.dispose();
  });

  it("REUSES the hover materials across crossings (no shader recompile per hover)", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(10, 0, 10)])]);
    layer.setShowBorders(true);
    layer.setHovered("a");
    const fillMaterial = layer.hoverFillObject!.material;
    const borderMaterial = layer.solidBordersObject!.material;
    const fillSpy = vi.spyOn(fillMaterial, "dispose");
    const borderSpy = vi.spyOn(borderMaterial, "dispose");

    layer.setHovered("b");
    layer.setHovered(null);
    layer.setHovered("a");

    // Same instances, never disposed: only geometry churns per crossing.
    expect(layer.hoverFillObject!.material).toBe(fillMaterial);
    expect(layer.solidBordersObject!.material).toBe(borderMaterial);
    expect(fillSpy).not.toHaveBeenCalled();
    expect(borderSpy).not.toHaveBeenCalled();
    layer.dispose();
    expect(fillSpy).toHaveBeenCalledTimes(1);
    expect(borderSpy).toHaveBeenCalledTimes(1);
  });

  it("draws nothing for an unknown or filtered-out region", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setHovered("nope");
    expect(layer.hovered).toBeNull();
    expect(layer.hoverFillObject).toBeNull();
    layer.setHovered("a");
    expect(layer.hoverFillObject).not.toBeNull();
    layer.setVisibleRegions(new Set<string>());
    expect(layer.hoverFillObject).toBeNull();
    layer.dispose();
  });

  it("renders no mesh at all when hoverFillOpacity is 0 (byte-exact Leaflet parity)", () => {
    const { layer } = makeLayer({ hoverFillOpacity: 0 });
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setHovered("a");
    expect(layer.hoverFillObject).toBeNull();
    layer.dispose();
  });

  it("drops a hover whose region disappeared from the set", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setHovered("a");
    layer.setRegions([region("b", [square(0, 0, 10)])]);
    expect(layer.hovered).toBeNull();
    expect(layer.hoverFillObject).toBeNull();
    layer.dispose();
  });
});

// -------------------------------------------------------------- overlay lines ---

describe("VectorLayer overlay lines", () => {
  it("projects endpoints from DATA space with dataToPoint", () => {
    const { layer } = makeLayer({ map: worldMap });
    layer.setOverlayLines([
      { id: "warp", from: { x: -1099400, y: -724400 }, to: { x: 349400, y: 724400 } },
    ]);
    const positions = layer.overlayLinesObject!.geometry.attributes.instanceStart;
    const from = dataToPoint(worldMap, -1099400, -724400);
    const to = dataToPoint(worldMap, 349400, 724400);
    expect(positions.getX(0)).toBeCloseTo(from.x, 4);
    expect(positions.getY(0)).toBeCloseTo(from.y, 4);
    const ends = layer.overlayLinesObject!.geometry.attributes.instanceEnd;
    expect(ends.getX(0)).toBeCloseTo(to.x, 4);
    expect(ends.getY(0)).toBeCloseTo(to.y, 4);
    // pxAxis=Y + flipY is a real transform, not the identity.
    expect(from).not.toEqual({ x: -1099400, y: -724400 });
    layer.dispose();
  });

  it("styles lines dashed 8/8 at width 2.5 / opacity 0.85", () => {
    const { layer } = makeLayer();
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }]);
    const material = layer.overlayLinesObject!.material;
    expect(material.dashed).toBe(true);
    expect(material.dashSize).toBe(8);
    expect(material.gapSize).toBe(8);
    expect(material.linewidth).toBe(2.5);
    expect(material.opacity).toBeCloseTo(0.85, 6);
    layer.dispose();
  });

  it("falls back to the injected default colour and honours per-line colours", () => {
    const { layer } = makeLayer({ colors: { overlayLine: "#ff0000" } });
    layer.setOverlayLines([
      { id: "default", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { id: "custom", from: { x: 0, y: 10 }, to: { x: 10, y: 10 }, color: "#00ff00" },
    ]);
    const colors = layer.overlayLinesObject!.geometry.attributes.instanceColorStart;
    // Per-line colours ride on the geometry (one draw call), so the material
    // colour stays white (the multiplier's identity).
    expect(layer.overlayLinesObject!.material.vertexColors).toBe(true);
    const red = new Color("#ff0000");
    const green = new Color("#00ff00");
    expect(colors.getX(0)).toBeCloseTo(red.r, 5);
    expect(colors.getY(0)).toBeCloseTo(red.g, 5);
    expect(colors.getX(1)).toBeCloseTo(green.r, 5);
    expect(colors.getY(1)).toBeCloseTo(green.g, 5);
    layer.dispose();
  });

  it("disposes the replaced geometry and material on every update", () => {
    const { layer } = makeLayer();
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    const old = layer.overlayLinesObject!;
    const geometrySpy = vi.spyOn(old.geometry, "dispose");
    const materialSpy = vi.spyOn(old.material, "dispose");
    layer.setOverlayLines([
      { id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { id: "b", from: { x: 0, y: 5 }, to: { x: 10, y: 5 } },
    ]);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
    expect(layer.object3D.children).not.toContain(old);
    expect(segmentCount(layer.overlayLinesObject)).toBe(2);

    // Clearing removes the object entirely.
    layer.setOverlayLines([]);
    expect(layer.overlayLinesObject).toBeNull();
    layer.dispose();
  });

  it("treats undefined like an empty list (the prop is optional)", () => {
    const { layer } = makeLayer();
    layer.setOverlayLines(undefined);
    expect(layer.overlayLinesObject).toBeNull();
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    const object = layer.overlayLinesObject!;
    const spy = vi.spyOn(object.geometry, "dispose");
    layer.setOverlayLines(undefined);
    expect(layer.overlayLinesObject).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(layer.object3D.children).not.toContain(object);
    layer.dispose();
  });

  it("snapshots the caller's array (a later in-place mutation is not picked up)", () => {
    const { layer } = makeLayer();
    const lines = [{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }];
    layer.setOverlayLines(lines);
    lines.push({ id: "b", from: { x: 0, y: 5 }, to: { x: 10, y: 5 } });
    expect(segmentCount(layer.overlayLinesObject)).toBe(1);
    layer.dispose();
  });

  it("re-projects on setMap", () => {
    const { layer } = makeLayer({ map: pixelMap });
    layer.setOverlayLines([{ id: "a", from: { x: 100, y: 200 }, to: { x: 300, y: 400 } }]);
    expect(layer.overlayLinesObject!.geometry.attributes.instanceStart.getX(0)).toBeCloseTo(
      100,
      4,
    );
    layer.setMap(worldMap);
    const expected = dataToPoint(worldMap, 100, 200);
    expect(layer.overlayLinesObject!.geometry.attributes.instanceStart.getX(0)).toBeCloseTo(
      expected.x,
      4,
    );
    layer.dispose();
  });
});

// ---------------------------------------------------------------- setColors ---

describe("VectorLayer.setColors", () => {
  function fullLayer() {
    const made = makeLayer();
    made.layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(10, 0, 10)])]);
    made.layer.setShowBorders(true);
    made.layer.setHovered("a");
    made.layer.setOverlayLines([{ id: "l", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    return made;
  }

  it("re-colours borders, hover fill and overlay defaults", () => {
    const { layer } = fullLayer();
    layer.setColors({ region: "#ff0000", overlayLine: "#00ff00" });
    const red = new Color("#ff0000").getHexString();
    expect(layer.dashedBordersObject!.material.color.getHexString()).toBe(red);
    expect(layer.solidBordersObject!.material.color.getHexString()).toBe(red);
    expect(layer.hoverFillObject!.material.color.getHexString()).toBe(red);
    // Overlay colours live on the geometry (the material stays white).
    const colors = layer.overlayLinesObject!.geometry.attributes.instanceColorStart;
    const green = new Color("#00ff00");
    expect(colors.getX(0)).toBeCloseTo(green.r, 5);
    expect(colors.getY(0)).toBeCloseTo(green.g, 5);
    layer.dispose();
  });

  it("disposes the materials it replaces, including the hoisted hover ones", () => {
    const { layer } = fullLayer();
    const spies = [
      layer.dashedBordersObject!.material,
      layer.solidBordersObject!.material,
      layer.hoverFillObject!.material,
      layer.overlayLinesObject!.material,
    ].map((m) => vi.spyOn(m, "dispose"));
    layer.setColors({ region: "#ff0000" });
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    layer.dispose();
  });

  it("keeps the hovered region, its geometry and the camera state", () => {
    const { layer } = fullLayer();
    layer.update(makeCamera(1, [640, 480]));
    layer.setColors({ region: "#ff0000" });
    expect(layer.hovered).toBe("a");
    expect(segmentCount(layer.solidBordersObject)).toBe(4);
    expect(segmentCount(layer.dashedBordersObject)).toBe(7);
    const material = layer.dashedBordersObject!.material;
    expect(material.dashScale).toBe(2);
    expect([material.resolution.x, material.resolution.y]).toEqual([640, 480]);
    layer.dispose();
  });

  it("is a no-op when neither colour changed", () => {
    const { layer } = fullLayer();
    const before = layer.dashedBordersObject!;
    layer.setColors({ region: DEFAULT_VECTOR_COLORS.region });
    expect(layer.dashedBordersObject).toBe(before);
    layer.dispose();
  });
});

// ------------------------------------------------------------- camera sync ---

describe("VectorLayer.update", () => {
  it("scales dashes with the zoom so they stay constant on SCREEN", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setShowBorders(true);
    const material = layer.dashedBordersObject!.material;

    // dashScale multiplies a MAP-pixel line distance; screen px = map px × scale,
    // so dashScale = scale makes dashSize/gapSize screen pixels.
    layer.update(makeCamera(0));
    expect(material.dashScale).toBe(1);
    layer.update(makeCamera(1));
    expect(material.dashScale).toBe(2);
    layer.update(makeCamera(-2));
    expect(material.dashScale).toBeCloseTo(0.25, 10);
    layer.dispose();
  });

  it("keeps LineMaterial.resolution in sync with the viewport (fat-line width bug)", () => {
    const { layer } = makeLayer();
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    const material = layer.overlayLinesObject!.material;
    layer.update(makeCamera(0, [1200, 800]));
    expect([material.resolution.x, material.resolution.y]).toEqual([1200, 800]);
    layer.update(makeCamera(0, [640, 480]));
    expect([material.resolution.x, material.resolution.y]).toEqual([640, 480]);
    layer.setResolution(320, 240);
    expect([material.resolution.x, material.resolution.y]).toEqual([320, 240]);
    layer.dispose();
  });

  it("does nothing at all when the camera state is unchanged", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setShowBorders(true);
    const material = layer.dashedBordersObject!.material;
    const camera = makeCamera(0);
    layer.update(camera);
    // Poke the uniform behind the layer's back: an early-returning update leaves
    // it alone, a recomputing one would restore it. This is what keeps the
    // per-frame cost at two number compares.
    material.dashScale = 99;
    layer.update(camera);
    expect(material.dashScale).toBe(99);
    // A real change still gets through.
    layer.update(makeCamera(1));
    expect(material.dashScale).toBe(2);
    layer.dispose();
  });

  it("applies the current camera state to materials created later", () => {
    const { layer } = makeLayer();
    layer.update(makeCamera(1, [640, 480]));
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setShowBorders(true);
    const material = layer.dashedBordersObject!.material;
    expect(material.dashScale).toBe(2);
    expect([material.resolution.x, material.resolution.y]).toEqual([640, 480]);
    layer.dispose();
  });
});

// ------------------------------------------------------------------ lifecycle ---

describe("VectorLayer lifecycle", () => {
  it("uses the vectors draw-order bucket and names its group", () => {
    const { layer } = makeLayer();
    expect(layer.order).toBe(LayerOrder.vectors);
    expect(layer.object3D.name).toBe("vectors");
    layer.dispose();
  });

  it("stacks children like Leaflet: fill under borders, solid over dashed, lines on top", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(10, 0, 10)])]);
    layer.setShowBorders(true);
    layer.setHovered("a");
    layer.setOverlayLines([{ id: "l", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    const order = (o: { renderOrder: number } | null) => o!.renderOrder;
    expect(order(layer.hoverFillObject)).toBeLessThan(order(layer.dashedBordersObject));
    expect(order(layer.dashedBordersObject)).toBeLessThan(order(layer.solidBordersObject));
    expect(order(layer.solidBordersObject)).toBeLessThan(order(layer.overlayLinesObject));
    layer.dispose();
  });

  it("resolves a duplicate region id to the smallest-area record, like regionAt", () => {
    const { layer } = makeLayer();
    layer.setRegions([
      region("dup", [square(0, 0, 100)]),
      region("dup", [square(40, 40, 10)]),
    ]);
    expect(layer.regionAt({ x: 45, y: 45 })).toBe("dup");
    layer.setHovered("dup");
    // 10×10 → 2 triangles; the 100×100 record would be the same count, so check
    // the geometry's extent instead.
    const positions = layer.hoverFillObject!.geometry.getAttribute("position");
    let maxX = -Infinity;
    for (let i = 0; i < positions.count; i++) maxX = Math.max(maxX, positions.getX(i));
    expect(maxX).toBe(50);
    layer.dispose();
  });

  it("asks for a frame on every mutation", () => {
    const { layer, invalidate } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)])]);
    layer.setShowBorders(true);
    layer.setHovered("a");
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(4);
    layer.dispose();
  });

  it("disposes every geometry and material, and empties the group", () => {
    const { layer } = makeLayer();
    layer.setRegions([region("a", [square(0, 0, 10)]), region("b", [square(10, 0, 10)])]);
    layer.setShowBorders(true);
    layer.setHovered("a");
    layer.setOverlayLines([{ id: "a", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }]);
    const objects = [
      layer.dashedBordersObject!,
      layer.solidBordersObject!,
      layer.hoverFillObject!,
      layer.overlayLinesObject!,
    ];
    expect(objects.every(Boolean)).toBe(true);
    const spies = objects.flatMap((o) => [
      vi.spyOn(o.geometry, "dispose"),
      vi.spyOn(o.material, "dispose"),
    ]);
    layer.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(layer.object3D.children).toHaveLength(0);
    expect(layer.isDisposed).toBe(true);
    // Post-dispose mutations are inert.
    layer.setRegions([region("c", [square(0, 0, 10)])]);
    layer.setOverlayLines([{ id: "z", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }]);
    expect(layer.object3D.children).toHaveLength(0);
  });
});
