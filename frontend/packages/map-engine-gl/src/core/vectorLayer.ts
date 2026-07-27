import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import earcut from "earcut";
import type { GameMapMeta, RegionInstance } from "@gamemap/data-contract";
import type { Camera } from "./camera.ts";
import { dataToPoint } from "./coords.ts";
import { LayerOrder, type RenderLayer } from "./renderer.ts";
import type { PixelBounds, Point } from "./types.ts";

/**
 * Region fills, de-duplicated region borders and app-supplied overlay lines —
 * the GL counterpart of the Leaflet engine's `GameMapBorders` plus
 * `GameMapView`'s `overlayLines` polylines.
 *
 * ## The hover model is INVERTED relative to Leaflet
 * Leaflet draws one invisible, *interactive* polygon per region ring
 * (`stroke: false, fillOpacity: 0`) purely so the browser can hit-test it and
 * fire `mouseover`. There is no DOM here and nothing to hit-test against, so
 * those base fills are simply NOT rendered: the React layer calls
 * {@link VectorLayer.regionAt} on pointermove and feeds the answer back through
 * {@link VectorLayer.setHovered}. Only the hovered region gets a real mesh, so a
 * region set of any size costs zero geometry until the cursor is over one.
 *
 * `regionAt` deliberately reproduces the app's own `pointInPolygon` +
 * smallest-area-wins lookup (palworld `App.tsx` `subzoneAt`), so the region the
 * map highlights and the region the status bar names can never disagree.
 *
 * ## Rings are polygons, never holes
 * `RegionInstance.borders` is an array of rings, and Leaflet renders each ring
 * as its OWN `<Polygon>` (`region.borders.map(polygon => <Polygon .../>)`),
 * never as an outline+holes list. A ring nested inside another is therefore
 * filled, not punched out. This layer keeps that behaviour: every ring is
 * triangulated on its own (`earcut(ring)` with no hole indices) and
 * point-in-polygon is an OR over the rings.
 *
 * ## Everything is map-pixel space
 * `borders` arrives in map-pixel coordinates already (the `tools` pipeline emits
 * region polygons in pixels), so region geometry is used verbatim — the y-down
 * scene space of the renderer *is* that space. Only overlay lines arrive in DATA
 * space and go through {@link dataToPoint}.
 *
 * ## Line widths and dashes
 * `LineBasicMaterial`'s `linewidth` is ignored (1 px) by every desktop GL
 * driver, so borders and overlay lines use the fat-line addon
 * (`LineSegments2` + `LineSegmentsGeometry` + `LineMaterial`) whose
 * `linewidth` is in CSS pixels — the same unit as Leaflet's `weight`. Two
 * consequences the code below handles explicitly:
 *
 * 1. `LineMaterial.resolution` must be the CSS-pixel viewport or the width is
 *    wrong. `LineSegments2.onBeforeRender` sets it from the renderer's viewport
 *    for *visible* objects, but this layer also sets it from the camera in
 *    {@link VectorLayer.update} so it is correct without a GL context (tests, a
 *    weapp backend) and on the frame a hidden object becomes visible.
 * 2. DASHES ARE SCREEN-SPACE (decision). The fat-line shader compares
 *    `dashScale * lineDistance` — a WORLD-space distance — against
 *    `dashSize + gapSize`, so left alone a dash pattern would shrink and grow
 *    with zoom, unlike Leaflet's SVG `dashArray` which is constant on screen.
 *    Because screen px = map px × `camera.scale()`, setting
 *    `dashScale = camera.scale()` converts those distances to CSS pixels and
 *    makes `8 5` mean 8 px on 5 px at every zoom — exact Leaflet parity for one
 *    uniform write per zoom change. Dash *phase* also restarts per segment
 *    ({@link setSegmentDistances}) because Leaflet draws every de-duplicated
 *    edge as its own `<Polyline>`; three's `computeLineDistances` accumulates
 *    across segments instead, which would make short edges land inside a gap and
 *    vanish.
 *
 * ## Colours
 * Leaflet styles regions with `var(--primary, #2E97FF)`; a GL shader cannot read
 * a CSS variable, so the resolved colour is injected
 * ({@link VectorLayerOptions.colors}, default {@link DEFAULT_VECTOR_COLORS}) and
 * the React layer is responsible for resolving the custom property (and for
 * calling {@link VectorLayer.setColors} when the theme flips).
 */

