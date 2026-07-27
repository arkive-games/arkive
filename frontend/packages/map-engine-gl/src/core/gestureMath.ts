import type { Point } from "./types.ts";

/**
 * All of the gesture layer's arithmetic, as pure functions.
 *
 * `gestures.ts` is a thin binding that listens to pointer/wheel events and calls
 * the {@link Camera}; every number it computes comes from here so the *feel* of
 * the map — how far a flick coasts, how fast a wheel notch zooms, where a pinch
 * anchors — is unit-testable without a DOM, and so a WeChat mini-program
 * adapter can reuse the maths with a completely different event source.
 *
 * Conventions used throughout:
 * - **Screen space** is CSS pixels relative to the map element's top-left, y
 *   DOWN — the same space {@link Camera.screenToPixel} consumes.
 * - A "**centre delta**" is what {@link Camera.panBy} wants: the movement of the
 *   view CENTRE, i.e. the negation of the content's movement. Exactly one
 *   function performs that negation ({@link centerDeltaForDrag}); nothing else
 *   in the package may flip a pan sign.
 * - Velocities are **px per millisecond** (not per second): the clock the
 *   gesture layer samples is in ms, and per-frame stepping then needs no unit
 *   conversion.
 *
 * Every input is treated as hostile: pointer coordinates come from the DOM, the
 * clock from an injected `now()`, wheel deltas from wildly inconsistent
 * hardware. A NaN reaching {@link Camera.panBy} would strand the camera, so each
 * function degenerates to "no movement" instead of propagating one.
 */

// ------------------------------------------------------------------ pan/drag --

/**
 * Content translation in screen px (how far the finger dragged the map) → the
 * centre delta for {@link Camera.panBy}. Dragging the content right moves the
 * centre left, hence the negation — the one place in the engine that owns this
 * sign, used by both the drag handler and the inertia stepper.
 */
