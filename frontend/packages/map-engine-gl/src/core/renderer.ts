import { Group, OrthographicCamera, Scene, WebGLRenderer } from "three";
import type { Object3D } from "three";
import type { Camera } from "./camera.ts";

/**
 * The three.js side of the engine: one scene, one orthographic camera derived
 * from the framework-free {@link Camera}, and a render-on-demand scheduler.
 *
 * ## Render-on-demand (binding requirement)
 * There is no continuous loop. A frame is requested only when something is
 * dirty — a camera `change`, a texture arrival, a layer mutation, a resize — and
 * while {@link Camera.isAnimating} the loop drives {@link Camera.tick} itself.
 * When nothing is dirty and nothing is animating, NOTHING is scheduled: an idle
 * map costs 0 fps. Every entry point that changes what the next frame would look
 * like must therefore call {@link MapRenderer.invalidate}.
 *
 * ## Y-DOWN — realised in the PROJECTION, once
 * The scene works directly in map-pixel space (the tile grid's space: (0,0) is
 * the top-left corner, y increases DOWNWARD, one scene unit = one map pixel).
 * That is the opposite of three.js' y-up convention, and it is realised by
 * building the orthographic frustum upside down (`top = centre - halfHeight`,
 * `bottom = centre + halfHeight`) — see {@link MapRenderer.syncProjection}.
 *
 * Why the projection and not `scale.y = -1` on a scene root group:
 * - Layers place objects at raw map-pixel coordinates and keep positive scales,
 *   so no layer needs a compensating per-object flip (plan decision §2).
 * - `THREE.Sprite` reads its size as `length(modelMatrix[0..1])`, i.e. it
 *   IGNORES the sign of a negative parent scale. Under a `scale.y = -1` root a
 *   sprite would therefore be the one thing in the scene NOT flipped —
 *   silently mirrored relative to every mesh around it. The projection applies
 *   to sprites, meshes, fat lines and text alike, so there is exactly one rule
 *   to remember.
 *
 * Two consequences, which are the LAYER CONTRACT for tasks 4 and 5:
 * 1. **Textures must set `flipY = false`** (`configureTileTexture` /
 *    `CanvasTexture` alike). An image's first data row is its TOP row; with
 *    `flipY = false` that row lands at the smaller-y (upper) edge of the quad,
 *    which the flipped projection puts at the top of the screen. Leaving the
 *    three.js default (`flipY = true`) renders every texture vertically
 *    mirrored.
 * 2. **Materials must not cull back faces** (`side: DoubleSide`). Mirroring the
 *    projection reverses screen-space winding, and three only compensates
 *    culling for a negative `matrixWorld` determinant (`frontFaceCW`), not for
 *    the projection — front faces would otherwise be culled and the scene would
 *    render empty. Flat 2D quads gain nothing from culling anyway.
 *
 * ## Portability
 * No DOM globals: the canvas, the frame source, the clock, the device pixel
 * ratio and even the GL backend arrive through options (browser defaults
 * provided), so a WeChat mini-program can supply its own canvas object and a
 * backend built from it.
 */

/** Draw order buckets, low renders first. See {@link RenderLayer.order}. */
export const LayerOrder = {
  tiles: 0,
  watermark: 10,
  vectors: 20,
  markers: 30,
} as const;

/**
 * A scene layer. Layers own their three.js objects and their disposal.
 *
 * Contract:
 * - `object3D` is attached to the renderer's scene root by
 *   {@link MapRenderer.addLayer}. Prefer a `THREE.Group`: three.js uses a
 *   group's `renderOrder` as the *group order* of everything below it, so one
 *   number sorts a whole layer against the others. The renderer assigns
 *   `object3D.renderOrder = order ?? 0` on attach — do not set it yourself.
 * - `update(camera)` runs immediately before every render, after the projection
 *   has been synced. This is where a layer rebuilds camera-dependent content
 *   (visible tiles, culled sprites). It may call the renderer's `invalidate`
 *   (injected into the layer by its owner) to ask for a follow-up frame; that is
 *   how throttled work spreads over frames without a continuous loop.
 * - `dispose()` releases geometries, materials and textures. The renderer calls
 *   it for every still-attached layer in {@link MapRenderer.dispose};
 *   {@link MapRenderer.removeLayer} does NOT (a caller pulling a layer out keeps
 *   ownership).
 * - Materials: `side: DoubleSide` and textures with `flipY = false` — see the
 *   y-down note above. Keep them `transparent: true` as well (all current layers
 *   are): three renders the whole opaque list before the transparent one, so an
 *   opaque marker material would draw UNDER the transparent tiles no matter what
 *   its group order says.
 */
