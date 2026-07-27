import type { PixelBounds, Point } from "./types.ts";

/**
 * Framework-free 2D map camera: the single source of truth for view state
 * (`centerPx` + fractional `zoom`) and for every screen↔pixel projection.
 *
 * Zoom semantics are Leaflet's so both engines agree on stored/restored views:
 * `scale = 2^zoom`, so at `zoom = 0` one map pixel is one CSS pixel and the
 * app's `[MIN_ZOOM, MAX_ZOOM] = [-3, 2]` keeps its meaning.
 *
 * Both spaces are **y-down**: map pixel space matches the tile grid (0,0 =
 * top-left) and screen space is CSS pixels from the canvas' top-left corner.
 * There is no flip anywhere — see `coords.ts` for why this differs from the
 * Leaflet engine.
 *
 * Every number crossing this boundary is normalized: the map extent and the
 * initial view come from HTTP-fetched `GameMapMeta`, the viewport from element
 * measurement, and `tick` from a caller-supplied clock — one stray NaN must not
 * be able to strand the camera or start an endless animation.
 *
 * No DOM, no three.js: this file must stay portable to a WeChat mini-program
 * canvas. Callers drive animation by calling {@link Camera.tick} from rAF.
 */

export interface CameraOptions {
  /** Pixel width of the full tile grid (`mapWidthOf(map)`). */
  mapWidthPx: number;
  /** Pixel height of the full tile grid (`mapHeightOf(map)`). */
  mapHeightPx: number;
  minZoom: number;
  maxZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Initial view; defaults to the map centre at `minZoom`. */
  center?: Point;
  zoom?: number;
}

/**
 * `change` fires on every view mutation that actually changed something
 * (including animation ticks), `flyend` once when a {@link Camera.flyTo}
 * animation completes (not when it is cancelled), `gestureend` only when the
 * gesture layer calls {@link Camera.emitGestureEnd} — the camera itself knows
 * nothing about input.
 */
export type CameraEventName = "change" | "gestureend" | "flyend";

export type CameraListener = () => void;