export function centerDeltaForDrag(screenDelta: Point): Point {
  const x = Number.isFinite(screenDelta.x) ? -screenDelta.x : 0;
  const y = Number.isFinite(screenDelta.y) ? -screenDelta.y : 0;
  // `-0` is arithmetically harmless but leaks into equality checks and JSON, so
  // the negation normalizes it away.
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

// ------------------------------------------------------------------- inertia --

/** A timestamped pointer position in screen space. `t` is ms from any monotonic clock. */
export interface PointerSample extends Point {
  t: number;
}

/**
 * Length of the trailing window whose average velocity becomes the fling
 * velocity, in ms.
 *
 * Leaflet's `Draggable` uses 50 ms. 100 ms is used here instead: at 60 Hz a
 * 50 ms window holds only ~3 samples, which on coarse touchscreens (and on
 * pointer streams coalesced by the browser) is noisy enough that two identical
 * flicks can differ by 2×. 100 ms still discards everything but the very end of
 * the drag — a finger that stops moving for 100 ms before lifting produces zero
 * velocity and therefore no fling, which is the property that actually matters.
 */
export const VELOCITY_WINDOW_MS = 100;

/**
 * Time constant of the inertia decay, in ms: velocity is multiplied by
 * `e^(-dt/TAU)` each step, so a fling coasts a total of `v0 × TAU` px.
 *
 * DELIBERATE DEVIATION FROM LEAFLET: Leaflet decelerates linearly
 * (`inertiaDeceleration` 3400 px/s² over an eased pan), which makes its coast
 * distance grow with the SQUARE of the release speed (~120 px at 2000 px/s,
 * ~265 px at 3000 px/s). Exponential decay — which the plan calls for, and which
 * is what native touch scrollers do — is linear in speed: 240 px at 2000 px/s,
 * 60 px at 500 px/s. So slow flicks coast slightly further than Leaflet and very
 * fast ones slightly less. 120 ms was picked to match Leaflet's distance in the
 * middle of the range while keeping the tail short enough that the map feels
 * pinned to the finger rather than slippery.
 *
 * Being a time constant (rather than a per-frame factor) also makes the coast
 * frame-rate independent: 120 Hz and 60 Hz travel the same distance.
 */
export const INERTIA_TAU_MS = 120;

/** Below this speed (px/ms ≈ 20 px/s) inertia is over: one more frame would move <1 px. */
export const INERTIA_STOP_SPEED = 0.02;

/**
 * Largest `dt` a single inertia step may integrate, in ms (~4 frames at 60 Hz).
 * Without the cap, a background tab or a long GC pause resumes with a `dt` of
 * seconds and teleports the map on one frame.
 */
export const INERTIA_MAX_STEP_MS = 64;

/**
 * Append a sample and drop everything older than `windowMs` before it, keeping
 * at least the newest sample. Returns a new array (the caller reassigns), and
 * ignores non-finite samples entirely.
 *
 * Keeping only one sample after a pause is the mechanism behind "pause, then
 * lift = no fling": {@link velocityFrom} needs two samples to report anything.
 */
export function pushSample(
  samples: readonly PointerSample[],
  sample: PointerSample,
  windowMs: number = VELOCITY_WINDOW_MS,
): readonly PointerSample[] {
  if (
    !Number.isFinite(sample.x) ||
    !Number.isFinite(sample.y) ||
    !Number.isFinite(sample.t)
  ) {
    return samples;
  }
  const win = Number.isFinite(windowMs) && windowMs >= 0 ? windowMs : VELOCITY_WINDOW_MS;
  const out = [...samples, sample];
  let start = 0;
  while (start < out.length - 1 && sample.t - out[start].t > win) start++;
  return start > 0 ? out.slice(start) : out;
}

/**
 * Average velocity across the sample window, in screen px/ms. Fewer than two
 * samples, or a zero/inverted time span, means "no measurable movement" → zero.
 */
export function velocityFrom(samples: readonly PointerSample[]): Point {
  if (samples.length < 2) return { x: 0, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (!(dt > 0) || !Number.isFinite(dt)) return { x: 0, y: 0 };
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  return {
    x: Number.isFinite(vx) ? vx : 0,
    y: Number.isFinite(vy) ? vy : 0,
  };
}

/** Speed (px/ms) of a velocity vector; 0 for anything non-finite. */
export function speedOf(v: Point): number {
  const s = Math.sqrt(v.x * v.x + v.y * v.y);
  return Number.isFinite(s) ? s : 0;
}

/** Whether a release velocity is worth animating at all. */
export function hasInertia(v: Point, stopSpeed: number = INERTIA_STOP_SPEED): boolean {
  const stop = Number.isFinite(stopSpeed) ? stopSpeed : INERTIA_STOP_SPEED;
  return speedOf(v) > stop;
}

/** One inertia frame: where the content moved, and what the velocity decayed to. */
export interface InertiaStep {
  /** Content translation over `dtMs` in screen px (feed through {@link centerDeltaForDrag}). */
  offset: Point;
  /** Velocity at the END of the step, for the next frame. */
  velocity: Point;
}

/**
 * Advance an exponentially decaying velocity by `dtMs`.
 *
 * The offset is the exact integral of the decay over the step
 * (`v·τ·(1 − e^(−dt/τ))`), not `v·dt`, so the total distance travelled is
 * independent of how the frames happen to be spaced — a dropped frame does not
 * shorten the glide.
 *
 * A non-positive/non-finite `dtMs` is a no-op step (velocity preserved); a
 * non-positive `tauMs` stops immediately.
 */
export function inertiaStep(
  v: Point,
  dtMs: number,
  tauMs: number = INERTIA_TAU_MS,
): InertiaStep {
  const vx = Number.isFinite(v.x) ? v.x : 0;
  const vy = Number.isFinite(v.y) ? v.y : 0;
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) {
    return { offset: { x: 0, y: 0 }, velocity: { x: vx, y: vy } };
  }
  const tau = Number.isFinite(tauMs) ? tauMs : INERTIA_TAU_MS;
  if (!(tau > 0)) return { offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
  const decay = Math.exp(-dtMs / tau);
  const travelled = tau * (1 - decay);
  return {
    offset: { x: vx * travelled, y: vy * travelled },
    velocity: { x: vx * decay, y: vy * decay },
  };
}

// --------------------------------------------------------------------- pinch --

/**
 * Two-pointer distances below this (screen px) carry no usable scale
 * information — `log2(d1/d0)` explodes toward ±∞ as either distance approaches
 * zero, which at the camera would be a full-range zoom jump. Below the guard the
 * pinch degrades to a pure two-finger pan (`dz = 0`).
 */
export const MIN_PINCH_DISTANCE_PX = 1e-3;

/** Euclidean distance between two screen points (0 if either is non-finite). */
export function distanceBetween(a: Point, b: Point): number {
  const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  return Number.isFinite(d) ? d : 0;
}

/** Midpoint of two screen points. */
export function midpointOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** What one pinch move asks of the camera. */
export interface PinchUpdate {
  /** Zoom delta: `log2(distanceAfter / distanceBefore)`. */
  dz: number;
  /** Screen point to zoom around — the midpoint AFTER the move (where the fingers are now). */
  anchor: Point;
  /** Centre delta for {@link Camera.panBy}, from the midpoint's translation. */
  centerDelta: Point;
}

/**
 * Pinch step from both pointers' previous and current positions.
 *
 * Apply it in this order: `camera.panBy(centerDelta)` **then**
 * `camera.zoomAround(anchor, dz)`. The pan carries the map point that was under
 * the old midpoint to the new midpoint; the zoom then pins it there. (Zooming
 * around the *old* midpoint first and panning after is algebraically the same
 * thing; anchoring on the fingers' current position is just easier to reason
 * about, and behaves better when the centre clamp interferes.)
 *
 * Returns `null` when any coordinate is non-finite — the caller must then do
 * nothing at all. A degenerate distance yields `dz = 0` but still pans, so two
 * fingers held at the same spot behave as a two-finger drag.
 */
export function pinchUpdate(
  beforeA: Point,
  beforeB: Point,
  afterA: Point,
  afterB: Point,
): PinchUpdate | null {
  for (const p of [beforeA, beforeB, afterA, afterB]) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  }
  const before = distanceBetween(beforeA, beforeB);
  const after = distanceBetween(afterA, afterB);
  const midBefore = midpointOf(beforeA, beforeB);
  const midAfter = midpointOf(afterA, afterB);
  const measurable =
    before >= MIN_PINCH_DISTANCE_PX && after >= MIN_PINCH_DISTANCE_PX;
  const dz = measurable ? Math.log2(after / before) : 0;
  return {
    dz: Number.isFinite(dz) ? dz : 0,
    anchor: midAfter,
    centerDelta: centerDeltaForDrag({
      x: midAfter.x - midBefore.x,
      y: midAfter.y - midBefore.y,
    }),
  };
}

// --------------------------------------------------------------------- wheel --

/**
 * Zoom levels per unit of normalized wheel delta, and the app's sensitivity —
 * both verbatim from the Leaflet handler this ports
 * (`goalZoom += getWheelDelta(e) * 0.003 * sensitivity`, and palworld's
 * `smoothSensitivity={4}`).
 *
 * One 100 px wheel notch on a DPR-1 display normalizes to 50, i.e. 0.6 zoom
 * levels — the same step the Leaflet map takes today.
 */
export const WHEEL_ZOOM_FACTOR = 0.003;
export const DEFAULT_WHEEL_SENSITIVITY = 4;

/** Fraction of the remaining distance to the target zoom covered per frame (Leaflet's 0.3). */
export const WHEEL_LERP = 0.3;

/** The frame length {@link WHEEL_LERP} is defined for: Leaflet's rAF loop at 60 Hz. */
export const WHEEL_LERP_FRAME_MS = 1000 / 60;

/** Wheel silence after which the zoom gesture is considered finished, in ms (Leaflet's 200). */
export const WHEEL_IDLE_MS = 200;

/**
 * Zoom gap (in levels) at which the wheel glide is close enough to stop asking
 * for frames — the idle deadline lands the remainder exactly.
 *
 * 1e-4 zoom levels is ~0.007% of scale: under a tenth of a pixel of movement at
 * the edge of a 1200 px viewport, i.e. nothing a display can show.
 */
export const WHEEL_SETTLE_EPSILON = 1e-4;

/**
 * Leaflet's default pixel-mode divisor (`2 × devicePixelRatio`) at DPR 1.
 * See {@link normalizeWheelDelta}.
 */
export const DEFAULT_WHEEL_PIXEL_FACTOR = 2;

/**
 * Port of Leaflet's `DomEvent.getWheelDelta`: turn a `wheel` event's `deltaY` +
 * `deltaMode` into the normalized, sign-flipped delta its zoom accumulation
 * expects (POSITIVE = scroll up = zoom in).
 *
 * `deltaMode` 0 = pixels (divided by `pixelFactor`), 1 = lines (×20), 2 = pages
 * (×60); anything else contributes nothing.
 *
 * APPROXIMATION: Leaflet's `pixelFactor` is `2 × devicePixelRatio` in general,
 * but `devicePixelRatio` on Linux/Chrome and `3 × devicePixelRatio` on macOS.
 * Reproducing those needs UA sniffing, which has no place in this core, so the
 * caller injects the factor (the DOM binding derives `2 × devicePixelRatio` from
 * the element's own window). Consequence: on macOS the GL engine zooms ~1.5×
 * faster per wheel notch than the Leaflet engine. Trackpad pinch-zoom (which
 * arrives as ctrl+wheel with tiny deltas) is unaffected in feel.
 *
 * Leaflet's legacy Firefox `detail` branch is dropped (`deltaY` is universal in
 * every browser this engine targets).
 */
export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number = 0,
  pixelFactor: number = DEFAULT_WHEEL_PIXEL_FACTOR,
): number {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) return -deltaY * 20;
  if (deltaMode === 2) return -deltaY * 60;
  if (deltaMode !== 0) return 0;
  const factor = Number.isFinite(pixelFactor) && pixelFactor > 0
    ? pixelFactor
    : DEFAULT_WHEEL_PIXEL_FACTOR;
  return -deltaY / factor;
}