// ------------------------------------------------------------------ colours ---

export interface VectorColors {
  /**
   * Region fill + border colour. Leaflet: `var(--primary, #2E97FF)` — this is
   * that fallback.
   */
  region: string;
  /** Overlay-line colour when the line itself carries none (`theme.pinDot`). */
  overlayLine: string;
}

export const DEFAULT_VECTOR_COLORS: VectorColors = {
  region: "#2E97FF",
  overlayLine: "#2E97FF",
};

/**
 * Hovered-region fill opacity.
 *
 * NOTE — deviation from the Leaflet engine, on purpose: `GameMapBorders`'
 * `HoverHighlight` passes `fillOpacity: 0`, i.e. the Leaflet hover fill is
 * currently INVISIBLE (only the hovered region's borders change, to solid). The
 * plan asks for a visible highlight ("~0.18 to match Leaflet's default 0.2
 * feel"), so that is the default here. Pass `hoverFillOpacity: 0` for
 * pixel-identical parity with today's Leaflet output.
 */
export const DEFAULT_HOVER_FILL_OPACITY = 0.18;

/** Border weight, CSS px — Leaflet `weight: 3` for both hovered and not. */
export const BORDER_WIDTH = 3;
/** Non-hovered border dash pattern, CSS px — Leaflet `dashArray: "8 5"`. */
export const BORDER_DASH = 8;
export const BORDER_GAP = 5;
/** Non-hovered border opacity — Leaflet `opacity: 0.5` (hovered: 1, solid). */
export const BORDER_OPACITY = 0.5;

/** Overlay line style — Leaflet `weight: 2.5, opacity: .85, dashArray: "8 8"`. */
export const OVERLAY_LINE_WIDTH = 2.5;
export const OVERLAY_LINE_DASH = 8;
export const OVERLAY_LINE_GAP = 8;
export const OVERLAY_LINE_OPACITY = 0.85;

// -------------------------------------------------------------------- types ---

/** An app-supplied line overlay (a teleporter link), endpoints in DATA space. */
export interface OverlayLine {
  id: string;
  from: Point;
  to: Point;
  color?: string;
}

/** One de-duplicated border edge and the regions that claim it. */
export interface BorderEdge {
  /** Order-independent identity of the endpoint pair. */
  key: string;
  a: readonly number[];
  b: readonly number[];
  /**
   * Names (not ids) of the regions this edge belongs to — Leaflet keys hover on
   * `region.name`, so a multi-part region highlights all of its parts at once.
   */
  regions: string[];
}

// ------------------------------------------------------------- ring geometry ---

/**
 * Signed-area magnitude of a ring, as the app computes it (shoelace over
 * `i → i+1`, no wrap: the rings are closed, i.e. last point == first).
 * Used only to order overlapping regions, so the sign is irrelevant.
 */
export function ringArea(ring: readonly number[][]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s) / 2;
}

/** Axis-aligned bounds of a ring (empty/degenerate → an inverted box). */
export function ringBounds(ring: readonly number[][]): PixelBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

function unionBounds(list: readonly PixelBounds[]): PixelBounds {
  const out: PixelBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const b of list) {
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
  }
  return out;
}

function inBounds(x: number, y: number, b: PixelBounds): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

/**
 * Ray-casting point-in-polygon, byte-for-byte the app's `pointInPolygon`
 * (palworld `App.tsx`, aion2 `useSubzoneLookup.ts`) so the map's hover and the
 * status bar's subzone name always pick the same region.
 *
 * Boundary rule (deterministic, half-open): a crossing counts when
 * `(yi > y) !== (yj > y)` and strictly `x < xIntersect`. For an axis-aligned box
 * that puts the min-x and min-y edges INSIDE and the max-x and max-y edges
 * OUTSIDE (so two regions sharing a border never both claim a point, and never
 * both disown it). Sub-pixel cursor positions make this unobservable in
 * practice — it is pinned by tests only so the behaviour cannot silently change.
 */