export interface RenderLayer {
  readonly object3D: Object3D;
  /** Draw-order bucket; lower renders first. Defaults to 0. */
  readonly order?: number;
  update?(camera: Camera): void;
  dispose(): void;
}

/**
 * The slice of `THREE.WebGLRenderer` this engine uses. Injectable so tests (and
 * a future non-WebGL host) can drive the scheduler and the layers without a GL
 * context — `WebGLRenderer` satisfies it structurally.
 */
export interface RenderBackend {
  setPixelRatio(dpr: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: OrthographicCamera): void;
  dispose(): void;
}

/**
 * The slice of a canvas the renderer needs: a size to write and (optionally) a
 * window to read `devicePixelRatio` from. `HTMLCanvasElement` satisfies it.
 */
export interface RendererCanvas {
  width: number;
  height: number;
  ownerDocument?: { defaultView?: { devicePixelRatio?: number } | null } | null;
}

export interface MapRendererOptions {
  /** The view-state source of truth. The renderer subscribes to its `change`. */
  camera: Camera;
  /**
   * Canvas to render into. Required unless {@link createBackend} is supplied
   * (the default backend is a `WebGLRenderer` bound to this canvas).
   */
  canvas?: RendererCanvas;
  /** Backend factory; defaults to `new WebGLRenderer({canvas, alpha, antialias})`. */
  createBackend?: (canvas: RendererCanvas | undefined) => RenderBackend;
  /**
   * CSS-pixel viewport. Defaults to the camera's current viewport, which the
   * React layer measures before constructing the renderer.
   */
  width?: number;
  height?: number;
  /** Overrides the DPR read from the canvas' window. */
  devicePixelRatio?: number;
  /** DPR cap; 2 is plenty for map tiles and halves the fill cost on 3x phones. */
  maxPixelRatio?: number;
  /**
   * Schedules one frame, returns a cancellation handle. The callback takes no
   * timestamp on purpose: the clock is {@link MapRendererOptions.now}, which
   * must be the same clock the gesture layer and `camera.tick` use.
   */
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
  /**
   * Optional size source (a `ResizeObserver` in the browser, wired by the React
   * layer). Called once with a callback; the returned function is invoked on
   * {@link MapRenderer.dispose}.
   */
  observeSize?: (onResize: (width: number, height: number) => void) => () => void;
}

const DEFAULT_MAX_PIXEL_RATIO = 2;

function defaultRequestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  // No frame source: nothing renders. Such a host must inject `requestFrame`.
  return 0;
}

function defaultCancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** DPR from the canvas' own window — the `window` global is never touched. */
function canvasPixelRatio(canvas: RendererCanvas | undefined): number {
  const dpr = canvas?.ownerDocument?.defaultView?.devicePixelRatio;
  return typeof dpr === "number" && dpr > 0 ? dpr : 1;
}