/** Zoom levels one normalized wheel delta contributes: `delta × 0.003 × sensitivity`. */
export function wheelTargetDelta(
  delta: number,
  sensitivity: number = DEFAULT_WHEEL_SENSITIVITY,
): number {
  if (!Number.isFinite(delta)) return 0;
  const s = Number.isFinite(sensitivity) ? sensitivity : DEFAULT_WHEEL_SENSITIVITY;
  return delta * WHEEL_ZOOM_FACTOR * s;
}

/**
 * Clamp a zoom level into `[minZoom, maxZoom]`, tolerating a broken range or a
 * non-finite input (both leave the value untouched rather than inventing one).
 *
 * The {@link Camera} clamps internally as well; this exists because callers must
 * know the CLAMPED zoom *before* solving anything from it — see
 * {@link centerForZoomAround}.
 */
export function clampZoom(z: number, minZoom: number, maxZoom: number): number {
  if (!Number.isFinite(z)) return z;
  const lo = Number.isFinite(minZoom) ? minZoom : z;
  const hi = Number.isFinite(maxZoom) ? maxZoom : z;
  if (lo > hi) return z;
  return z < lo ? lo : z > hi ? hi : z;
}

/**
 * Add one wheel event to the accumulated target zoom, clamped to the camera's
 * range (Leaflet's `_limitZoom` guard). Clamping as it accumulates is what keeps
 * a long scroll burst against the zoom limit from building up a debt that has to
 * be scrolled back off before the map responds again.
 */