export function pointInRing(x: number, y: number, ring: readonly number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Triangulate rings for a fill mesh. Each ring is its own polygon (see the file
 * header — Leaflet renders them that way and there are no holes), so the rings'
 * triangle lists are concatenated with the index offset applied.
 *
 * A closed ring's duplicated last point is dropped before triangulating:
 * earcut would otherwise emit a zero-area triangle at the seam.
 */
export function triangulateRings(rings: readonly number[][][]): {
  positions: Float32Array;
  index: Uint32Array;
} {
  const positions: number[] = [];
  const index: number[] = [];
  for (const ring of rings) {
    const closed =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const count = closed ? ring.length - 1 : ring.length;
    if (count < 3) continue;
    const flat: number[] = [];
    for (let i = 0; i < count; i++) {
      flat.push(ring[i][0], ring[i][1]);
    }
    const base = positions.length / 3;
    const tris = earcut(flat);
    if (tris.length === 0) continue;
    for (let i = 0; i < count; i++) {
      positions.push(flat[i * 2], flat[i * 2 + 1], 0);
    }
    for (const t of tris) index.push(base + t);
  }
  return { positions: new Float32Array(positions), index: new Uint32Array(index) };
}

// --------------------------------------------------------------- edge dedup ---

/**
 * Order-independent key of an edge — ported verbatim from `GameMapBorders`
 * (`String(point)` gives `"x,y"`, then the lexicographically smaller endpoint
 * comes first), so both engines collapse exactly the same pairs.
 */
export function edgeKey(a: readonly number[], b: readonly number[]): string {
  const A = `${a}`;
  const B = `${b}`;
  return A < B ? `${A}|${B}` : `${B}|${A}`;
}

/**
 * Every border edge of every region, with edges shared by two regions collapsed
 * into one entry (an internal border between two regions is drawn once).
 *
 * Two ported details:
 * - The loop is `i < ring.length - 1` with NO wraparound: the rings are closed,
 *   so the closing edge is already in the list. An unclosed ring loses its
 *   closing edge here exactly as it does in Leaflet.
 * - `visibleRegions` is NOT applied. Leaflet's `BorderSegments` is built from
 *   the unfiltered `regions` array (only the interactive base fills are
 *   filtered), so hidden regions still contribute borders.
 */
export function dedupeRegionEdges(regions: readonly RegionInstance[]): BorderEdge[] {
  const edges = new Map<string, BorderEdge>();
  for (const region of regions) {
    for (const ring of region.borders) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const key = edgeKey(a, b);
        const existing = edges.get(key);
        if (existing) existing.regions.push(region.name);
        else edges.set(key, { key, a, b, regions: [region.name] });
      }
    }
  }
  return [...edges.values()];
}

// -------------------------------------------------------------- fat-line I/O ---

/** `[x, y, 0]` per endpoint, 6 floats per segment — `setPositions` input. */
export function segmentPositions(
  segments: readonly { a: readonly number[]; b: readonly number[] }[],
): Float32Array {
  const out = new Float32Array(segments.length * 6);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const o = i * 6;
    out[o] = s.a[0];
    out[o + 1] = s.a[1];
    out[o + 2] = 0;
    out[o + 3] = s.b[0];
    out[o + 4] = s.b[1];
    out[o + 5] = 0;
  }
  return out;
}

/**
 * Per-segment dash distances: every segment starts its dash cycle at 0, which
 * is what an SVG `dashArray` does for a two-point `<Polyline>`.
 * `LineSegments2.computeLineDistances` accumulates instead (it assumes one
 * polyline), so short edges would start mid-gap and disappear.
 *
 * Layout matches the addon's: one interleaved buffer, stride 2 =
 * `[distanceStart, distanceEnd]` per instance.
 */
