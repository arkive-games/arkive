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
 * `regionAt` reproduces the *algorithm* of the app's own lookup (palworld
 * `App.tsx` `subzoneAt`): the same `pointInPolygon` ray cast, the same
 * smallest-area-wins tie-break.
 *
 * It does NOT automatically produce the same ANSWER, and that is worth spelling
 * out: `subzoneAt` first filters `r.type === 'region'` (surface regions only),
 * while the app hands the engine *every* region — MainWorld ships 81 `region`
 * volumes plus 42 `cave`/`dungeon`/`tower` ones. The interior volumes are small,
 * so they sort first and legitimately win `regionAt` while the status bar keeps
 * naming the surface region containing them. Today's Leaflet engine behaves the
 * same way (its base fills are unfiltered too), so this is parity, not a bug —
 * but a consumer that wants the two aligned can pass
 * {@link VectorLayerOptions.regionFilter} (e.g. `r => r.type === 'region'`).
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
 * 3. CAPS: a dashed fat line has BUTT caps — the shader skips the endcap
 *    geometry under `USE_DASH` — while Leaflet's SVG default is `round`. At
 *    width 3 that is a sub-pixel difference at each dash end; it is not worth
 *    chasing in the visual pass.
 *
 * Hover materials are created ONCE and only their geometry is swapped: a fresh
 * `LineMaterial`/`MeshBasicMaterial` per hover change would be the sole owner of
 * its program cache key, so disposing it destroys the GL program and the next
 * region crossing recompiles the fat-line shader on the render thread — exactly
 * the per-crossing hitch the Leaflet original was refactored to avoid.
 *
 * ## Colours
 * Leaflet styles regions with `var(--primary, #0090FF)`; a GL shader cannot read
 * a CSS variable, so the resolved colour is injected
 * ({@link VectorLayerOptions.colors}, default {@link DEFAULT_VECTOR_COLORS}) and
 * the React layer is responsible for resolving the custom property (and for
 * calling {@link VectorLayer.setColors} when the theme flips).
 */

// ------------------------------------------------------------------ colours ---

export interface VectorColors {
  /**
   * Region fill + border colour. Leaflet: `var(--primary, #0090FF)` — this is
   * that fallback.
   */
  region: string;
  /** Overlay-line colour when the line itself carries none (`theme.pinDot`). */
  overlayLine: string;
}