export function accumulateWheelTarget(
  target: number,
  delta: number,
  sensitivity: number,
  minZoom: number,
  maxZoom: number,
): number {
  const base = Number.isFinite(target) ? target : 0;
  return clampZoom(base + wheelTargetDelta(delta, sensitivity), minZoom, maxZoom);
}

/**
 * The interpolation factor for a frame of length `dtMs`, so the glide covers the
 * same ground per unit of TIME at any refresh rate: `1 − (1 − factor)^(dt/16.67)`.
 *
 * Leaflet applies a flat 0.3 per rAF callback, which makes its wheel zoom
 * arrive ~2× faster on a 120 Hz phone than on a 60 Hz monitor. This engine
 * targets both, and `inertiaStep` already guarantees frame-rate independence for
 * the fling, so the wheel matches: at exactly 60 Hz the factor IS Leaflet's 0.3,
 * and two 120 Hz frames compose to the same 0.3 (`(1−f)² = 0.7`).
 *
 * A non-positive `dtMs` contributes nothing; the step is not capped here — the
 * caller caps `dt` (a frame after a background-tab stall would otherwise jump
 * straight to the target).
 */
export function wheelLerpFactor(
  dtMs: number,
  factor: number = WHEEL_LERP,
  frameMs: number = WHEEL_LERP_FRAME_MS,
): number {
  const f = Number.isFinite(factor) ? (factor < 0 ? 0 : factor > 1 ? 1 : factor) : WHEEL_LERP;
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return 0;
  if (!(frameMs > 0) || !Number.isFinite(frameMs)) return f;
  if (f >= 1) return 1;
  return 1 - Math.pow(1 - f, dtMs / frameMs);
}

/**
 * One frame of the smooth-wheel interpolation: move `factor` of the way from the
 * current zoom to the accumulated target. Geometric, so it converges
 * monotonically without ever overshooting (~1% of the gap left after the 200 ms
 * idle window at 60 Hz — the DOM binding snaps that remainder away on end).
 *
 * `factor` is per FRAME. Pass {@link wheelLerpFactor} to make it per unit of
 * time instead, which is what the DOM binding does.
 *
 * NOT ported from Leaflet: its `Math.floor(zoom * 100) / 100` quantization. That
 * exists to keep Leaflet's zoom pipeline on tidy values, but it biases every
 * step downward (floor, not round) and stalls the interpolation while the
 * per-frame increment is under 0.01. This camera is fully fractional and needs
 * neither.
 */