export function setSegmentDistances(
  geometry: LineSegmentsGeometry,
  segments: readonly { a: readonly number[]; b: readonly number[] }[],
): void {
  const distances = new Float32Array(segments.length * 2);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dx = s.b[0] - s.a[0];
    const dy = s.b[1] - s.a[1];
    distances[i * 2] = 0;
    distances[i * 2 + 1] = Math.hypot(dx, dy);
  }
  const buffer = new InstancedInterleavedBuffer(distances, 2, 1);
  geometry.setAttribute(
    "instanceDistanceStart",
    new InterleavedBufferAttribute(buffer, 1, 0),
  );
  geometry.setAttribute(
    "instanceDistanceEnd",
    new InterleavedBufferAttribute(buffer, 1, 1),
  );
}

// -------------------------------------------------------------------- layer ---

export interface VectorLayerOptions {
  /** Needed to project overlay lines from DATA space. */
  map: GameMapMeta;
  /** Ask the renderer for another frame after a mutation. */
  invalidate: () => void;
  /** Resolved colours; defaults to {@link DEFAULT_VECTOR_COLORS}. */
  colors?: Partial<VectorColors>;
  /** Hovered-region fill opacity. Default {@link DEFAULT_HOVER_FILL_OPACITY}. */
  hoverFillOpacity?: number;
  /** Draw order. Default `LayerOrder.vectors`. */
  order?: number;
}

interface RegionRecord {
  region: RegionInstance;
  /** Bounds per ring, plus the union — both used to reject hit-tests early. */
  ringBounds: PixelBounds[];
  bounds: PixelBounds;
  /** Sum of the rings' areas; ties in `regionAt` break by this, smallest wins. */
  area: number;
}

/** Draw order inside the layer's group, mirroring Leaflet's stacking. */
const CHILD_ORDER = {
  hoverFill: 0,
  dashedBorders: 1,
  solidBorders: 2,
  overlayLines: 3,
} as const;

