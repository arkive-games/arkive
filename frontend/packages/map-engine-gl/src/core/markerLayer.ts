import {
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  type Texture,
} from "three";
import type { GameMapMeta, MarkerInstance, MarkerTypeSubtype } from "@gamemap/data-contract";
import type { MapAssets } from "./assets.ts";
import type { Camera } from "./camera.ts";
import { dataToPoint } from "./coords.ts";
import {
  PinAtlas,
  resolvePinSpec,
  type PinEntry,
  type PinTheme,
} from "./pinAtlas.ts";
import { LayerOrder, type RenderLayer } from "./renderer.ts";
import type { Point } from "./types.ts";

/**
 * The marker layer: every visible marker as an atlas-textured quad, plus the
 * hit-testing the DOM would have done for us.
 *
 * ## One draw call per atlas page
 * Markers are drawn from an {@link InstancedBufferGeometry}: a single unit quad
 * whose four vertices are shared by every instance, with three instanced
 * attributes (centre in map pixels, sprite edge in CSS pixels, atlas UV rect).
 * A tiny {@link ShaderMaterial} expands each instance in the vertex shader.
 *
 * Why not `THREE.Sprite`: a `SpriteMaterial` has no per-instance UV, so N
 * distinct pins would need N materials — i.e. N draw calls and N GPU state
 * changes, which is exactly the per-marker cost the GL engine exists to remove.
 * Why not `InstancedMesh`: it carries a 16-float matrix per instance and still
 * needs a patched material for the UV rect; the instanced geometry above needs 7
 * floats per marker and no shader patching.
 *
 * ## Screen-constant size (parity requirement)
 * Leaflet DivIcons are DOM elements: a 40px pin is 40 CSS px at EVERY zoom. The
 * vertex shader therefore divides the sprite's CSS size by `uScale`
 * (`camera.scale()`, i.e. screen px per map pixel) before adding it to the
 * instance centre, so the quad's map-pixel extent shrinks as you zoom in and its
 * screen extent never changes. This is the ONLY per-frame work: `update(camera)`
 * writes one uniform per page, so a pan costs O(pages), not O(markers).
 *
 * ## Rebuilds
 * The instance buffers are rebuilt wholesale on `setMarkers`, `setSelected`,
 * `setVisibility` and (only when LOD is on) when a tier threshold is crossed.
 * That is O(markers) with no allocation beyond the occasional capacity growth —
 * sub-millisecond at the ~4k markers the palworld maps carry — and, crucially,
 * it never happens while merely panning or zooming.
 */

// -------------------------------------------------------------- visibility ---

/** At/above this zoom, tier-2 markers appear (Leaflet engine: `TIER2_MIN_ZOOM`). */
export const TIER2_MIN_ZOOM = -1.25;
/** At/above this zoom, tier-3 markers appear. */
export const TIER3_MIN_ZOOM = 0;

/** Highest marker tier visible at `zoom`. Lower tiers stay visible above it. */
export function visibleTierForZoom(zoom: number): number {
  if (zoom >= TIER3_MIN_ZOOM) return 3;
  if (zoom >= TIER2_MIN_ZOOM) return 2;
  return 1;
}

/**
 * The marker shape this layer needs. `EngineMarker` (React layer) satisfies it
 * structurally, so the core never imports the React-layer types.
 */
export interface LayerMarker extends MarkerInstance {
  subtypeMeta?: MarkerTypeSubtype;
  completed?: boolean;
}

export interface MarkerVisibility {
  /**
   * Subtype filter. **`undefined` hides EVERYTHING** — it means "the app has not
   * initialised its filter yet", not "no filter" (same inverted default as the
   * Leaflet engine, whose `visibleSubtypes?.has(...)` is falsy for `undefined`).
   */
  visibleSubtypes?: ReadonlySet<string>;
  /** Bypasses the subtype filter AND LOD (e.g. active search results). */
  forceShowIds?: ReadonlySet<string>;
  /** Gate tiers behind zoom thresholds. palworld passes `false`. */
  lodEnabled?: boolean;
}

interface VisibilityContext {
  selectedId: string | null;
  forceShowIds?: ReadonlySet<string>;
  visibleSubtypes?: ReadonlySet<string>;
  lodEnabled: boolean;
  visibleTier: number;
}