export function lerpZoom(current: number, target: number, factor: number = WHEEL_LERP): number {
  if (!Number.isFinite(current)) return Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(target)) return current;
  const f = Number.isFinite(factor) ? (factor < 0 ? 0 : factor > 1 ? 1 : factor) : WHEEL_LERP;
  return current + (target - current) * f;
}

// -------------------------------------------------------- double-click zoom --

/** Zoom levels one double-click/double-tap adds (the plan's "+1 zoom step"). */
export const DOUBLE_CLICK_ZOOM_DELTA = 1;

/** Duration of the double-click zoom animation, in seconds. */
export const DOUBLE_CLICK_ZOOM_SECONDS = 0.25;

/** A press or release position, for tap recognition. */
export interface TapRecord extends Point {
  t: number;
}

/** Longest press, and largest movement, that still counts as a tap (not a drag). */
export const TAP_MAX_MS = 300;
export const TAP_MAX_MOVE_PX = 10;

/** Largest gap, and largest separation, between two taps of a double tap. */
export const DOUBLE_TAP_MAX_MS = 300;
export const DOUBLE_TAP_MAX_DIST_PX = 40;

/**
 * Whether a press→release pair is a tap: short enough, and barely moved.
 *
 * Recognising taps ourselves (rather than listening for `dblclick`) keeps the
 * behaviour identical for mouse and touch and keeps the binding portable to
 * hosts that have no synthesized `dblclick` at all.
 */
export function isTap(
  down: TapRecord,
  up: TapRecord,
  maxMs: number = TAP_MAX_MS,
  maxMovePx: number = TAP_MAX_MOVE_PX,
): boolean {
  const dt = up.t - down.t;
  if (!Number.isFinite(dt) || dt < 0 || dt > maxMs) return false;
  return distanceBetween(down, up) <= maxMovePx;
}

/** Whether a second tap lands close enough in time and space to the first. */
export function isDoubleTap(
  first: TapRecord,
  second: TapRecord,
  maxMs: number = DOUBLE_TAP_MAX_MS,
  maxDistPx: number = DOUBLE_TAP_MAX_DIST_PX,
): boolean {
  const dt = second.t - first.t;
  if (!Number.isFinite(dt) || dt < 0 || dt > maxMs) return false;
  return distanceBetween(first, second) <= maxDistPx;
}

/**
 * The centre a `zoomAround(screenPt, nextZoom − zoom)` would land on — the same
 * algebra as {@link Camera.zoomAround}, exposed separately because
 * {@link Camera.flyTo} animates toward a centre+zoom and has no notion of an
 * anchor. That is what makes the double-click zoom *animated* yet still anchored
 * at the click point.
 *
 * THE CALLER MUST PASS AN ALREADY-CLAMPED `nextZoom` (see {@link clampZoom}).
 * `nextZoom` is the target SCALE the centre is solved for, so handing this an
 * out-of-range zoom and relying on `Camera.flyTo` to clamp it afterwards does
 * NOT work: the camera clamps the zoom first and solves the centre from the
 * clamped value, while this would return the centre for the unclamped one — the
 * fly would then land at the right zoom but a wrong, panned centre. At a zoom
 * limit the clamped `nextZoom` equals the current zoom, which is the caller's cue
 * that the gesture is inert.
 *
 * The CENTRE, by contrast, is deliberately left unclamped: `flyTo` clamps it, so
 * the anchor drifts near the map edge exactly as it does for an instant
 * `zoomAround`.
 */
export function centerForZoomAround(
  center: Point,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  screenPt: Point,
  nextZoom: number,
): Point {
  if (
    !Number.isFinite(zoom) ||
    !Number.isFinite(nextZoom) ||
    !Number.isFinite(screenPt.x) ||
    !Number.isFinite(screenPt.y) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return { x: center.x, y: center.y };
  }
  const dx = screenPt.x - viewportWidth / 2;
  const dy = screenPt.y - viewportHeight / 2;
  const from = Math.pow(2, zoom);
  const to = Math.pow(2, nextZoom);
  return {
    x: center.x + dx / from - dx / to,
    y: center.y + dy / from - dy / to,
  };
}