export class VectorLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private map: GameMapMeta;
  private readonly invalidate: () => void;
  private colors: VectorColors;
  private hoverFillOpacity: number;

  /** Ingested regions, sorted by area ASCENDING (smallest-area hit wins). */
  private records: RegionRecord[] = [];
  private byId = new Map<string, RegionRecord>();
  private edges: BorderEdge[] = [];
  private visibleRegions: Set<string> | undefined;
  private showBorders = false;
  private hoveredId: string | null = null;
  private lines: OverlayLine[] = [];

  private hoverFill: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private dashedBorders: LineSegments2 | null = null;
  private solidBorders: LineSegments2 | null = null;
  private overlayObject: LineSegments2 | null = null;

  /** Camera-derived uniforms, applied to every material as it is created. */
  private viewScale = 1;
  private viewWidth = 1;
  private viewHeight = 1;
  private disposed = false;

  constructor(opts: VectorLayerOptions) {
    this.map = opts.map;
    this.invalidate = opts.invalidate;
    this.colors = { ...DEFAULT_VECTOR_COLORS, ...opts.colors };
    this.hoverFillOpacity = opts.hoverFillOpacity ?? DEFAULT_HOVER_FILL_OPACITY;
    this.order = opts.order ?? LayerOrder.vectors;
    this.object3D.name = "vectors";
  }

  // ------------------------------------------------------------- ingestion ---

  /**
   * Replace the region set. Bounds, areas and the de-duplicated edge list are
   * computed once here — `regionAt` runs on every pointermove and must not do
   * any of it.
   */
  setRegions(regions: readonly RegionInstance[]): void {
    if (this.disposed) return;
    this.records = regions.map((region) => {
      const rb = region.borders.map(ringBounds);
      return {
        region,
        ringBounds: rb,
        bounds: unionBounds(rb),
        area: region.borders.reduce((sum, ring) => sum + ringArea(ring), 0),
      };
    });
    this.records.sort((a, b) => a.area - b.area);
    this.byId = new Map(this.records.map((r) => [r.region.id, r]));
    this.edges = dedupeRegionEdges(regions);
    // A hovered region that no longer exists must not keep a mesh alive.
    if (this.hoveredId !== null && !this.byId.has(this.hoveredId)) {
      this.hoveredId = null;
    }
    this.rebuildBorders();
    this.rebuildHover();
    this.invalidate();
  }

  /**
   * Which regions take part in hover. `undefined` means ALL — the opposite
   * default from the marker subtype filter, and the same as Leaflet's
   * `!visibleRegions || visibleRegions.has(region.name)`.
   *
   * Leaflet matches on `name`; ids are accepted too so a consumer holding ids
   * does not silently get an empty map.
   */
  setVisibleRegions(regions: Set<string> | undefined): void {
    if (this.disposed || regions === this.visibleRegions) return;
    this.visibleRegions = regions;
    // The hovered region may have just been filtered out.
    this.rebuildHover();
    this.invalidate();
  }

  private isVisible(record: RegionRecord): boolean {
    if (!this.visibleRegions) return true;
    return (
      this.visibleRegions.has(record.region.name) ||
      this.visibleRegions.has(record.region.id)
    );
  }

  setShowBorders(show: boolean): void {
    if (this.disposed || show === this.showBorders) return;
    this.showBorders = show;
    this.rebuildBorders();
    this.rebuildHover();
    this.invalidate();
  }

  /** Hovered region by id, or `null`. Cheap: only two small objects rebuild. */
  setHovered(regionId: string | null): void {
    if (this.disposed || regionId === this.hoveredId) return;
    this.hoveredId = regionId !== null && this.byId.has(regionId) ? regionId : null;
    this.rebuildHover();
    this.invalidate();
  }

  get hovered(): string | null {
    return this.hoveredId;
  }

  /** Re-project overlay lines onto another map (regions are pixel-space). */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.rebuildOverlayLines();
    this.invalidate();
  }

  setColors(colors: Partial<VectorColors>): void {
    if (this.disposed) return;
    const next = { ...this.colors, ...colors };
    if (next.region === this.colors.region && next.overlayLine === this.colors.overlayLine) {
      return;
    }
    this.colors = next;
    this.rebuildBorders();
    this.rebuildHover();
    this.rebuildOverlayLines();
    this.invalidate();
  }

  /** Replace the overlay lines. Old geometry/material are disposed. */
  setOverlayLines(lines: readonly OverlayLine[] | undefined): void {
    if (this.disposed) return;
    this.lines = lines ? [...lines] : [];
    this.rebuildOverlayLines();
    this.invalidate();
  }

  // ----------------------------------------------------------- hit testing ---

  /**
   * Region under a MAP-PIXEL point, or `null`. Overlaps resolve to the
   * SMALLEST-AREA region: cave/dungeon volumes overlap their surface region in
   * 2D and a flat cursor has no Z, so the most specific one wins (same rule as
   * the app's `subzoneAt`).
   *
   * Only regions that pass {@link setVisibleRegions} are considered — Leaflet
   * only makes the filtered base fills interactive.
   *
   * Cost per call: one bbox compare per region (records are pre-sorted by area,
   * so the answer is usually found in the first few), then one bbox compare and
   * at most one ray cast per ring of the candidates.
   */
  regionAt(point: Point): string | null {
    const { x, y } = point;
    for (const record of this.records) {
      if (!inBounds(x, y, record.bounds)) continue;
      if (!this.isVisible(record)) continue;
      const rings = record.region.borders;
      for (let i = 0; i < rings.length; i++) {
        if (!inBounds(x, y, record.ringBounds[i])) continue;
        if (pointInRing(x, y, rings[i])) return record.region.id;
      }
    }
    return null;
  }

  // -------------------------------------------------------------- geometry ---

  private rebuildBorders(): void {
    this.disposeLine(this.dashedBorders);
    this.dashedBorders = null;
    if (!this.showBorders || this.edges.length === 0) return;
    // ALL edges, hovered ones included: the solid hovered object is drawn on top
    // of them with the same width and full opacity, so it covers them exactly.
    // Rebuilding only the (tiny) hovered object on every pointermove is the
    // whole point — the full border set can be thousands of segments.
    const material = this.makeLineMaterial({
      color: this.colors.region,
      linewidth: BORDER_WIDTH,
      opacity: BORDER_OPACITY,
      dash: BORDER_DASH,
      gap: BORDER_GAP,
    });
    this.dashedBorders = this.makeSegments(this.edges, material, CHILD_ORDER.dashedBorders);
    this.dashedBorders.name = "region-borders-dashed";
    this.object3D.add(this.dashedBorders);
  }

  /** Hovered-region fill + its solid borders. The only per-hover work. */
  private rebuildHover(): void {
    this.disposeMesh(this.hoverFill);
    this.hoverFill = null;
    this.disposeLine(this.solidBorders);
    this.solidBorders = null;

    const record = this.hoveredId !== null ? this.byId.get(this.hoveredId) : undefined;
    if (!record || !this.isVisible(record)) return;

    if (this.hoverFillOpacity > 0) {
      const { positions, index } = triangulateRings(record.region.borders);
      if (index.length > 0) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setIndex(new BufferAttribute(index, 1));
        const material = new MeshBasicMaterial({
          color: new Color(this.colors.region),
          transparent: true,
          opacity: this.hoverFillOpacity,
          // Layer group order decides stacking; every layer sits at z = 0.
          depthTest: false,
          depthWrite: false,
          // The y-flipped projection reverses winding — see renderer.ts.
          side: DoubleSide,
        });
        this.hoverFill = new Mesh(geometry, material);
        this.hoverFill.name = "region-hover-fill";
        this.hoverFill.renderOrder = CHILD_ORDER.hoverFill;
        this.object3D.add(this.hoverFill);
      }
    }

    if (!this.showBorders) return;
    // Leaflet keys the hovered border style on the region NAME, so every part of
    // a multi-part region lights up together.
    const name = record.region.name;
    const hoveredEdges = this.edges.filter((e) => e.regions.includes(name));
    if (hoveredEdges.length === 0) return;
    const material = this.makeLineMaterial({
      color: this.colors.region,
      linewidth: BORDER_WIDTH,
      opacity: 1,
      // Leaflet's hovered dashArray is "1 0" — a solid line.
      dash: 0,
      gap: 0,
    });
    this.solidBorders = this.makeSegments(hoveredEdges, material, CHILD_ORDER.solidBorders);
    this.solidBorders.name = "region-borders-solid";
    this.object3D.add(this.solidBorders);
  }

  private rebuildOverlayLines(): void {
    this.disposeLine(this.overlayObject);
    this.overlayObject = null;
    if (this.lines.length === 0) return;

    const segments = this.lines.map((line) => {
      const from = dataToPoint(this.map, line.from.x, line.from.y);
      const to = dataToPoint(this.map, line.to.x, line.to.y);
      return { a: [from.x, from.y], b: [to.x, to.y] };
    });
    const material = this.makeLineMaterial({
      color: "#ffffff",
      linewidth: OVERLAY_LINE_WIDTH,
      opacity: OVERLAY_LINE_OPACITY,
      dash: OVERLAY_LINE_DASH,
      gap: OVERLAY_LINE_GAP,
    });
    // Per-line colours in ONE draw call: the fat-line shader reads
    // `instanceColorStart/End` when the material has `vertexColors`. The
    // material colour above is therefore white (the multiplier's identity).
    material.vertexColors = true;
    const object = this.makeSegments(segments, material, CHILD_ORDER.overlayLines);
    const colors = new Float32Array(this.lines.length * 6);
    const rgb = new Color();
    for (let i = 0; i < this.lines.length; i++) {
      rgb.set(this.lines[i].color ?? this.colors.overlayLine);
      const o = i * 6;
      colors[o] = rgb.r;
      colors[o + 1] = rgb.g;
      colors[o + 2] = rgb.b;
      colors[o + 3] = rgb.r;
      colors[o + 4] = rgb.g;
      colors[o + 5] = rgb.b;
    }
    object.geometry.setColors(colors);
    object.name = "overlay-lines";
    this.overlayObject = object;
    this.object3D.add(object);
  }

  private makeSegments(
    segments: readonly { a: readonly number[]; b: readonly number[] }[],
    material: LineMaterial,
    renderOrder: number,
  ): LineSegments2 {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(segmentPositions(segments));
    setSegmentDistances(geometry, segments);
    const object = new LineSegments2(geometry, material);
    object.renderOrder = renderOrder;
    // Fat lines are camera-facing quads built in the shader; three's frustum
    // culling uses the geometry's bounding sphere, which for a segment soup
    // spanning the whole map is useless and (with `setPositions` alone) not
    // always computed. Culling is the tile layer's job here.
    object.frustumCulled = false;
    return object;
  }

  private makeLineMaterial(spec: {
    color: string;
    linewidth: number;
    opacity: number;
    dash: number;
    gap: number;
  }): LineMaterial {
    const material = new LineMaterial({
      color: new Color(spec.color),
      linewidth: spec.linewidth,
      transparent: true,
      opacity: spec.opacity,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      dashed: spec.dash > 0,
      dashSize: spec.dash,
      gapSize: spec.gap,
    });
    // `dashed` via the constructor does not add the shader define in every three
    // version — set it through the accessor, which does.
    material.dashed = spec.dash > 0;
    this.applyView(material);
    return material;
  }

  /** Camera-dependent uniforms: fat-line resolution + screen-space dashes. */
  private applyView(material: LineMaterial): void {
    material.resolution.set(this.viewWidth, this.viewHeight);
    material.dashScale = this.viewScale;
  }

  private eachLineMaterial(fn: (material: LineMaterial) => void): void {
    for (const object of [this.dashedBorders, this.solidBorders, this.overlayObject]) {
      if (object) fn(object.material);
    }
  }

  // ----------------------------------------------------------------- frame ---

  /**
   * Only zoom- and viewport-dependent uniforms are touched, and only when they
   * actually changed — this runs before every single render.
   */
  update(camera: Camera): void {
    if (this.disposed) return;
    const scale = camera.scale();
    const width = camera.viewportWidth;
    const height = camera.viewportHeight;
    if (scale === this.viewScale && width === this.viewWidth && height === this.viewHeight) {
      return;
    }
    this.viewScale = scale;
    this.viewWidth = width;
    this.viewHeight = height;
    this.eachLineMaterial((material) => this.applyView(material));
  }

  /**
   * Explicit viewport setter for hosts that resize without a camera change
   * (`LineMaterial.resolution` going stale is the classic fat-line bug).
   */
  setResolution(width: number, height: number): void {
    if (this.disposed || (width === this.viewWidth && height === this.viewHeight)) return;
    this.viewWidth = width;
    this.viewHeight = height;
    this.eachLineMaterial((material) => this.applyView(material));
    this.invalidate();
  }

  // -------------------------------------------------------------- teardown ---

  private disposeLine(object: LineSegments2 | null): void {
    if (!object) return;
    this.object3D.remove(object);
    object.geometry.dispose();
    object.material.dispose();
  }

  private disposeMesh(mesh: Mesh<BufferGeometry, MeshBasicMaterial> | null): void {
    if (!mesh) return;
    this.object3D.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeLine(this.dashedBorders);
    this.disposeLine(this.solidBorders);
    this.disposeLine(this.overlayObject);
    this.disposeMesh(this.hoverFill);
    this.dashedBorders = null;
    this.solidBorders = null;
    this.overlayObject = null;
    this.hoverFill = null;
    this.records = [];
    this.byId.clear();
    this.edges = [];
    this.lines = [];
    this.object3D.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // --------------------------------------------------- tests / diagnostics ---

  /** The hovered region's fill mesh, or `null` when nothing is hovered. */
  get hoverFillObject(): Mesh<BufferGeometry, MeshBasicMaterial> | null {
    return this.hoverFill;
  }

  /** All de-duplicated borders, dashed. `null` when borders are off. */
  get dashedBordersObject(): LineSegments2 | null {
    return this.dashedBorders;
  }

  /** The hovered region's borders, solid, drawn over the dashed ones. */
  get solidBordersObject(): LineSegments2 | null {
    return this.solidBorders;
  }

  /** All overlay lines in one object (per-line colours via vertex colours). */
  get overlayLinesObject(): LineSegments2 | null {
    return this.overlayObject;
  }

  /** De-duplicated edge list currently held. */
  get borderEdges(): readonly BorderEdge[] {
    return this.edges;
  }
}