/**
 * Appendix A §2.10 verbatim:
 * - the selected marker and `forceShowIds` bypass the subtype filter and LOD;
 * - otherwise the subtype must be in `visibleSubtypes` (undefined ⇒ nothing);
 * - with LOD on, `tier == null` is hidden and `tier` must not exceed the tier
 *   the current zoom unlocks.
 *
 * Viewport culling is deliberately absent: the GPU draws the whole set in one
 * call, so culling would only add work (the Leaflet engine culls because each
 * marker is DOM). DOM overlay labels still cull — that is Task 6's business.
 */
export function isMarkerVisible(
  marker: Pick<LayerMarker, "id" | "subtype" | "tier">,
  ctx: VisibilityContext,
): boolean {
  if (marker.id === ctx.selectedId) return true;
  if (ctx.forceShowIds?.has(marker.id)) return true;
  if (!ctx.visibleSubtypes?.has(marker.subtype)) return false;
  if (ctx.lodEnabled) {
    if (marker.tier == null) return false;
    if (marker.tier > ctx.visibleTier) return false;
  }
  return true;
}

// ----------------------------------------------------------------- fan-out ---

/** Radius of the fan applied to markers sharing one coordinate, in map pixels. */
export const FAN_RADIUS_PX = 18;

/**
 * Spread markers that share an identical DATA coordinate around a circle so none
 * hides another (boss "pool" spawn points put several markers on one spot). The
 * DATA is untouched — only the rendered position moves.
 *
 * Port of `GameMapView.tsx`'s `positionById`: group by the raw `x,y` string,
 * groups of one project straight through, larger groups get
 * `angle = 2πi/n` and an 18px offset. Leaflet offsets `lat + R·sin(angle)` in its
 * y-UP space; this engine is y-DOWN, so the same visual layout is
 * `y − R·sin(angle)` (`x + R·cos(angle)` is unchanged).
 */
export function fanOutPositions(
  markers: readonly { x: number; y: number }[],
  project: (x: number, y: number) => Point,
): Point[] {
  const out = new Array<Point>(markers.length);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < markers.length; i++) {
    const key = `${markers[i].x},${markers[i].y}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      const m = markers[group[0]];
      out[group[0]] = project(m.x, m.y);
      continue;
    }
    for (let k = 0; k < group.length; k++) {
      const i = group[k];
      const base = project(markers[i].x, markers[i].y);
      const angle = (2 * Math.PI * k) / group.length;
      out[i] = {
        x: base.x + FAN_RADIUS_PX * Math.cos(angle),
        y: base.y - FAN_RADIUS_PX * Math.sin(angle),
      };
    }
  }
  return out;
}

// ------------------------------------------------------------------ shader ---

/**
 * `position.xy` is the unit quad's corner (±0.5). The instance's screen size is
 * converted to map pixels with `uScale` so the sprite stays screen-constant.
 *
 * UV: the corner at `position.y = -0.5` is the SCREEN-TOP one (the renderer's
 * flipped projection), and the atlas textures use `flipY = false`, so the top
 * corner must sample the rect's `v0` — which is what `corner + 0.5` gives.
 */
const MARKER_VERTEX = /* glsl */ `
attribute vec2 aCenter;
attribute float aSize;
attribute vec4 aUvRect;
uniform float uScale;
varying vec2 vUv;
void main() {
  vec2 corner = position.xy;
  vUv = mix(aUvRect.xy, aUvRect.zw, corner + 0.5);
  vec2 mapPos = aCenter + corner * (aSize / uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mapPos, 0.0, 1.0);
}
`;

/**
 * Straight atlas sample. Fully transparent gutter pixels are discarded so an
 * empty region of the atlas can never tint what is behind it, and
 * `colorspace_fragment` performs the linear→sRGB output conversion three does
 * automatically for its built-in materials.
 */
const MARKER_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.004) discard;
  gl_FragColor = texel;
  #include <colorspace_fragment>
}
`;

const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];
const INITIAL_BATCH_CAPACITY = 256;