function sizeOr(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export class MapRenderer {
  private readonly camera: Camera;
  private readonly backend: RenderBackend;
  private readonly requestFrame: (cb: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly maxPixelRatio: number;
  private readonly unobserveSize: (() => void) | null = null;

  private readonly threeScene = new Scene();
  /**
   * Everything renderable hangs off this group, so a full teardown is one
   * `clear()` and future non-layer decorations stay separable. Nesting is free:
   * three re-reads the group order at every group it descends into, so a
   * layer's own group order still wins over this root's.
   */
  private readonly root = new Group();
  private readonly projection = new OrthographicCamera();

  private layers: RenderLayer[] = [];
  private width: number;
  private height: number;
  private pixelRatio: number;
  private dirty = true;
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(opts: MapRendererOptions) {
    this.camera = opts.camera;
    this.requestFrame = opts.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = opts.cancelFrame ?? defaultCancelFrame;
    this.now = opts.now ?? defaultNow;
    this.maxPixelRatio = sizeOr(opts.maxPixelRatio, DEFAULT_MAX_PIXEL_RATIO);
    this.backend = opts.createBackend
      ? opts.createBackend(opts.canvas)
      : createWebGLBackend(opts.canvas);

    this.threeScene.add(this.root);

    this.width = sizeOr(opts.width, this.camera.viewportWidth);
    this.height = sizeOr(opts.height, this.camera.viewportHeight);
    this.pixelRatio = Math.min(
      sizeOr(opts.devicePixelRatio, canvasPixelRatio(opts.canvas)) || 1,
      this.maxPixelRatio,
    );
    this.backend.setPixelRatio(this.pixelRatio);
    // `updateStyle: false`: the host sizes the canvas element (CSS `100%` in the
    // React layer), the backend only owns the drawing buffer. Also keeps the
    // backend usable with a canvas object that has no `style` at all (weapp).
    this.backend.setSize(this.width, this.height, false);
    this.camera.setViewport(this.width, this.height);

    this.camera.on("change", this.onCameraChange);
    if (opts.observeSize) {
      this.unobserveSize = opts.observeSize((w, h) => {
        this.setSize(w, h);
      });
    }
    // One frame to paint the initial view; after it runs the loop goes quiet.
    this.scheduleFrame();
  }

  // ---------------------------------------------------------------- layers ---

  /**
   * Attach a layer. Layers are kept sorted by {@link RenderLayer.order} (stable
   * for equal orders: first attached renders first) and their `renderOrder` is
   * assigned from it, so draw order is fully controlled by the order values in
   * {@link LayerOrder}.
   */
  addLayer(layer: RenderLayer): void {
    if (this.disposed || this.layers.includes(layer)) return;
    layer.object3D.renderOrder = layer.order ?? 0;
    this.layers.push(layer);
    this.layers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.root.clear();
    for (const l of this.layers) this.root.add(l.object3D);
    this.invalidate();
  }

  /** Detach without disposing — the caller keeps ownership of the layer. */
  removeLayer(layer: RenderLayer): void {
    const i = this.layers.indexOf(layer);
    if (i < 0) return;
    this.layers.splice(i, 1);
    this.root.remove(layer.object3D);
    this.invalidate();
  }

  /** The scene root, for tests and for layers that need a parent reference. */
  get sceneRoot(): Group {
    return this.root;
  }

  /** The scene actually rendered (root + future non-layer decorations). */
  get scene(): Scene {
    return this.threeScene;
  }

  /** The projection camera, resynced from the {@link Camera} before each render. */
  get projectionCamera(): OrthographicCamera {
    return this.projection;
  }

  // ------------------------------------------------------------- scheduling ---

  /**
   * Mark the scene dirty and ensure exactly one frame is pending. Cheap and
   * idempotent — call it from every mutation (texture arrival, marker set
   * change, theme change); coalescing is this method's job, not the caller's.
   */
  invalidate(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.scheduleFrame();
  }

  /** Whether a frame is pending. Idle must mean `false` (render-on-demand). */
  isFramePending(): boolean {
    return this.frameHandle !== null;
  }

  private scheduleFrame(): void {
    if (this.disposed || this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(this.onFrame);
  }

  private readonly onCameraChange = (): void => {
    this.invalidate();
  };

  private readonly onFrame = (): void => {
    this.frameHandle = null;
    if (this.disposed) return;

    // The animation loop lives here rather than in the camera so that a fly and
    // a repaint share one frame. `tick` emits `change` → `invalidate()` → dirty,
    // and the follow-up frame is requested explicitly because the last tick of
    // an animation may produce no movement at all.
    if (this.camera.isAnimating()) {
      this.camera.tick(this.now());
      if (this.camera.isAnimating()) this.scheduleFrame();
    }

    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  };

  /**
   * Render immediately, bypassing the scheduler (mount, and tests). Layers'
   * `update` may call {@link invalidate}, which then schedules a follow-up
   * frame — that is intended, it is how throttled tile loading progresses.
   */
  render(): void {
    if (this.disposed) return;
    this.dirty = false;
    this.draw();
  }

  private draw(): void {
    this.syncProjection();
    for (const layer of this.layers) layer.update?.(this.camera);
    this.backend.render(this.threeScene, this.projection);
  }

  /**
   * Rebuild the orthographic frustum from the camera's centre/zoom/viewport.
   *
   * Half-extents are viewport CSS pixels divided by `scale = 2^zoom`, so one map
   * pixel is exactly `scale` CSS pixels — the same relation
   * {@link Camera.pixelToScreen} uses, which is what keeps DOM overlay
   * projection and GL rendering pixel-identical. The viewport is read from the
   * CAMERA, not from this renderer's copy, so the two can never drift apart even
   * if someone resizes the camera directly.
   *
   * `top`/`bottom` are SWAPPED on purpose: that single sign flip is the whole
   * y-down mechanism (see the file header). Depth range is generous and
   * symmetric so layers may use small z offsets freely.
   */
  private syncProjection(): void {
    const scale = this.camera.scale();
    const centre = this.camera.center;
    const halfW = this.camera.viewportWidth / 2 / scale;
    const halfH = this.camera.viewportHeight / 2 / scale;
    this.projection.left = -halfW;
    this.projection.right = halfW;
    this.projection.top = -halfH;
    this.projection.bottom = halfH;
    this.projection.near = -1000;
    this.projection.far = 1000;
    this.projection.position.set(centre.x, centre.y, 0);
    this.projection.updateProjectionMatrix();
    this.projection.updateMatrixWorld();
  }

  // ----------------------------------------------------------------- resize ---

  /**
   * Resize the drawing buffer and the camera viewport together (they must never
   * disagree, or the projection stops matching `pixelToScreen`). No-op when
   * nothing changed, so a ResizeObserver firing on every layout pass costs
   * nothing.
   */
  setSize(width: number, height: number, dpr?: number): void {
    if (this.disposed) return;
    const w = sizeOr(width, this.width);
    const h = sizeOr(height, this.height);
    const ratio = Math.min(sizeOr(dpr, this.pixelRatio) || 1, this.maxPixelRatio);
    if (w === this.width && h === this.height && ratio === this.pixelRatio) return;
    this.width = w;
    this.height = h;
    if (ratio !== this.pixelRatio) {
      this.pixelRatio = ratio;
      this.backend.setPixelRatio(ratio);
    }
    this.backend.setSize(w, h, false);
    this.camera.setViewport(w, h);
    this.invalidate();
  }

  get viewportWidth(): number {
    return this.width;
  }

  get viewportHeight(): number {
    return this.height;
  }

  get pixelRatioUsed(): number {
    return this.pixelRatio;
  }

  // ---------------------------------------------------------------- teardown ---

  /**
   * Cancel the pending frame, unsubscribe from the camera and the size source,
   * dispose every still-attached layer and the GL context. Idempotent; every
   * later `invalidate`/`setSize` is a no-op, so a listener that outlives the
   * renderer cannot resurrect the loop.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.camera.off("change", this.onCameraChange);
    this.unobserveSize?.();
    for (const layer of this.layers) layer.dispose();
    this.layers = [];
    this.root.clear();
    this.threeScene.clear();
    this.backend.dispose();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Browser default backend. `alpha: true` lets the app's background show through
 * the canvas (the Leaflet engine styles `.leaflet-container`'s background the
 * same way); `antialias: true` smooths region borders and fat lines.
 */
function createWebGLBackend(canvas: RendererCanvas | undefined): RenderBackend {
  if (!canvas) {
    throw new Error(
      "MapRenderer: either `canvas` or `createBackend` must be provided.",
    );
  }
  return new WebGLRenderer({
    // The structural `RendererCanvas` is what this module needs; the concrete
    // backend needs the real thing. The React layer always passes an
    // `HTMLCanvasElement`; a non-DOM host injects `createBackend` instead.
    canvas: canvas as unknown as HTMLCanvasElement,
    alpha: true,
    antialias: true,
  });
}