export const DEFAULT_VECTOR_COLORS: VectorColors = {
  region: "#0090FF",
  overlayLine: "#0090FF",
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
export const AMBIENT_LINE_WIDTH = 1.5;
export const AMBIENT_LINE_DASH = 4;
export const AMBIENT_LINE_GAP = 8;
export const AMBIENT_LINE_OPACITY = 0.28;
export const HIGHLIGHT_LINE_WIDTH = 4;
export const HIGHLIGHT_LINE_DASH = 10;
export const HIGHLIGHT_LINE_GAP = 5;
export const HIGHLIGHT_LINE_OPACITY = 0.92;

/**
 * Permanently-highlighted regions ({@link VectorLayer.setHighlighted}) — the
 * "this is the area we are talking about" outline an embedded mini-map draws
 * around a quest's or an NPC's region. Ported from aion2's wiki `EmbeddedMap`,
 * whose `<Polygon>` used `weight: 1.5`, `dashArray: "4 4"`, `fillOpacity: 0.15`
 * and the `--primary` colour, hence the values below and the reuse of
 * `colors.region`.
 */
export const REGION_HIGHLIGHT_WIDTH = 1.5;
export const REGION_HIGHLIGHT_DASH = 4;
export const REGION_HIGHLIGHT_GAP = 4;
export const REGION_HIGHLIGHT_FILL_OPACITY = 0.15;
export const REGION_HIGHLIGHT_BORDER_OPACITY = 1;

// -------------------------------------------------------------------- types ---

/** An app-supplied line overlay (a teleporter link), endpoints in DATA space. */
export interface OverlayLine {
  id: string;
  from: Point;
  to: Point;
  color?: string;
  variant?: "ambient" | "highlight";
}

/**
 * Order-sensitive equality for the highlight request. Order-sensitive on purpose:
 * comparing as sets would need an allocation per call, and a host that reorders
 * the same ids pays only one rebuild of a handful of rings.
 */
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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
 *
 * ONE deliberate deviation: an edge whose endpoints are identical (a duplicated
 * consecutive ring point) is dropped. Leaflet would paint a round-cap dot; the
 * fat-line vertex shader normalises the segment direction, so a zero-length
 * segment produces NaN vertices and can blank the whole draw call. No shipped
 * region has one — this keeps a future data glitch from taking the borders out.
 */
export function dedupeRegionEdges(regions: readonly RegionInstance[]): BorderEdge[] {
  const edges = new Map<string, BorderEdge>();
  for (const region of regions) {
    for (const ring of region.borders) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (a[0] === b[0] && a[1] === b[1]) continue;
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
  /**
   * Opt-in extra predicate deciding which regions can be hovered, on top of
   * `visibleRegions`. Leaflet has no equivalent — the default (`undefined`)
   * accepts every region, which is Leaflet's behaviour. Pass
   * `r => r.type === "region"` to make {@link VectorLayer.regionAt} agree with
   * palworld's surface-only `subzoneAt` (see the file header).
   */
  regionFilter?: (region: RegionInstance) => boolean;
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
  highlightFill: 0,
  hoverFill: 1,
  dashedBorders: 2,
  highlightBorders: 3,
  solidBorders: 4,
  ambientLines: 5,
  overlayLines: 6,
  highlightLines: 7,
} as const;

export class VectorLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private map: GameMapMeta;
  private readonly invalidate: () => void;
  private colors: VectorColors;
  private readonly hoverFillOpacity: number;
  private readonly regionFilter: ((region: RegionInstance) => boolean) | undefined;

  /** Ingested regions, sorted by area ASCENDING (smallest-area hit wins). */
  private records: RegionRecord[] = [];
  private byId = new Map<string, RegionRecord>();
  private edges: BorderEdge[] = [];
  private visibleRegions: ReadonlySet<string> | undefined;
  private showBorders = false;
  private hoveredId: string | null = null;
  /** What the host asked for, verbatim — see {@link setHighlighted}. */
  private requestedHighlightIds: readonly string[] = [];
  /** The subset of the request that resolved to geometry. */
  private highlightedIds: ReadonlySet<string> = new Set();
  private lines: OverlayLine[] = [];

  private hoverFill: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private highlightFill: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private highlightBorders: LineSegments2 | null = null;
  private dashedBorders: LineSegments2 | null = null;
  private solidBorders: LineSegments2 | null = null;
  private overlayObject: LineSegments2 | null = null;
  private ambientOverlayObject: LineSegments2 | null = null;
  private highlightOverlayObject: LineSegments2 | null = null;

  /**
   * Hover materials, created on first use and reused for the lifetime of the
   * layer (or until {@link setColors}) — see the file header: recreating them
   * per hover change recompiles a shader program on every region crossing.
   */
  private hoverFillMaterial: MeshBasicMaterial | null = null;
  private hoverBorderMaterial: LineMaterial | null = null;

  /** Highlight materials; same hoisting rationale as the hover pair above. */
  private highlightFillMaterial: MeshBasicMaterial | null = null;
  private highlightBorderMaterial: LineMaterial | null = null;

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
    this.regionFilter = opts.regionFilter;
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
    // FIRST wins on a duplicate id, and `records` is sorted by area ascending, so
    // the record an id resolves to is the same one `regionAt` would have returned
    // for a point inside it. (Ids are unique in the shipped data; last-wins would
    // silently highlight the wrong part if they ever weren't.)
    this.byId = new Map();
    for (const record of this.records) {
      if (!this.byId.has(record.region.id)) this.byId.set(record.region.id, record);
    }
    this.edges = dedupeRegionEdges(regions);
    // A hovered region that no longer exists must not keep a mesh alive.
    if (this.hoveredId !== null && !this.byId.has(this.hoveredId)) {
      this.hoveredId = null;
    }
    this.rebuildBorders();
    this.rebuildHover();
    // Re-resolves the highlight REQUEST against the new records, so ids that
    // arrived before their geometry light up now (and ids whose region is gone
    // stop drawing).
    this.rebuildHighlight();
    this.invalidate();
  }

  /**
   * Which regions take part in hover, keyed on `region.**name**` — exactly
   * Leaflet's `!visibleRegions || visibleRegions.has(region.name)`. `undefined`
   * means ALL, the opposite default from the marker subtype filter.
   *
   * Name-only on purpose: accepting ids as well would make a region visible
   * whenever its id happened to equal a *different* region's name, and no test
   * would ever catch that. A consumer holding ids should map them to names (or
   * use {@link VectorLayerOptions.regionFilter}).
   *
   * No identity short-circuit: a caller that mutates its Set in place and calls
   * again must not be silently ignored (`markerLayer.setVisibility` behaves the
   * same way).
   */
  setVisibleRegions(regions: ReadonlySet<string> | undefined): void {
    if (this.disposed) return;
    this.visibleRegions = regions;
    // The hovered region may have just been filtered out.
    this.rebuildHover();
    this.invalidate();
  }

  /** Whether a region can be hovered: `visibleRegions` ∧ `regionFilter`. */
  private isVisible(record: RegionRecord): boolean {
    if (this.regionFilter && !this.regionFilter(record.region)) return false;
    if (!this.visibleRegions) return true;
    return this.visibleRegions.has(record.region.name);
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

  /**
   * Regions outlined PERMANENTLY, independent of the cursor — an embedded
   * mini-map marking the area a wiki page is about.
   *
   * Unlike {@link setHovered} this ignores `setVisibleRegions` and
   * {@link VectorLayerOptions.regionFilter}: those two model "what the user can
   * interact with on the main map", whereas a highlight is an explicit request
   * by id from the host, and silently dropping it because a filter happens to be
   * narrow would be a bug with no visible cause. Ids the layer has never heard of
   * ARE dropped, since there is no geometry to draw.
   *
   * The REQUEST is remembered rather than the resolved set, so the order the host
   * calls this and {@link setRegions} in does not matter: highlighting an id
   * before its region document arrives lights up as soon as it does. That is not
   * a hypothetical — the embed fetches its regions asynchronously and receives its
   * highlight ids from the page's route, which is already there.
   */
  setHighlighted(regionIds: readonly string[] | null | undefined): void {
    if (this.disposed) return;
    const next = regionIds ? [...regionIds] : [];
    if (sameStrings(next, this.requestedHighlightIds)) return;
    this.requestedHighlightIds = next;
    this.rebuildHighlight();
    this.invalidate();
  }

  /** Ids drawn right now — the request minus the ids with no geometry. */
  get highlighted(): readonly string[] {
    return [...this.highlightedIds];
  }

  /** Re-project overlay lines onto another map (regions are pixel-space). */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.rebuildOverlayLines();
    this.invalidate();
  }

  /**
   * Re-colour everything (the host resolved `--primary` differently, e.g. dark
   * mode). This is the ONLY path that recreates the hover materials, so it is
   * also the only one that can cost a shader compile — a theme flip, not a
   * pointermove.
   */
  setColors(colors: Partial<VectorColors>): void {
    if (this.disposed) return;
    const next = { ...this.colors, ...colors };
    if (next.region === this.colors.region && next.overlayLine === this.colors.overlayLine) {
      return;
    }
    this.colors = next;
    this.disposeHoverMaterials();
    this.disposeHighlightMaterials();
    this.rebuildBorders();
    this.rebuildHover();
    this.rebuildHighlight();
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
   * 2D and a flat cursor has no Z, so the most specific one wins — the same
   * tie-break as the app's `subzoneAt`, though not necessarily the same answer
   * unless the caller also matches its `type` filter (see the file header).
   *
   * Only regions that pass {@link setVisibleRegions} and
   * {@link VectorLayerOptions.regionFilter} are considered — Leaflet only makes
   * the filtered base fills interactive.
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

  /**
   * Hovered-region fill + its solid borders — the only per-hover work, and it
   * allocates GEOMETRY ONLY: both materials are hoisted (see the file header) so
   * a region crossing never destroys a GL program.
   */
  private rebuildHover(): void {
    this.detachHoverObjects();

    const record = this.hoveredId !== null ? this.byId.get(this.hoveredId) : undefined;
    if (!record || !this.isVisible(record)) return;

    if (this.hoverFillOpacity > 0) {
      const { positions, index } = triangulateRings(record.region.borders);
      if (index.length > 0) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setIndex(new BufferAttribute(index, 1));
        this.hoverFill = new Mesh(geometry, this.getHoverFillMaterial());
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
    this.solidBorders = this.makeSegments(
      hoveredEdges,
      this.getHoverBorderMaterial(),
      CHILD_ORDER.solidBorders,
    );
    this.solidBorders.name = "region-borders-solid";
    this.object3D.add(this.solidBorders);
  }

  /**
   * Permanent highlight fill + dashed outline for {@link setHighlighted}.
   *
   * Every highlighted region's rings go into ONE mesh and ONE segment soup: the
   * set is host-chosen and small (a quest names one or two regions), and one
   * object per region would multiply draw calls for no benefit.
   *
   * The outline is built from each ring's own consecutive points rather than from
   * the de-duplicated `edges` used by the borders: Leaflet drew these as
   * standalone `<Polygon>`s, so a highlighted region shows its COMPLETE outline
   * even where it shares an edge with a neighbour that the dedup pass would have
   * folded away.
   */
  private rebuildHighlight(): void {
    this.detachHighlightObjects();

    const resolved = new Set<string>();
    const rings: number[][][] = [];
    for (const id of this.requestedHighlightIds) {
      const record = this.byId.get(id);
      // A repeated id must not contribute its rings twice: the fill is
      // transparent, so a doubled mesh reads as a darker patch.
      if (!record || resolved.has(id)) continue;
      resolved.add(id);
      rings.push(...record.region.borders);
    }
    this.highlightedIds = resolved;
    if (rings.length === 0) return;

    if (REGION_HIGHLIGHT_FILL_OPACITY > 0) {
      const { positions, index } = triangulateRings(rings);
      if (index.length > 0) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(positions, 3));
        geometry.setIndex(new BufferAttribute(index, 1));
        this.highlightFill = new Mesh(geometry, this.getHighlightFillMaterial());
        this.highlightFill.name = "region-highlight-fill";
        this.highlightFill.renderOrder = CHILD_ORDER.highlightFill;
        this.object3D.add(this.highlightFill);
      }
    }

    const segments: { a: readonly number[]; b: readonly number[] }[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) segments.push({ a: ring[i], b: ring[i + 1] });
    }
    if (segments.length === 0) return;
    this.highlightBorders = this.makeSegments(
      segments,
      this.getHighlightBorderMaterial(),
      CHILD_ORDER.highlightBorders,
    );
    this.highlightBorders.name = "region-highlight-borders";
    this.object3D.add(this.highlightBorders);
  }

  /** Detach the highlight objects and free their geometry; materials are kept. */
  private detachHighlightObjects(): void {
    if (this.highlightFill) {
      this.object3D.remove(this.highlightFill);
      this.highlightFill.geometry.dispose();
      this.highlightFill = null;
    }
    if (this.highlightBorders) {
      this.object3D.remove(this.highlightBorders);
      this.highlightBorders.geometry.dispose();
      this.highlightBorders = null;
    }
  }

  private getHighlightFillMaterial(): MeshBasicMaterial {
    if (!this.highlightFillMaterial) {
      this.highlightFillMaterial = new MeshBasicMaterial({
        color: new Color(this.colors.region),
        transparent: true,
        opacity: REGION_HIGHLIGHT_FILL_OPACITY,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      });
    }
    return this.highlightFillMaterial;
  }

  private getHighlightBorderMaterial(): LineMaterial {
    if (!this.highlightBorderMaterial) {
      this.highlightBorderMaterial = this.makeLineMaterial({
        color: this.colors.region,
        linewidth: REGION_HIGHLIGHT_WIDTH,
        opacity: REGION_HIGHLIGHT_BORDER_OPACITY,
        dash: REGION_HIGHLIGHT_DASH,
        gap: REGION_HIGHLIGHT_GAP,
      });
    }
    return this.highlightBorderMaterial;
  }

  /** Detach the hover objects and free their geometry; materials are kept. */
  private detachHoverObjects(): void {
    if (this.hoverFill) {
      this.object3D.remove(this.hoverFill);
      this.hoverFill.geometry.dispose();
      this.hoverFill = null;
    }
    if (this.solidBorders) {
      this.object3D.remove(this.solidBorders);
      this.solidBorders.geometry.dispose();
      this.solidBorders = null;
    }
  }

  private getHoverFillMaterial(): MeshBasicMaterial {
    if (!this.hoverFillMaterial) {
      this.hoverFillMaterial = new MeshBasicMaterial({
        color: new Color(this.colors.region),
        transparent: true,
        opacity: this.hoverFillOpacity,
        // Layer group order decides stacking; every layer sits at z = 0.
        depthTest: false,
        depthWrite: false,
        // The y-flipped projection reverses winding — see renderer.ts.
        side: DoubleSide,
      });
    }
    return this.hoverFillMaterial;
  }

  private getHoverBorderMaterial(): LineMaterial {
    if (!this.hoverBorderMaterial) {
      this.hoverBorderMaterial = this.makeLineMaterial({
        color: this.colors.region,
        linewidth: BORDER_WIDTH,
        opacity: 1,
        // Leaflet's hovered dashArray is "1 0" — a solid line.
        dash: 0,
        gap: 0,
      });
    }
    return this.hoverBorderMaterial;
  }

  /** Drop the cached hover materials so the next hover picks up new colours. */
  private disposeHoverMaterials(): void {
    this.hoverFillMaterial?.dispose();
    this.hoverFillMaterial = null;
    this.hoverBorderMaterial?.dispose();
    this.hoverBorderMaterial = null;
  }

  /** Same, for the highlight pair. */
  private disposeHighlightMaterials(): void {
    this.highlightFillMaterial?.dispose();
    this.highlightFillMaterial = null;
    this.highlightBorderMaterial?.dispose();
    this.highlightBorderMaterial = null;
  }

  private rebuildOverlayLines(): void {
    this.disposeLine(this.overlayObject);
    this.disposeLine(this.ambientOverlayObject);
    this.disposeLine(this.highlightOverlayObject);
    this.overlayObject = null;
    this.ambientOverlayObject = null;
    this.highlightOverlayObject = null;
    if (this.lines.length === 0) return;

    const groups = [
      {
        lines: this.lines.filter((line) => line.variant === "ambient"),
        spec: {
          linewidth: AMBIENT_LINE_WIDTH,
          opacity: AMBIENT_LINE_OPACITY,
          dash: AMBIENT_LINE_DASH,
          gap: AMBIENT_LINE_GAP,
        },
        name: "ambient-overlay-lines",
        order: CHILD_ORDER.ambientLines,
      },
      {
        lines: this.lines.filter((line) => line.variant == null),
        spec: {
          linewidth: OVERLAY_LINE_WIDTH,
          opacity: OVERLAY_LINE_OPACITY,
          dash: OVERLAY_LINE_DASH,
          gap: OVERLAY_LINE_GAP,
        },
        name: "overlay-lines",
        order: CHILD_ORDER.overlayLines,
      },
      {
        lines: this.lines.filter((line) => line.variant === "highlight"),
        spec: {
          linewidth: HIGHLIGHT_LINE_WIDTH,
          opacity: HIGHLIGHT_LINE_OPACITY,
          dash: HIGHLIGHT_LINE_DASH,
          gap: HIGHLIGHT_LINE_GAP,
        },
        name: "highlight-overlay-lines",
        order: CHILD_ORDER.highlightLines,
      },
    ];

    this.ambientOverlayObject = this.buildOverlayObject(groups[0]);
    this.overlayObject = this.buildOverlayObject(groups[1]);
    this.highlightOverlayObject = this.buildOverlayObject(groups[2]);
  }

  private buildOverlayObject(group: {
    lines: OverlayLine[];
    spec: { linewidth: number; opacity: number; dash: number; gap: number };
    name: string;
    order: number;
  }): LineSegments2 | null {
    if (group.lines.length === 0) return null;
    const segments = group.lines.map((line) => {
      const from = dataToPoint(this.map, line.from.x, line.from.y);
      const to = dataToPoint(this.map, line.to.x, line.to.y);
      return { a: [from.x, from.y], b: [to.x, to.y] };
    });
    const material = this.makeLineMaterial({
      color: "#ffffff",
      ...group.spec,
    });
    // Per-line colours in ONE draw call: the fat-line shader reads
    // `instanceColorStart/End` when the material has `vertexColors`. The
    // material colour above is therefore white (the multiplier's identity).
    material.vertexColors = true;
    const object = this.makeSegments(segments, material, group.order);
    const colors = new Float32Array(group.lines.length * 6);
    const rgb = new Color();
    for (let i = 0; i < group.lines.length; i++) {
      rgb.set(group.lines[i].color ?? this.colors.overlayLine);
      const o = i * 6;
      colors[o] = rgb.r;
      colors[o + 1] = rgb.g;
      colors[o + 2] = rgb.b;
      colors[o + 3] = rgb.r;
      colors[o + 4] = rgb.g;
      colors[o + 5] = rgb.b;
    }
    object.geometry.setColors(colors);
    object.name = group.name;
    this.object3D.add(object);
    return object;
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
    // `setPositions` does compute the bounding box and sphere, but for a segment
    // soup spanning the whole map that sphere always intersects the frustum, so
    // the per-frame test is pure overhead. Off it goes; culling at the object
    // level is meaningless for one map-sized object anyway.
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
      // `LineMaterial`'s constructor runs `setValues` after `super()`, and
      // `dashed` is a real accessor, so this does add the `USE_DASH` define.
      dashed: spec.dash > 0,
      dashSize: spec.dash,
      gapSize: spec.gap,
    });
    this.applyView(material);
    return material;
  }

  /** Camera-dependent uniforms: fat-line resolution + screen-space dashes. */
  private applyView(material: LineMaterial): void {
    material.resolution.set(this.viewWidth, this.viewHeight);
    material.dashScale = this.viewScale;
  }

  /**
   * Every live `LineMaterial`. The hover border material is listed directly, not
   * via `solidBorders`: it outlives the object that uses it, and a stale
   * `resolution`/`dashScale` on it would show up the moment the next hover
   * attaches geometry to it.
   */
  private eachLineMaterial(fn: (material: LineMaterial) => void): void {
    if (this.dashedBorders) fn(this.dashedBorders.material);
    if (this.hoverBorderMaterial) fn(this.hoverBorderMaterial);
    if (this.highlightBorderMaterial) fn(this.highlightBorderMaterial);
    if (this.ambientOverlayObject) fn(this.ambientOverlayObject.material);
    if (this.overlayObject) fn(this.overlayObject.material);
    if (this.highlightOverlayObject) fn(this.highlightOverlayObject.material);
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
   * ESCAPE HATCH, not part of the normal flow: with `MapRenderer` a resize goes
   * `setSize` → `camera.setViewport` → the next `update(camera)`, which syncs the
   * resolution already. This exists only for a host that drives the layer without
   * that camera path (the weapp target), because a stale
   * `LineMaterial.resolution` is the classic fat-line width bug. Overwritten by
   * the next `update` whose camera viewport differs.
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeLine(this.dashedBorders);
    this.disposeLine(this.ambientOverlayObject);
    this.disposeLine(this.overlayObject);
    this.disposeLine(this.highlightOverlayObject);
    this.dashedBorders = null;
    this.overlayObject = null;
    this.ambientOverlayObject = null;
    this.highlightOverlayObject = null;
    // Hover objects share the hoisted materials, so their geometry goes first and
    // the materials once, here.
    this.detachHoverObjects();
    this.disposeHoverMaterials();
    this.detachHighlightObjects();
    this.disposeHighlightMaterials();
    this.records = [];
    this.byId.clear();
    this.edges = [];
    this.lines = [];
    this.requestedHighlightIds = [];
    this.highlightedIds = new Set();
    this.object3D.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // --------------------------------------------------- tests / diagnostics ---

  /** The highlighted regions' fill mesh, or `null` when nothing is highlighted. */
  get highlightFillObject(): Mesh<BufferGeometry, MeshBasicMaterial> | null {
    return this.highlightFill;
  }

  /** The highlighted regions' dashed outline, or `null`. */
  get highlightBordersObject(): LineSegments2 | null {
    return this.highlightBorders;
  }

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

  /** Low-profile route segments. */
  get ambientOverlayLinesObject(): LineSegments2 | null {
    return this.ambientOverlayObject;
  }

  /** Selected route segments. */
  get highlightOverlayLinesObject(): LineSegments2 | null {
    return this.highlightOverlayObject;
  }

  /** De-duplicated edge list currently held. */
  get borderEdges(): readonly BorderEdge[] {
    return this.edges;
  }
}