interface Batch {
  page: number;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh;
  aCenter: InstancedBufferAttribute;
  aSize: InstancedBufferAttribute;
  aUvRect: InstancedBufferAttribute;
  capacity: number;
  count: number;
}

function createBatch(page: number, texture: Texture, renderOrder: number): Batch {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(QUAD_CORNERS.slice(), 3));
  geometry.setIndex(QUAD_INDEX.slice());
  const material = new ShaderMaterial({
    uniforms: { uMap: { value: texture }, uScale: { value: 1 } },
    vertexShader: MARKER_VERTEX,
    fragmentShader: MARKER_FRAGMENT,
    // Renderer layer contract: transparent (so markers sort with the tiles
    // rather than before them), no depth (draw order is renderOrder-only), and
    // no back-face culling (the flipped projection reverses winding).
    //
    // Blending is three's default NormalBlending against UNPREMULTIPLIED atlas
    // texels — the same pairing `tileLayer` uses, and what a `CanvasTexture`
    // yields by default. If the visual pass finds a halo around antialiased pin
    // edges (un-premultiplying an 8-bit premultiplied canvas loses precision at
    // very low alpha), the fix is the premultiplied pair:
    // `texture.premultiplyAlpha = true` + `material.premultipliedAlpha = true`.
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  // The vertex shader moves vertices, so three's bounding sphere would be wrong;
  // there is nothing to gain from culling a single draw call anyway.
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  const batch: Batch = {
    page,
    geometry,
    material,
    mesh,
    aCenter: instancedAttribute(2, INITIAL_BATCH_CAPACITY),
    aSize: instancedAttribute(1, INITIAL_BATCH_CAPACITY),
    aUvRect: instancedAttribute(4, INITIAL_BATCH_CAPACITY),
    capacity: INITIAL_BATCH_CAPACITY,
    count: 0,
  };
  bindBatchAttributes(batch);
  return batch;
}

function instancedAttribute(itemSize: number, capacity: number): InstancedBufferAttribute {
  const attr = new InstancedBufferAttribute(new Float32Array(itemSize * capacity), itemSize);
  attr.setUsage(DynamicDrawUsage);
  return attr;
}

function bindBatchAttributes(batch: Batch): void {
  batch.geometry.setAttribute("aCenter", batch.aCenter);
  batch.geometry.setAttribute("aSize", batch.aSize);
  batch.geometry.setAttribute("aUvRect", batch.aUvRect);
}

/**
 * Double the instance buffers, preserving what is already written.
 *
 * The replaced attributes' GPU buffers are only released when the geometry is
 * disposed, so a batch leaks at most `log2(finalCapacity / 256)` small buffers
 * over its lifetime — four ~16 KB buffers at the ~4k markers the palworld maps
 * carry, and none at all once the capacity has settled.
 */
function growBatch(batch: Batch, needed: number): void {
  let capacity = batch.capacity;
  while (capacity < needed) capacity *= 2;
  const center = instancedAttribute(2, capacity);
  const size = instancedAttribute(1, capacity);
  const uv = instancedAttribute(4, capacity);
  (center.array as Float32Array).set(batch.aCenter.array as Float32Array);
  (size.array as Float32Array).set(batch.aSize.array as Float32Array);
  (uv.array as Float32Array).set(batch.aUvRect.array as Float32Array);
  batch.aCenter = center;
  batch.aSize = size;
  batch.aUvRect = uv;
  batch.capacity = capacity;
  bindBatchAttributes(batch);
}

function pushInstance(batch: Batch, x: number, y: number, entry: PinEntry): void {
  if (batch.count + 1 > batch.capacity) growBatch(batch, batch.count + 1);
  const i = batch.count++;
  const centers = batch.aCenter.array as Float32Array;
  centers[i * 2] = x;
  centers[i * 2 + 1] = y;
  (batch.aSize.array as Float32Array)[i] = entry.size;
  const uv = batch.aUvRect.array as Float32Array;
  uv[i * 4] = entry.u0;
  uv[i * 4 + 1] = entry.v0;
  uv[i * 4 + 2] = entry.u1;
  uv[i * 4 + 3] = entry.v1;
}

function finishBatch(batch: Batch): void {
  batch.aCenter.needsUpdate = true;
  batch.aSize.needsUpdate = true;
  batch.aUvRect.needsUpdate = true;
  batch.geometry.instanceCount = batch.count;
  batch.mesh.visible = batch.count > 0;
}

function disposeBatch(batch: Batch): void {
  batch.geometry.dispose();
  batch.material.dispose();
}

// ------------------------------------------------------------------- layer ---

export interface MarkerLayerOptions {
  /** Needed by {@link MarkerLayer.hitTest}, which runs outside the render loop. */
  camera: Camera;
  map: GameMapMeta;
  assets: MapAssets;
  /** Ask the renderer for a frame (rebuild, icon arrival). */
  invalidate: () => void;
  /**
   * Pin bitmap cache. Defaults to a browser {@link PinAtlas} wired to
   * `invalidate`; inject one to share it (or to test without a DOM). An injected
   * atlas is NOT disposed with the layer.
   */
  atlas?: PinAtlas;
  theme?: PinTheme;
  visibility?: MarkerVisibility;
  order?: number;
}

/** Draw order of the selected marker, above every page batch (Leaflet: zIndexOffset 1000). */
const SELECTED_RENDER_ORDER = 1;

export class MarkerLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private readonly camera: Camera;
  private readonly assets: MapAssets;
  private readonly invalidate: () => void;
  private readonly atlas: PinAtlas;
  private readonly ownsAtlas: boolean;
  private readonly theme: PinTheme | undefined;
  private readonly unsubscribeAtlas: () => void;

  private map: GameMapMeta;
  private markers: readonly LayerMarker[] = [];
  private positions: Point[] = [];
  private indexById = new Map<string, number>();
  /** Atlas entry per marker index; `undefined` = not resolved yet. */
  private entries: (PinEntry | null | undefined)[] = [];
  /** Indices of visible markers; only `[0, visibleCount)` is meaningful. */
  private visibleIdx: number[] = [];
  private visibleCount = 0;

  private selectedId: string | null = null;
  private selectedIndex = -1;
  private visibleSubtypes: ReadonlySet<string> | undefined;
  private forceShowIds: ReadonlySet<string> | undefined;
  private lodEnabled = false;
  private lastTier: number;

  private readonly batches = new Map<number, Batch>();
  private readonly batchList: Batch[] = [];
  private selectedBatch: Batch | null = null;
  private disposed = false;

  constructor(opts: MarkerLayerOptions) {
    this.camera = opts.camera;
    this.map = opts.map;
    this.assets = opts.assets;
    this.invalidate = opts.invalidate;
    this.theme = opts.theme;
    this.ownsAtlas = !opts.atlas;
    this.atlas = opts.atlas ?? new PinAtlas({ onUpdate: opts.invalidate });
    // An icon image arriving changes a page's pixels, never an entry's rect or
    // size — so a repaint is all that is needed, never a rebuild.
    this.unsubscribeAtlas = this.atlas.addUpdateListener(opts.invalidate);
    this.order = opts.order ?? LayerOrder.markers;
    this.object3D.name = "markers";
    this.visibleSubtypes = opts.visibility?.visibleSubtypes;
    this.forceShowIds = opts.visibility?.forceShowIds;
    this.lodEnabled = !!opts.visibility?.lodEnabled;
    this.lastTier = visibleTierForZoom(opts.camera.zoom);
  }

  // ------------------------------------------------------------- mutators ---

  /**
   * Replace the marker set: reproject (with fan-out), drop the resolved pin
   * entries and rebuild. The array is kept by reference — callers must treat it
   * as immutable, exactly as the React layer's memoized list already is.
   */
  setMarkers(markers: readonly LayerMarker[]): void {
    if (this.disposed) return;
    this.markers = markers;
    this.positions = fanOutPositions(markers, (x, y) => dataToPoint(this.map, x, y));
    this.indexById = new Map<string, number>();
    for (let i = 0; i < markers.length; i++) this.indexById.set(markers[i].id, i);
    this.entries = new Array<PinEntry | null | undefined>(markers.length);
    this.selectedIndex = this.selectedId ? (this.indexById.get(this.selectedId) ?? -1) : -1;
    this.rebuild();
  }

  /** Switch maps: only the projection changes, so reproject and rebuild. */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.positions = fanOutPositions(this.markers, (x, y) => dataToPoint(this.map, x, y));
    // Icon URLs may be map-dependent (`markerIconUrl(icon, map)`).
    this.entries = new Array<PinEntry | null | undefined>(this.markers.length);
    this.rebuild();
  }

  /**
   * Select a marker (or none). Selection changes a pin's appearance (scale 1.2 +
   * baked shadow), its draw order (on top of everything) and its visibility
   * (selection bypasses every filter), so only the two affected entries are
   * invalidated and the buffers are rebuilt.
   */
  setSelected(markerId: string | null): void {
    if (this.disposed || markerId === this.selectedId) return;
    const previous = this.selectedIndex;
    this.selectedId = markerId;
    this.selectedIndex = markerId ? (this.indexById.get(markerId) ?? -1) : -1;
    if (previous >= 0) this.entries[previous] = undefined;
    if (this.selectedIndex >= 0) this.entries[this.selectedIndex] = undefined;
    this.rebuild();
  }

  get selected(): string | null {
    return this.selectedId;
  }

  /**
   * Update the visibility inputs. Omitted keys are cleared, not merged — the
   * React layer passes the full set every time, and a silent merge would make
   * "the app cleared its subtype filter" indistinguishable from "the app did not
   * mention it".
   */
  setVisibility(visibility: MarkerVisibility): void {
    if (this.disposed) return;
    this.visibleSubtypes = visibility.visibleSubtypes;
    this.forceShowIds = visibility.forceShowIds;
    this.lodEnabled = !!visibility.lodEnabled;
    this.lastTier = visibleTierForZoom(this.camera.zoom);
    this.rebuild();
  }

  // ------------------------------------------------------------ inspection ---

  /** Markers currently drawn. */
  get visibleMarkerCount(): number {
    return this.visibleCount;
  }

  /** Ids of the markers currently drawn (diagnostics/tests). */
  visibleMarkerIds(): string[] {
    const out: string[] = [];
    for (let k = 0; k < this.visibleCount; k++) out.push(this.markers[this.visibleIdx[k]].id);
    return out;
  }

  /**
   * The marker's RENDERED position in map-pixel space — i.e. including the
   * fan-out nudge, which is what the popup/tooltip must anchor to.
   */
  positionOf(markerId: string): Point | null {
    const i = this.indexById.get(markerId);
    if (i === undefined) return null;
    const p = this.positions[i];
    return p ? { x: p.x, y: p.y } : null;
  }

  /**
   * The topmost marker whose sprite covers `screenPt` (CSS pixels from the
   * canvas' top-left), or null.
   *
   * Hit rects are the pin's CONTENT box in screen pixels — 40px (or the scaled
   * icon), grown by 1.2 for the selected marker, and excluding the transparent
   * padding the baked drop-shadow needs. Because sprites are screen-constant the
   * rect is zoom-independent; only its centre moves.
   *
   * Preference order: the selected marker (its popup is open, so it must stay
   * clickable under overlapping neighbours — Leaflet lifts it with
   * `zIndexOffset: 1000`), then the candidate whose centre is nearest the point,
   * ties going to the later marker (drawn on top).
   */
  hitTest(screenPt: Point): string | null {
    if (this.disposed || this.visibleCount === 0) return null;
    const scale = this.camera.scale();
    const centre = this.camera.center;
    const halfW = this.camera.viewportWidth / 2;
    const halfH = this.camera.viewportHeight / 2;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visibleIdx[k];
      const entry = this.entries[i];
      if (!entry) continue;
      const position = this.positions[i];
      if (!position) continue;
      const sx = (position.x - centre.x) * scale + halfW;
      const sy = (position.y - centre.y) * scale + halfH;
      const dx = screenPt.x - sx;
      const dy = screenPt.y - sy;
      const half = entry.hitSize / 2;
      if (dx < -half || dx > half || dy < -half || dy > half) continue;
      if (i === this.selectedIndex) return this.markers[i].id;
      const distance = dx * dx + dy * dy;
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best >= 0 ? this.markers[best].id : null;
  }

  // -------------------------------------------------------------- rendering ---

  /**
   * Per-frame work: push the current scale to every batch (that is what keeps
   * sprites screen-constant) and, when LOD is on, rebuild if the zoom crossed a
   * tier threshold. O(pages) in the common case — never O(markers).
   */
  update(camera: Camera): void {
    if (this.disposed) return;
    if (this.lodEnabled) {
      const tier = visibleTierForZoom(camera.zoom);
      if (tier !== this.lastTier) {
        this.lastTier = tier;
        this.rebuild();
      }
    }
    const scale = camera.scale();
    for (const batch of this.batchList) batch.material.uniforms.uScale.value = scale;
    if (this.selectedBatch) this.selectedBatch.material.uniforms.uScale.value = scale;
  }

  /** Recompute the visible set and refill the instance buffers. */
  private rebuild(): void {
    if (this.disposed) return;
    const ctx: VisibilityContext = {
      selectedId: this.selectedId,
      forceShowIds: this.forceShowIds,
      visibleSubtypes: this.visibleSubtypes,
      lodEnabled: this.lodEnabled,
      visibleTier: this.lastTier,
    };
    this.visibleCount = 0;
    for (let i = 0; i < this.markers.length; i++) {
      if (!isMarkerVisible(this.markers[i], ctx)) continue;
      this.visibleIdx[this.visibleCount++] = i;
    }

    for (const batch of this.batchList) batch.count = 0;
    if (this.selectedBatch) this.selectedBatch.count = 0;

    for (let k = 0; k < this.visibleCount; k++) {
      const i = this.visibleIdx[k];
      const entry = this.entryFor(i);
      if (!entry) continue;
      const position = this.positions[i];
      if (!position) continue;
      const batch =
        i === this.selectedIndex
          ? this.ensureSelectedBatch(entry.page)
          : this.ensureBatch(entry.page);
      if (!batch) continue;
      pushInstance(batch, position.x, position.y, entry);
    }

    for (const batch of this.batchList) finishBatch(batch);
    if (this.selectedBatch) finishBatch(this.selectedBatch);
    this.invalidate();
  }

  /** Resolve (and cache) a marker's atlas entry. */
  private entryFor(index: number): PinEntry | null {
    const cached = this.entries[index];
    if (cached !== undefined) return cached;
    const marker = this.markers[index];
    const spec = resolvePinSpec(marker, {
      resolveIconUrl: (rawIcon) => this.assets.markerIconUrl(rawIcon, this.map),
      selected: index === this.selectedIndex,
      theme: this.theme,
    });
    const entry = this.atlas.get(spec);
    this.entries[index] = entry;
    return entry;
  }

  private ensureBatch(page: number): Batch | null {
    const existing = this.batches.get(page);
    if (existing) return existing;
    const texture = this.atlas.pageTexture(page);
    if (!texture) return null;
    const batch = createBatch(page, texture, 0);
    this.batches.set(page, batch);
    this.batchList.push(batch);
    this.object3D.add(batch.mesh);
    return batch;
  }

  /**
   * The selected marker gets its own single-instance batch so it can draw above
   * every page batch regardless of which page its bitmap landed on.
   */
  private ensureSelectedBatch(page: number): Batch | null {
    const texture = this.atlas.pageTexture(page);
    if (!texture) return null;
    if (!this.selectedBatch) {
      this.selectedBatch = createBatch(page, texture, SELECTED_RENDER_ORDER);
      this.object3D.add(this.selectedBatch.mesh);
    } else if (this.selectedBatch.page !== page) {
      this.selectedBatch.page = page;
      this.selectedBatch.material.uniforms.uMap.value = texture;
    }
    return this.selectedBatch;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeAtlas();
    this.object3D.clear();
    for (const batch of this.batchList) disposeBatch(batch);
    this.batchList.length = 0;
    this.batches.clear();
    if (this.selectedBatch) {
      disposeBatch(this.selectedBatch);
      this.selectedBatch = null;
    }
    this.markers = [];
    this.positions = [];
    this.entries = [];
    this.indexById.clear();
    this.visibleCount = 0;
    if (this.ownsAtlas) this.atlas.dispose();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
