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
 * No DOM, no three.js: this file must stay portable to a WeChat mini-program
 * canvas. Callers drive animation by calling {@link Camera.tick} from rAF.
 */

export interface Point {
  x: number;
  y: number;
}

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
 * `change` fires on every view mutation (including each animation tick),
 * `flyend` once when a {@link Camera.flyTo} animation completes (not when it is
 * cancelled), `gestureend` only when the gesture layer calls
 * {@link Camera.emitGestureEnd} — the camera itself knows nothing about input.
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
    this.mapW = opts.mapWidthPx;
    this.mapH = opts.mapHeightPx;
    this.minZoomLevel = opts.minZoom;
    this.maxZoomLevel = opts.maxZoom;
    this.vw = opts.viewportWidth;
    this.vh = opts.viewportHeight;
    this.zoomLevel = this.clampZoom(opts.zoom ?? opts.minZoom);
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

  /** Resize the viewport; re-clamps the centre (a wider view allows less pan). */
  setViewport(width: number, height: number): void {
    if (width === this.vw && height === this.vh) return;
    this.vw = width;
    this.vh = height;
    this.applyView(this.centerPx, this.zoomLevel);
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
   * intentionally smaller than the viewport.
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

  /** Mutation path shared with {@link tick}, which must not cancel itself. */
  private applyView(center: Point, zoom: number): void {
    this.zoomLevel = this.clampZoom(zoom);
    this.centerPx = this.clampCenter(center);
    this.emit("change");
  }

  /**
   * Move the centre by a screen-space delta converted to map pixels
   * (`delta / scale`). A drag handler passes the negated pointer delta: dragging
   * the map right moves the centre left.
   */
  panBy(dxScreen: number, dyScreen: number): void {
    const s = this.scale();
    this.setView(
      { x: this.centerPx.x + dxScreen / s, y: this.centerPx.y + dyScreen / s },
      this.zoomLevel,
    );
  }

  /**
   * Zoom by `dz` keeping the map point currently under `screenPt` pinned there
   * (wheel-toward-cursor, pinch-toward-midpoint, double-click-toward-pointer).
   * Near the map edge the centre clamp wins, so the anchor may drift.
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
   * will report. `seconds <= 0` applies the view immediately (still emitting
   * `change` then `flyend`). Progress is driven by {@link tick}.
   */
  flyTo(targetPx: Point, targetZoom: number, seconds: number): void {
    const toZoom = this.clampZoom(targetZoom);
    const toCenter = this.clampCenter(targetPx);

    if (!(seconds > 0)) {
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
   * Advance the animation to wall-clock `nowMs`. Returns `true` while an
   * animation is still running, so the caller can decide whether to schedule
   * another frame.
   */
  tick(nowMs: number): boolean {
    const a = this.anim;
    if (!a) return false;
    if (a.startMs === null) a.startMs = nowMs;
    const raw = (nowMs - a.startMs) / a.durationMs;
    if (raw >= 1) {
      this.anim = null;
      this.applyView(a.toCenter, a.toZoom);
      this.emit("flyend");
      return false;
    }
    const t = easeInOutCubic(raw < 0 ? 0 : raw);
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

  /** Called by the gesture layer once a drag/pinch/wheel burst has settled. */
  emitGestureEnd(): void {
    this.emit("gestureend");
  }

  private emit(event: CameraEventName): void {
    // Copy: a listener may unsubscribe (or subscribe) while being notified.
    for (const fn of [...this.listeners[event]]) fn();
  }
}
