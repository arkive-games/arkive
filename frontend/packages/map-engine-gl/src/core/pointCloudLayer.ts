import {
  BufferAttribute,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from "three";
import type { GameMapMeta } from "@gamemap/data-contract";
import type { Camera } from "./camera.ts";
import { dataToPoint } from "./coords.ts";
import { LayerOrder, type RenderLayer } from "./renderer.ts";
import type { Point } from "./types.ts";

/**
 * Flat discs of constant SCREEN size — the GL counterpart of Leaflet's
 * `CircleMarker`, which palworld's pal-spawn embed uses to draw the game's own
 * habitat point clouds under the spawn pins.
 *
 * Why a layer of its own rather than more pins: a habitat cloud is thousands of
 * points, all identical, carrying no icon, no tooltip and no hit-test. Routing
 * them through {@link MarkerLayer} would mean an atlas entry, a per-point pin
 * bitmap lookup and a hit-test candidate each — for decoration. Here every cloud
 * is ONE instanced draw call whose per-point data is two floats.
 *
 * ## Screen-constant, like the pins
 * `CircleMarker`'s `radius` is a screen-pixel radius that does not grow with
 * zoom, and the vertex shader reproduces that the same way {@link MarkerLayer}
 * does: the unit quad is expanded by `radius / uScale`. `uScale` is
 * `camera.scale()`, i.e. SCREEN pixels per MAP pixel — so dividing a screen-space
 * radius by it yields the map-space size that renders at that screen radius. Get
 * the direction backwards and the discs grow with zoom instead of staying put.
 *
 * ## Stroke and fill in one pass
 * Leaflet draws a `CircleMarker` as an SVG/canvas circle with a stroke and a
 * separate fill opacity. Two draw calls would be wasteful for decoration, so the
 * fragment shader does both: distance from the centre picks the stroke opacity
 * inside the outer band and the fill opacity within, with the outer edge
 * antialiased against the disc boundary. The stroke and the fill share one
 * colour, which is how both palworld clouds are configured.
 */

/** Stroke band as a fraction of the radius — Leaflet's `weight: 1` at `radius: 3`. */
const DEFAULT_STROKE_FRACTION = 1 / 3;
/** Leaflet's `CircleMarker` default-ish fill; the palworld clouds pass 0.45. */
const DEFAULT_FILL_OPACITY = 0.45;
/** `weight: 1` strokes are drawn fully opaque by Leaflet unless told otherwise. */
const DEFAULT_STROKE_OPACITY = 1;

/** One cloud: a colour, a radius, and the DATA-space points to draw it at. */
export interface PointCloud {
  /** Identity for diagnostics and for {@link PointCloudLayer.cloudCount} lookups. */
  id: string;
  /** DATA space, as marker coordinates are — projected with `dataToPoint`. */
  points: readonly (readonly [number, number])[];
  /** Screen-pixel radius, constant across zoom. */
  radius: number;
  /** CSS colour for both stroke and fill. */
  color: string;
  /** Interior alpha. Defaults to {@link DEFAULT_FILL_OPACITY}. */
  fillOpacity?: number;
  /** Outer-band alpha. Defaults to {@link DEFAULT_STROKE_OPACITY}. */
  strokeOpacity?: number;
  /**
   * Stroke width as a fraction of the radius. Defaults to
   * {@link DEFAULT_STROKE_FRACTION}; pass 0 for a fill-only disc.
   */
  strokeFraction?: number;
}

export interface PointCloudLayerOptions {
  /** Projects DATA points; a different map re-projects them. */
  map: GameMapMeta;
  /** Ask the renderer for another frame after a mutation. */
  invalidate: () => void;
  /** Draw order. Default `LayerOrder.points`. */
  order?: number;
}

const QUAD_CORNERS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

/**
 * `position.xy` is the unit quad's corner (±0.5), doubled into `vLocal` so the
 * fragment shader can compare `length(vLocal)` against 1 instead of 0.5.
 */
const POINT_VERTEX = /* glsl */ `
attribute vec2 aCenter;
uniform float uScale;
uniform float uRadius;
varying vec2 vLocal;
void main() {
  vec2 corner = position.xy;
  vLocal = corner * 2.0;
  vec2 mapPos = aCenter + corner * (2.0 * uRadius / uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mapPos, 0.0, 1.0);
}
`;

/**
 * `fwidth` gives the disc edge one pixel of antialiasing regardless of zoom;
 * three targets WebGL2, where derivatives need no extension. The stroke band is
 * NOT antialiased against the fill on purpose — the two differ only in alpha, so
 * a hard boundary is invisible at these radii and one `step` is cheaper.
 */
const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uFillOpacity;
uniform float uStrokeOpacity;
uniform float uStrokeFraction;
varying vec2 vLocal;
void main() {
  float d = length(vLocal);
  float aa = fwidth(d);
  float coverage = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (coverage <= 0.0) discard;
  float band = 1.0 - uStrokeFraction;
  float alpha = mix(uFillOpacity, uStrokeOpacity, step(band, d));
  gl_FragColor = vec4(uColor, alpha * coverage);
  #include <colorspace_fragment>
}
`;

interface Batch {
  id: string;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh;
  count: number;
}

export class PointCloudLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private map: GameMapMeta;
  private readonly invalidate: () => void;
  private clouds: PointCloud[] = [];
  private batches: Batch[] = [];
  private viewScale = -1;
  private disposed = false;

  constructor(opts: PointCloudLayerOptions) {
    this.map = opts.map;
    this.invalidate = opts.invalidate;
    this.order = opts.order ?? LayerOrder.points;
    this.object3D.name = "point-clouds";
  }

  /**
   * Replace every cloud. Geometry is rebuilt rather than pooled: the host toggles
   * a cloud on or off (or swaps day for night), which is a click, not a frame —
   * whereas pooling would keep a few thousand stale instances alive for the life
   * of the embed.
   */
  setClouds(clouds: readonly PointCloud[]): void {
    if (this.disposed) return;
    this.clouds = clouds.map((cloud) => ({ ...cloud, points: [...cloud.points] }));
    this.rebuild();
    this.invalidate();
  }

  /** Re-project onto another map. */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.rebuild();
    this.invalidate();
  }

  private rebuild(): void {
    this.detachBatches();
    // A fresh scale forces `update` to push `uScale` into the new materials even
    // if the camera has not moved since — without this a cloud added mid-view
    // renders once at the default scale of 1.
    this.viewScale = -1;
    for (const cloud of this.clouds) {
      const batch = this.createBatch(cloud);
      if (!batch) continue;
      this.batches.push(batch);
      this.object3D.add(batch.mesh);
    }
  }

  private createBatch(cloud: PointCloud): Batch | null {
    const centers: number[] = [];
    for (const [x, y] of cloud.points) {
      const point = dataToPoint(this.map, x, y);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      centers.push(point.x, point.y);
    }
    const count = centers.length / 2;
    if (count === 0) return null;

    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(QUAD_CORNERS.slice(), 3));
    geometry.setIndex(QUAD_INDEX.slice());
    const aCenter = new InstancedBufferAttribute(new Float32Array(centers), 2);
    aCenter.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aCenter", aCenter);
    geometry.instanceCount = count;

    const material = new ShaderMaterial({
      uniforms: {
        uScale: { value: 1 },
        uRadius: { value: cloud.radius },
        uColor: { value: new Color(cloud.color) },
        uFillOpacity: { value: cloud.fillOpacity ?? DEFAULT_FILL_OPACITY },
        uStrokeOpacity: { value: cloud.strokeOpacity ?? DEFAULT_STROKE_OPACITY },
        uStrokeFraction: { value: cloud.strokeFraction ?? DEFAULT_STROKE_FRACTION },
      },
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      // Renderer layer contract — see `renderer.ts`: transparent so the discs
      // sort with the tiles, no depth (group order decides), no face culling
      // (the y-flipped projection reverses winding).
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    // The vertex shader moves vertices, so three's bounding sphere is wrong, and
    // culling one map-sized draw call would buy nothing anyway.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = this.order;
    return { id: cloud.id, geometry, material, mesh, count };
  }

  private detachBatches(): void {
    for (const batch of this.batches) {
      this.object3D.remove(batch.mesh);
      batch.geometry.dispose();
      batch.material.dispose();
    }
    this.batches = [];
  }

  /** Push the zoom-dependent scale, and only when it actually changed. */
  update(camera: Camera): void {
    if (this.disposed) return;
    const scale = camera.scale();
    if (scale === this.viewScale) return;
    this.viewScale = scale;
    for (const batch of this.batches) batch.material.uniforms.uScale.value = scale;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachBatches();
    this.clouds = [];
    this.object3D.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // --------------------------------------------------- tests / diagnostics ---

  /** How many clouds actually produced geometry. */
  get cloudCount(): number {
    return this.batches.length;
  }

  /** Instances drawn for a cloud id, or 0 when it drew nothing. */
  instanceCountOf(id: string): number {
    return this.batches.find((batch) => batch.id === id)?.count ?? 0;
  }

  /** A cloud's live material (tests assert its uniforms). */
  materialOf(id: string): ShaderMaterial | null {
    return this.batches.find((batch) => batch.id === id)?.material ?? null;
  }

  /** The projected centre of a cloud's instance, in map pixels. */
  centerAt(id: string, index: number): Point | null {
    const batch = this.batches.find((b) => b.id === id);
    if (!batch || index < 0 || index >= batch.count) return null;
    const attr = batch.geometry.getAttribute("aCenter");
    return { x: attr.getX(index), y: attr.getY(index) };
  }
}