interface FlyAnimation {
  fromCenter: Point;
  fromZoom: number;
  toCenter: Point;
  toZoom: number;
  durationMs: number;
  /** Set on the first tick so `flyTo` needs no clock of its own. */
  startMs: number | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Sizes (map extent, viewport) must be finite and non-negative. */
function sizeOr(v: number, fallback: number): number {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Same easing as the Leaflet engine's fly feel: slow-in, fast, slow-out. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class Camera {
  private centerPx: Point;
  private zoomLevel: number;
  private mapW: number;
  private mapH: number;
  private minZoomLevel: number;
  private maxZoomLevel: number;
  private vw: number;
  private vh: number;
  private anim: FlyAnimation | null = null;
  private listeners: Record<CameraEventName, Set<CameraListener>> = {
    change: new Set(),
    gestureend: new Set(),
    flyend: new Set(),
  };

  constructor(opts: CameraOptions) {
    // A broken map extent degenerates to 0 (centre pinned at the origin) rather
    // than poisoning every projection with NaN.
    this.mapW = sizeOr(opts.mapWidthPx, 0);
    this.mapH = sizeOr(opts.mapHeightPx, 0);
    // Keep `minZoom <= maxZoom` whatever the caller passed, else clampZoom would
    // happily report a zoom outside the range.
    const zoomA = finiteOr(opts.minZoom, 0);
    const zoomB = finiteOr(opts.maxZoom, 0);
    this.minZoomLevel = Math.min(zoomA, zoomB);
    this.maxZoomLevel = Math.max(zoomA, zoomB);
    this.vw = sizeOr(opts.viewportWidth, 0);
    this.vh = sizeOr(opts.viewportHeight, 0);
    this.zoomLevel = this.clampZoom(opts.zoom ?? this.minZoomLevel);
    this.centerPx = this.clampCenter(
      opts.center ?? { x: this.mapW / 2, y: this.mapH / 2 },
    );
  }

  // ---------------------------------------------------------------- state ---

  get center(): Point {
    return { x: this.centerPx.x, y: this.centerPx.y };
  }

  get zoom(): number {
    return this.zoomLevel;
  }

  get minZoom(): number {
    return this.minZoomLevel;
  }

  get maxZoom(): number {
    return this.maxZoomLevel;
  }

  get viewportWidth(): number {
    return this.vw;
  }

  get viewportHeight(): number {
    return this.vh;
  }

  /** Screen pixels per map pixel. */
  scale(): number {
    return Math.pow(2, this.zoomLevel);
  }

  /**
   * Resize the viewport; non-finite/negative sizes are ignored, and an unchanged
   * size is a no-op (no event). The centre clamp is viewport-independent, so the
   * centre never moves here — only the projection changes.
   */
  setViewport(width: number, height: number): void {
    const w = sizeOr(width, this.vw);
    const h = sizeOr(height, this.vh);
    if (w === this.vw && h === this.vh) return;
    this.vw = w;
    this.vh = h;
    this.emit("change");
  }

  // ----------------------------------------------------------- projection ---

  /** Map pixel → screen CSS pixel (canvas top-left origin, y down). */
  pixelToScreen(px: number, py: number): Point {
    const s = this.scale();
    return {
      x: (px - this.centerPx.x) * s + this.vw / 2,
      y: (py - this.centerPx.y) * s + this.vh / 2,
    };
  }

  /** Screen CSS pixel → map pixel. Inverse of {@link pixelToScreen}. */
  screenToPixel(sx: number, sy: number): Point {
    const s = this.scale();
    return {
      x: (sx - this.vw / 2) / s + this.centerPx.x,
      y: (sy - this.vh / 2) / s + this.centerPx.y,
    };
  }

  /**
   * The map-pixel rectangle currently on screen, grown by `padPx` **map pixels**
   * on every side (tile layer: one tile width; DOM culling: a fraction of the
   * viewport, converted through {@link scale}). y is down, so `minY` is the top
   * edge.
   *
   * NOT clipped to the map rectangle — with overpan (and at min zoom) it happily
   * reports coordinates outside the grid. Callers reject out-of-grid indices
   * themselves, which is what keeps `assets.tileUrl` from being asked for tiles
   * that do not exist.
   */
  visibleBounds(padPx = 0): PixelBounds {
    const s = this.scale();
    const pad = finiteOr(padPx, 0);
    const hw = this.vw / 2 / s + pad;
    const hh = this.vh / 2 / s + pad;
    return {
      minX: this.centerPx.x - hw,
      minY: this.centerPx.y - hh,
      maxX: this.centerPx.x + hw,
      maxY: this.centerPx.y + hh,
    };
  }

  /**
   * The (clamped) zoom at which a `widthPx × heightPx` map-pixel extent just
   * fits the current viewport — for "fit to these markers" / "fit the whole map"
   * initial views, which only the camera can compute (it owns the viewport and
   * the zoom range). A zero-size extent (a single point) has no meaningful fit
   * and returns {@link maxZoom}; a zero-size viewport returns {@link minZoom}.
   */
  zoomToFit(widthPx: number, heightPx: number): number {
    const sx = widthPx > 0 ? this.vw / widthPx : Number.POSITIVE_INFINITY;
    const sy = heightPx > 0 ? this.vh / heightPx : Number.POSITIVE_INFINITY;
    const s = Math.min(sx, sy);
    if (!Number.isFinite(s)) return this.maxZoomLevel;
    if (s <= 0) return this.minZoomLevel;
    return this.clampZoom(Math.log2(s));
  }

  // -------------------------------------------------------------- clamping ---

  private clampZoom(z: number): number {
    if (!Number.isFinite(z)) return this.minZoomLevel;
    return clamp(z, this.minZoomLevel, this.maxZoomLevel);
  }

  /**
   * Keep the centre inside the map rectangle.
   *
   * Consequence (deliberate): a map edge can never travel past the middle of
   * the viewport, so at most half a viewport of empty background shows on any
   * side. That is roughly Leaflet's default feel — free panning with the map
   * never flung off-screen — without the hard "map must fill the viewport"
   * clamp, which would fight the min-zoom (whole-map) view where the map is
   * intentionally smaller than the viewport. Being viewport-independent also
   * means a resize never yanks the centre.
   */
  private clampCenter(c: Point): Point {
    return {
      x: Number.isFinite(c.x) ? clamp(c.x, 0, this.mapW) : this.mapW / 2,
      y: Number.isFinite(c.y) ? clamp(c.y, 0, this.mapH) : this.mapH / 2,
    };
  }

  // -------------------------------------------------------------- mutators ---

  /**
   * Set centre + zoom (clamped) and cancel any running fly animation — user
   * intent always wins over an in-flight camera move.
   */
  setView(center: Point, zoom: number): void {
    this.anim = null;
    this.applyView(center, zoom);
  }

  /**
   * Mutation path shared with {@link tick}, which must not cancel itself.
   * Silent when the clamped result equals the current view: `change` drives GL
   * repaints, and wheeling at max zoom or dragging against the clamp would
   * otherwise repaint the whole scene with nothing to show for it.
   */
  private applyView(center: Point, zoom: number): void {
    const z = this.clampZoom(zoom);
    const c = this.clampCenter(center);
    if (z === this.zoomLevel && c.x === this.centerPx.x && c.y === this.centerPx.y) {
      return;
    }
    this.zoomLevel = z;
    this.centerPx = c;
    this.emit("change");
  }

  /**
   * Move the CENTRE by a screen-space delta converted to map pixels
   * (`delta / scale`). Mind the sign: as in Leaflet's `panBy` the delta is the
   * centre's movement, so a drag handler passes the negated pointer delta —
   * dragging the map right moves the centre left.
   *
   * The centre clamp makes this lossy: from `center.x = 10`, `panBy(-500, 0)`
   * then `panBy(500, 0)` lands at 500, not 10. A gesture that wants
   * rubber-band-to-origin behaviour must therefore drive {@link setView} from a
   * view captured at gesture start rather than accumulate deltas.
   */
  panBy(dxCenterScreen: number, dyCenterScreen: number): void {
    const s = this.scale();
    this.setView(
      {
        x: this.centerPx.x + dxCenterScreen / s,
        y: this.centerPx.y + dyCenterScreen / s,
      },
      this.zoomLevel,
    );
  }

  /**
   * Zoom by `dz` keeping the map point currently under `screenPt` pinned there
   * (wheel-toward-cursor, pinch-toward-midpoint, double-click-toward-pointer).
   * Near the map edge the centre clamp wins and the anchor drifts — that is the
   * clamp invariant doing its job, not a bug to "fix".
   */
  zoomAround(screenPt: Point, dz: number): void {
    const anchorPx = this.screenToPixel(screenPt.x, screenPt.y);
    const nextZoom = this.clampZoom(this.zoomLevel + dz);
    const s = Math.pow(2, nextZoom);
    this.setView(
      {
        x: anchorPx.x - (screenPt.x - this.vw / 2) / s,
        y: anchorPx.y - (screenPt.y - this.vh / 2) / s,
      },
      nextZoom,
    );
  }

  // ------------------------------------------------------------- animation ---

  /**
   * Ease to `targetPx`/`targetZoom` over `seconds`. The target is clamped up
   * front so the animation lands on exactly the value {@link center}/{@link zoom}
   * will report. A non-positive or non-finite `seconds` applies the view
   * immediately (emitting `change` if it moved, then `flyend`) — an infinite
   * duration would otherwise leave {@link tick} asking for frames forever, which
   * breaks the engine's render-on-demand contract. Progress is driven by
   * {@link tick}.
   */
  flyTo(targetPx: Point, targetZoom: number, seconds: number): void {
    const toZoom = this.clampZoom(targetZoom);
    const toCenter = this.clampCenter(targetPx);

    if (!(seconds > 0) || !Number.isFinite(seconds)) {
      this.anim = null;
      this.applyView(toCenter, toZoom);
      this.emit("flyend");
      return;
    }
    this.anim = {
      fromCenter: this.center,
      fromZoom: this.zoomLevel,
      toCenter,
      toZoom,
      durationMs: seconds * 1000,
      startMs: null,
    };
  }

  /** Whether a fly animation is in progress. */
  isAnimating(): boolean {
    return this.anim !== null;
  }

  /**
   * Drop any in-flight animation (call on the first user gesture). Emits
   * nothing — the view stays where the animation left it. Returns whether an
   * animation was actually cancelled.
   */
  cancelAnimation(): boolean {
    if (!this.anim) return false;
    this.anim = null;
    return true;
  }

  /**
   * Advance the animation to `nowMs`, which must come from the same monotonic
   * clock on every call — pass the rAF timestamp (equivalently
   * `performance.now()`), never mixed with `Date.now()`, since the first tick
   * captures the animation's start time from whatever it is handed. Non-finite
   * values are ignored (the animation stays pending).
   *
   * Returns `true` while an animation is still running, so the caller can decide
   * whether to schedule another frame.
   */
  tick(nowMs: number): boolean {
    const a = this.anim;
    if (!a) return false;
    if (!Number.isFinite(nowMs)) return true;
    if (a.startMs === null) a.startMs = nowMs;
    const raw = (nowMs - a.startMs) / a.durationMs;
    if (raw >= 1) {
      this.anim = null;
      this.applyView(a.toCenter, a.toZoom);
      this.emit("flyend");
      return false;
    }
    const t = easeInOutCubic(raw > 0 ? raw : 0);
    this.applyView(
      {
        x: a.fromCenter.x + (a.toCenter.x - a.fromCenter.x) * t,
        y: a.fromCenter.y + (a.toCenter.y - a.fromCenter.y) * t,
      },
      a.fromZoom + (a.toZoom - a.fromZoom) * t,
    );
    return true;
  }

  // ---------------------------------------------------------------- events ---

  on(event: CameraEventName, fn: CameraListener): void {
    this.listeners[event].add(fn);
  }

  off(event: CameraEventName, fn: CameraListener): void {
    this.listeners[event].delete(fn);
  }

  /**
   * Drop every subscription. Teardown insurance for the React layer: a
   * subscription leaked across a StrictMode remount would keep repainting a
   * disposed renderer.
   */
  removeAllListeners(): void {
    for (const set of Object.values(this.listeners)) set.clear();
  }

  /** Called by the gesture layer once a drag/pinch/wheel burst has settled. */
  emitGestureEnd(): void {
    this.emit("gestureend");
  }

  private emit(event: CameraEventName): void {
    // `change` fires per animation frame and per pointermove, so skip both the
    // work and the defensive copy when there is nothing to copy. A single
    // listener needs no copy either: deleting during Set iteration is safe.
    const set = this.listeners[event];
    if (set.size === 0) return;
    if (set.size === 1) {
      for (const fn of set) fn();
      return;
    }
    for (const fn of [...set]) fn();
  }
}
