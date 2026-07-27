import type { Camera } from "./camera.ts";
import {
  accumulateWheelTarget,
  centerDeltaForDrag,
  centerForZoomAround,
  clampZoom,
  DEFAULT_WHEEL_PIXEL_FACTOR,
  DEFAULT_WHEEL_SENSITIVITY,
  DOUBLE_CLICK_ZOOM_DELTA,
  DOUBLE_CLICK_ZOOM_SECONDS,
  hasInertia,
  INERTIA_MAX_STEP_MS,
  inertiaStep,
  isDoubleTap,
  isTap,
  lerpZoom,
  normalizeWheelDelta,
  pinchUpdate,
  pushSample,
  velocityFrom,
  WHEEL_IDLE_MS,
  wheelLerpFactor,
  WHEEL_SETTLE_EPSILON,
  type PointerSample,
  type TapRecord,
} from "./gestureMath.ts";
import type { Point } from "./types.ts";

/**
 * The DOM binding for map gestures: pointer drag with inertia, two-pointer
 * pinch, smooth wheel zoom, double-tap zoom, tap and context-menu passthrough.
 *
 * Deliberately thin — it owns event plumbing and the gesture *state machine*
 * only; every number it feeds the camera comes from `gestureMath.ts`. It touches
 * no global except the injectable `requestAnimationFrame`/`cancelAnimationFrame`/
 * `setTimeout`/`clearTimeout`/`performance.now()` defaults, and reaches the DOM
 * only through the element it is handed, so a WeChat mini-program can supply its
 * own event source and clock.
 *
 * ## Interaction contract with the {@link Camera}
 * - Every gesture first cancels an in-flight `flyTo` — a user dragging during a
 *   programmatic fly always wins.
 * - This layer NEVER pumps {@link Camera.tick}. The frame owner does (the
 *   renderer's render-on-demand loop ticks while `camera.isAnimating()`), so the
 *   double-tap zoom just calls `flyTo` and returns. Because `flyTo` itself emits
 *   no event, the host must `invalidate()` after a programmatic camera animation
 *   for it to be pumped at all — that is what {@link GestureOptions.invalidate}
 *   is for, and the renderer documents the same requirement.
 * - `gestureend` fires once per burst of interaction that actually changed the
 *   view, when it settles: inertia below threshold, pinch/drag release, 200 ms of
 *   wheel silence. "Actually changed" is observed from the camera's own `change`
 *   event, so dragging while pinned against the centre clamp reports nothing;
 *   conversely a change left behind by an interrupted animation is inherited and
 *   reported by the gesture that interrupted it — never zero notifications for a
 *   view that moved. (A programmatic `setView`/`flyTo`/resize also arms the flag,
 *   so a later gesture may re-report a view the host already knew about. Since
 *   `onViewChange` reports the current view, one extra report is harmless where a
 *   missing one is not.)
 * - The double-tap zoom rides on `flyTo`, so it reports through `flyend` only —
 *   it deliberately does not also emit `gestureend`.
 * - The camera's `change` event drives repainting; this file never renders.
 *
 * ## Element requirements (the React layer's stylesheet, Task 6)
 * - `touch-action: none`, or the browser consumes touch pointermoves for
 *   scrolling before they arrive.
 * - `user-select: none` (plus `-webkit-user-select`), or dragging across the DOM
 *   overlay's labels/popups starts a native text selection mid-pan.
 * - `-webkit-user-drag: none` / `draggable="false"` on overlay images, or
 *   dragging one starts a native image drag which swallows the rest of the pan.
 */

/**
 * How long a pointer may go unheard before a new press treats it as lost, in ms.
 *
 * A pointer whose `pointerup` never arrives (an event swallowed upstream, a
 * host without pointer capture, an element replaced mid-gesture) would otherwise
 * stay booked forever: one ghost turns the next one-finger drag into a bogus
 * pinch, two ghosts wedge the layer permanently. `lostpointercapture` and a
 * `buttons === 0` move both reclaim a pointer immediately; this sweep is the
 * last resort for hosts that provide neither.
 *
 * The window is deliberately long: a finger really held motionless emits no
 * events either, and the cost of sweeping it too early (a two-finger gesture
 * starting as a pan) is worse than the cost of unwedging a little later.
 */
export const POINTER_STALE_MS = 10_000;

/**
 * A listener as seen by {@link GestureTarget}. The event parameter is
 * deliberately `any`, because this one position has to stay assignable BOTH ways:
 * to the DOM's `EventListenerOrEventListenerObject` (so an `HTMLCanvasElement`
 * is a `GestureTarget` with no cast at the call site — that union contains
 * `EventListenerObject`, which no function type can absorb) and to a non-DOM
 * host's narrowly typed listener (so a weapp canvas adapter is one too).
 *
 * Every narrower type excludes one side: `(ev: never) => void` rejects every DOM
 * element, `(ev: Event) => void` rejects non-DOM hosts, and a generic parameter
 * rejects any host whose listener names a concrete event type. The handlers in
 * this file declare the concrete shapes they need
 * ({@link GesturePointerEvent} & co), so nothing downstream is `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type GestureEventListener = (ev: any) => void;

/**
 * The subset of an element this binding uses — `HTMLElement` (and
 * `HTMLCanvasElement`) satisfies it structurally, with no cast. Capture and rect
 * are optional so a non-DOM host (or a test stub) can omit them.
 *
 * Without `setPointerCapture`, moves that leave the element are not delivered,
 * so a drag ending outside it leaves the pointer booked and the gesture
 * unfinished until {@link POINTER_STALE_MS} (or the next event for that id)
 * reclaims it. Without `getBoundingClientRect`, event coordinates are assumed to
 * already be element-local.
 */
export interface GestureTarget {
  addEventListener(
    type: string,
    listener: GestureEventListener,
    options?: { passive?: boolean; capture?: boolean } | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: GestureEventListener,
    options?: { passive?: boolean; capture?: boolean } | boolean,
  ): void;
  getBoundingClientRect?(): { left: number; top: number };
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

/** Structural subset of a DOM `PointerEvent`. */
export interface GesturePointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  /** Mouse button; anything above 0 (right/middle) is ignored. */
  button?: number;
  /**
   * Bitmask of buttons currently held. On a `pointermove` for a pointer we
   * believe is down, `0` proves it was released without us hearing about it.
   */
  buttons?: number;
  preventDefault?: () => void;
}

/** Structural subset of a DOM `WheelEvent`. */
export interface GestureWheelEvent {
  clientX: number;
  clientY: number;
  deltaY: number;
  deltaMode?: number;
  preventDefault?: () => void;
}

/** Structural subset of a DOM `MouseEvent` (used for `contextmenu`). */
export interface GestureMouseEvent {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
}

/** A location reported to the host, in both spaces it could need. */
export interface GesturePointEvent {
  /**
   * Element-local CSS pixels — the camera's screen space, NOT the DOM's
   * `MouseEvent.screenX` (which is monitor-relative).
   */
  screenX: number;
  screenY: number;
  /** The same point in map-pixel space (marker hit-testing, "copy position"). */
  pixel: Point;
}

/** Payload of the `contextmenu` passthrough. */
export type GestureContextMenuEvent = GesturePointEvent;

/** Payload of the tap passthrough. */
export type GestureTapEvent = GesturePointEvent;

export interface GestureOptions {
  /**
   * Schedules one animation frame and returns a cancellation handle. The
   * callback takes no timestamp on purpose: every duration in this file is
   * measured with {@link GestureOptions.now} so the two can never disagree.
   */
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
  /** One-shot timer, for the wheel-idle deadline. Defaults to `setTimeout`. */
  setTimer?: (cb: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
  /** Monotonic clock in ms. Must be the same clock `camera.tick` receives. */
  now?: () => number;
  /** Wheel zoom speed multiplier; matches the Leaflet map's `smoothSensitivity`. */
  sensitivity?: number;
  /**
   * Divisor for pixel-mode wheel deltas. Defaults to `2 × devicePixelRatio`
   * taken from the element's own window (see `normalizeWheelDelta`).
   */
  wheelPixelFactor?: number;
  /** Zoom levels added by one double-click/double-tap. */
  zoomDelta?: number;
  /**
   * Called after this layer starts a camera animation (the double-tap zoom).
   * Wire it to the renderer's `invalidate()`: `flyTo` emits nothing, so without
   * it a render-on-demand host never pumps `camera.tick` and the animation never
   * runs.
   */
  invalidate?: () => void;
  /**
   * A tap (short press, barely moved) — for marker selection and background
   * deselect, so the React layer does not have to re-derive tap-vs-drag from a
   * DOM `click` (which fires after a 500 px drag too).
   *
   * Fires for a single tap and for the FIRST tap of a double tap, never for the
   * second: a double tap is a zoom, and toggling the selection twice on the way
   * there is never what the user meant.
   */
  onTap?: (e: GestureTapEvent) => void;
  /** Called on `contextmenu` after `preventDefault()`. */
  onContextMenu?: (e: GestureContextMenuEvent) => void;
}

/** What {@link attachGestures} returns. */
export interface GestureController {
  /** Remove every listener, cancel every pending frame/timer, unsubscribe. */
  detach(): void;
  /**
   * Whether a gesture is in progress: a pointer is down, a fling is coasting, or
   * a wheel burst has not gone quiet. The React layer uses it to suppress hover
   * hit-testing mid-drag and to keep its fly-to controller from fighting the
   * user. (A double-tap zoom is a camera animation, not a gesture — ask
   * {@link Camera.isAnimating} for that.)
   */
  isGesturing(): boolean;
}

function defaultRequestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  // No frame source: animated gestures (inertia, wheel glide) simply do not
  // run. Such a host must inject `requestFrame`.
  return 0;
}

function defaultCancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
}

function defaultSetTimer(cb: () => void, ms: number): number {
  // The handle is opaque (a number in the DOM, an object in node) — the cast
  // keeps the injectable signature simple and is undone in defaultClearTimer.
  return setTimeout(cb, ms) as unknown as number;
}

function defaultClearTimer(handle: number): void {
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * `2 × devicePixelRatio` read through the element's own document — the DPR half
 * of Leaflet's wheel normalization, without touching a `window` global.
 */
function defaultWheelPixelFactor(el: GestureTarget): number {
  const view = (
    el as { ownerDocument?: { defaultView?: { devicePixelRatio?: number } | null } }
  ).ownerDocument?.defaultView;
  const dpr = view?.devicePixelRatio;
  return typeof dpr === "number" && dpr > 0 ? 2 * dpr : DEFAULT_WHEEL_PIXEL_FACTOR;
}

/**
 * Bind gestures to `el`, driving `camera`. Returns a {@link GestureController};
 * call `detach()` on unmount.
 */
export function attachGestures(
  el: GestureTarget,
  camera: Camera,
  opts: GestureOptions = {},
): GestureController {
  const requestFrame = opts.requestFrame ?? defaultRequestFrame;
  const cancelFrame = opts.cancelFrame ?? defaultCancelFrame;
  const setTimer = opts.setTimer ?? defaultSetTimer;
  const clearTimer = opts.clearTimer ?? defaultClearTimer;
  const now = opts.now ?? defaultNow;
  const sensitivity = Number.isFinite(opts.sensitivity)
    ? (opts.sensitivity as number)
    : DEFAULT_WHEEL_SENSITIVITY;
  const zoomDelta = Number.isFinite(opts.zoomDelta)
    ? (opts.zoomDelta as number)
    : DOUBLE_CLICK_ZOOM_DELTA;
  const wheelPixelFactor = Number.isFinite(opts.wheelPixelFactor)
    ? (opts.wheelPixelFactor as number)
    : defaultWheelPixelFactor(el);

  // --- pointer state: id → last element-local position + when it was last
  // heard from (the staleness sweep), in press order ---------------------------
  const pointers = new Map<number, PointerSample>();
  /** The pointer currently panning, or null while pinching / idle. */
  let dragId: number | null = null;
  let pinching = false;
  let samples: readonly PointerSample[] = [];
  /** Press that may still turn out to be a tap (null once it cannot). */
  let pressed: TapRecord | null = null;
  /** The previous completed tap, for double-tap recognition. */
  let lastTap: TapRecord | null = null;
  /**
   * Whether the view has changed since the last `gestureend`. Set from the
   * camera's own `change` event rather than from "we asked it to move", so a pan
   * that the clamp swallowed reports nothing.
   */
  let moved = false;

  // --- animation loops -------------------------------------------------------
  let inertiaVelocity: Point | null = null;
  let inertiaFrame: number | null = null;
  let inertiaLastMs = 0;
  let wheelActive = false;
  let wheelFrame: number | null = null;
  let wheelIdleTimer: number | null = null;
  let wheelTarget = 0;
  let wheelAnchor: Point = { x: 0, y: 0 };
  let wheelFrameMs = 0;

  const onCameraChange = (): void => {
    moved = true;
  };
  camera.on("change", onCameraChange);

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = el.getBoundingClientRect?.();
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  }

  function finite(p: Point): boolean {
    return Number.isFinite(p.x) && Number.isFinite(p.y);
  }

  function pointPayload(p: Point): GesturePointEvent {
    return {
      screenX: p.x,
      screenY: p.y,
      pixel: camera.screenToPixel(p.x, p.y),
    };
  }

  /** One frame's elapsed time, capped and guarded against a clock going backwards. */
  function frameDelta(sinceMs: number): number {
    const raw = now() - sinceMs;
    return Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), INERTIA_MAX_STEP_MS);
  }

  function stopInertia(): void {
    if (inertiaFrame !== null) cancelFrame(inertiaFrame);
    inertiaFrame = null;
    inertiaVelocity = null;
  }

  function stopWheel(): void {
    if (wheelFrame !== null) cancelFrame(wheelFrame);
    wheelFrame = null;
    if (wheelIdleTimer !== null) clearTimer(wheelIdleTimer);
    wheelIdleTimer = null;
    wheelActive = false;
  }

  /**
   * Drop the camera animation this gesture is taking over from. Nothing is
   * emitted: the interrupted animation's view change stays recorded in `moved`
   * and is reported when this gesture settles.
   */
  function takeOverCameraMotion(): void {
    camera.cancelAnimation();
  }

  /** Emit `gestureend` iff the view changed since the last one, then re-arm. */
  function settle(): void {
    if (moved) camera.emitGestureEnd();
    moved = false;
  }

  // ------------------------------------------------------------------ drag ---

  /**
   * Forget pointers we have not heard from in {@link POINTER_STALE_MS}. Called
   * before a press is accepted, which is the only moment a ghost can do damage.
   */
  function sweepStalePointers(): void {
    if (pointers.size === 0) return;
    const t = now();
    for (const [id, at] of [...pointers]) {
      if (t - at.t > POINTER_STALE_MS) forgetPointer(id);
    }
  }

  /** Drop a pointer from the gesture without any tap/fling interpretation. */
  function forgetPointer(id: number): void {
    if (!pointers.delete(id)) return;
    try {
      el.releasePointerCapture?.(id);
    } catch {
      // Never captured, or already released.
    }
    if (dragId === id) dragId = null;
    if (pointers.size < 2) pinching = false;
    if (pointers.size === 1) {
      // Promote the survivor so the gesture keeps working with one finger.
      const [survivor] = [...pointers.keys()];
      const at = pointers.get(survivor) as PointerSample;
      dragId = survivor;
      samples = pushSample([], { x: at.x, y: at.y, t: now() });
    } else if (pointers.size === 0) {
      pressed = null;
      samples = [];
    }
  }

  function onPointerDown(e: GesturePointerEvent): void {
    // Right/middle button: no drag (the right button is the context menu).
    if (typeof e.button === "number" && e.button > 0) return;
    sweepStalePointers();
    // A third finger joins nothing; the pinch keeps its original two pointers.
    if (pointers.size >= 2 && !pointers.has(e.pointerId)) return;
    const p = localPoint(e);
    if (!finite(p)) return;

    stopInertia();
    stopWheel();
    takeOverCameraMotion();
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Unsupported or stale pointer id: dragging still works inside the element.
    }

    const t = now();
    // A repeated id is a re-press of a pointer whose release we missed, not a
    // second finger: `set` overwrites, so the gesture stays single-pointer.
    pointers.set(e.pointerId, { x: p.x, y: p.y, t });
    if (pointers.size === 1) {
      dragId = e.pointerId;
      pinching = false;
      samples = pushSample([], { x: p.x, y: p.y, t });
      pressed = { x: p.x, y: p.y, t };
      // `moved` is deliberately NOT reset: if this press interrupted a wheel
      // glide or a fly that had already moved the view, that pending
      // `gestureend` is inherited and reported when this gesture settles — one
      // notification per burst of interaction, never zero.
    } else {
      // Second finger down: switch to pinch, and forget both the tap candidate
      // and the collected velocity (a pinch never flings).
      pinching = true;
      dragId = null;
      samples = [];
      pressed = null;
      lastTap = null;
    }
  }

  function onPointerMove(e: GesturePointerEvent): void {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    // The pointer is up and we never heard the `pointerup`: reclaim it instead of
    // panning the map with a pointer the user is no longer pressing.
    if (e.buttons === 0) {
      forgetPointer(e.pointerId);
      settle();
      return;
    }
    const p = localPoint(e);
    if (!finite(p)) return;
    const t = now();

    if (pinching && pointers.size === 2) {
      const ids = [...pointers.keys()];
      const beforeA = pointers.get(ids[0]) as PointerSample;
      const beforeB = pointers.get(ids[1]) as PointerSample;
      const afterA = ids[0] === e.pointerId ? p : beforeA;
      const afterB = ids[1] === e.pointerId ? p : beforeB;
      pointers.set(e.pointerId, { x: p.x, y: p.y, t });
      const update = pinchUpdate(beforeA, beforeB, afterA, afterB);
      if (!update) return;
      // Pan first, then zoom around where the fingers are now — see pinchUpdate.
      if (update.centerDelta.x !== 0 || update.centerDelta.y !== 0) {
        camera.panBy(update.centerDelta.x, update.centerDelta.y);
      }
      if (update.dz !== 0) camera.zoomAround(update.anchor, update.dz);
      return;
    }

    pointers.set(e.pointerId, { x: p.x, y: p.y, t });
    if (e.pointerId !== dragId) return;

    const delta = centerDeltaForDrag({ x: p.x - prev.x, y: p.y - prev.y });
    if (delta.x !== 0 || delta.y !== 0) camera.panBy(delta.x, delta.y);
    samples = pushSample(samples, { x: p.x, y: p.y, t });
  }

  function onPointerUp(e: GesturePointerEvent): void {
    finishPointer(e, false);
  }

  function onPointerCancel(e: GesturePointerEvent): void {
    finishPointer(e, true);
  }

  /**
   * The implicit release that follows every `pointerup`/`pointercancel` — and
   * the only signal a host gives us when one of those never arrives (the
   * element was replaced, the event was swallowed upstream). Harmless when the
   * pointer is already gone.
   */
  function onLostPointerCapture(e: GesturePointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    forgetPointer(e.pointerId);
    if (pointers.size === 0) settle();
  }

  /**
   * A pointer left the gesture. `cancelled` pointers (OS gesture takeover, pen
   * out of range) neither fling nor count as taps — the user did not decide to
   * lift, so guessing at intent would fire zooms nobody asked for.
   */
  function finishPointer(e: GesturePointerEvent, cancelled: boolean): void {
    if (!pointers.has(e.pointerId)) return;
    try {
      el.releasePointerCapture?.(e.pointerId);
    } catch {
      // Already released (or unsupported) — nothing to undo.
    }
    const p = localPoint(e);
    const t = now();
    pointers.delete(e.pointerId);

    if (pointers.size >= 1) {
      // Pinch → drag handoff: continue with the surviving finger from its
      // CURRENT position, so the first move after the release pans by that
      // finger's own delta and nothing jumps. Velocity sampling restarts, so a
      // pinch release cannot fling.
      const [survivor] = [...pointers.keys()];
      const at = pointers.get(survivor) as PointerSample;
      dragId = survivor;
      pinching = false;
      pressed = null;
      samples = pushSample([], { x: at.x, y: at.y, t });
      return;
    }

    const wasPinching = pinching;
    const wasDragging = dragId === e.pointerId;
    const press = pressed;
    pinching = false;
    dragId = null;
    pressed = null;

    const release: TapRecord = { x: p.x, y: p.y, t };
    // Sample the release itself: it prunes everything older than the velocity
    // window, so holding still for a moment before lifting the finger cancels
    // the fling (the Leaflet engine relies on incidental pointer jitter for
    // that, which coarse touchscreens do not always provide).
    if (!cancelled && wasDragging && finite(p)) {
      samples = pushSample(samples, release);
    }
    const tapped =
      !cancelled && !wasPinching && press !== null && finite(p) && isTap(press, release);
    if (tapped) {
      const previous = lastTap;
      lastTap = release;
      if (previous && isDoubleTap(previous, release)) {
        lastTap = null;
        samples = [];
        startDoubleTapZoom(release);
        return;
      }
      opts.onTap?.(pointPayload(release));
    } else {
      lastTap = null;
    }

    const velocity = velocityFrom(samples);
    samples = [];
    if (!cancelled && !wasPinching && hasInertia(velocity)) {
      startInertia(velocity);
      return;
    }
    settle();
  }

  // --------------------------------------------------------------- inertia ---

  function startInertia(velocity: Point): void {
    stopInertia();
    inertiaVelocity = velocity;
    inertiaLastMs = now();
    inertiaFrame = requestFrame(inertiaTick);
  }

  function inertiaTick(): void {
    inertiaFrame = null;
    const velocity = inertiaVelocity;
    if (!velocity) return;

    const dt = frameDelta(inertiaLastMs);
    inertiaLastMs = now();

    const step = inertiaStep(velocity, dt);
    const delta = centerDeltaForDrag(step.offset);
    if (delta.x !== 0 || delta.y !== 0) camera.panBy(delta.x, delta.y);
    inertiaVelocity = step.velocity;
    if (!hasInertia(step.velocity)) {
      inertiaVelocity = null;
      settle();
      return;
    }
    inertiaFrame = requestFrame(inertiaTick);
  }

  // ----------------------------------------------------------------- wheel ---

  function onWheel(e: GestureWheelEvent): void {
    e.preventDefault?.();
    const anchor = localPoint(e);
    if (!finite(anchor)) return;
    // A wheel during a fling or a fly takes over; the wheel loop itself keeps
    // running (that is what accumulates the target).
    stopInertia();
    takeOverCameraMotion();

    if (!wheelActive) {
      wheelActive = true;
      wheelTarget = camera.zoom;
    }
    wheelTarget = accumulateWheelTarget(
      wheelTarget,
      normalizeWheelDelta(e.deltaY, e.deltaMode ?? 0, wheelPixelFactor),
      sensitivity,
      camera.minZoom,
      camera.maxZoom,
    );
    wheelAnchor = anchor;

    // The gesture ends 200 ms after the LAST wheel event, on a timer rather than
    // by polling the clock from the frame loop: the loop can then stop as soon as
    // the zoom has converged (every frame is a full repaint), and a throttled
    // frame source cannot delay the end of the gesture.
    if (wheelIdleTimer !== null) clearTimer(wheelIdleTimer);
    wheelIdleTimer = setTimer(onWheelIdle, WHEEL_IDLE_MS);
    if (wheelFrame === null) {
      wheelFrameMs = now();
      wheelFrame = requestFrame(wheelTick);
    }
  }

  function wheelTick(): void {
    wheelFrame = null;
    if (!wheelActive) return;

    const dt = frameDelta(wheelFrameMs);
    wheelFrameMs = now();
    const current = camera.zoom;
    const next = lerpZoom(current, wheelTarget, wheelLerpFactor(dt));
    if (next !== current) camera.zoomAround(wheelAnchor, next - current);

    // Converged (to well under a pixel of movement): idle until the deadline.
    if (Math.abs(wheelTarget - camera.zoom) <= WHEEL_SETTLE_EPSILON) return;
    wheelFrame = requestFrame(wheelTick);
  }

  function onWheelIdle(): void {
    wheelIdleTimer = null;
    if (!wheelActive) return;
    // Land exactly on the accumulated target: the geometric interpolation leaves
    // ~1% of the gap after 200 ms at 60 Hz. Invisible, but it would otherwise be
    // the value reported to `onViewChange` and persisted.
    const rest = wheelTarget - camera.zoom;
    if (rest !== 0) camera.zoomAround(wheelAnchor, rest);
    if (wheelFrame !== null) cancelFrame(wheelFrame);
    wheelFrame = null;
    wheelActive = false;
    // Wheeling mid-drag (trackpad zoom while a finger/button is down) is one
    // burst of interaction: let the pointer gesture report it, so `gestureend`
    // never fires while a pointer is still down.
    if (pointers.size === 0) settle();
  }

  // ------------------------------------------------------- double-tap zoom ---

  function startDoubleTapZoom(at: TapRecord): void {
    const nextZoom = clampZoom(camera.zoom + zoomDelta, camera.minZoom, camera.maxZoom);
    // At a zoom limit the gesture is inert. Without this the unclamped target
    // scale would solve for a centre the clamped zoom does not belong to, and
    // `flyTo` would happily animate that pan.
    if (nextZoom === camera.zoom) return;
    const target = centerForZoomAround(
      camera.center,
      camera.zoom,
      camera.viewportWidth,
      camera.viewportHeight,
      at,
      nextZoom,
    );
    camera.flyTo(target, nextZoom, DOUBLE_CLICK_ZOOM_SECONDS);
    // `flyTo` emits nothing, so the frame owner has to be woken to pump `tick`.
    // The animation reports itself through `flyend`; this layer stays out of it.
    opts.invalidate?.();
  }

  // ---------------------------------------------------------- context menu ---

  function onContextMenu(e: GestureMouseEvent): void {
    e.preventDefault?.();
    const p = localPoint(e);
    if (!finite(p)) return;
    opts.onContextMenu?.(pointPayload(p));
  }

  // ------------------------------------------------------------- plumbing ---

  type ListenOptions = { passive?: boolean; capture?: boolean } | undefined;
  const bound: {
    type: string;
    listener: GestureEventListener;
    options: ListenOptions;
  }[] = [];

  /**
   * Register a handler that declares the event shape it needs; no cast, because
   * {@link GestureEventListener} accepts any of them. The options are stored and
   * replayed on removal — `capture` is part of a listener's identity, so dropping
   * it would silently leak capturing listeners.
   */
  function listen<E>(type: string, handler: (e: E) => void, options?: ListenOptions): void {
    el.addEventListener(type, handler, options);
    bound.push({ type, listener: handler, options });
  }

  listen<GesturePointerEvent>("pointerdown", onPointerDown);
  listen<GesturePointerEvent>("pointermove", onPointerMove);
  listen<GesturePointerEvent>("pointerup", onPointerUp);
  listen<GesturePointerEvent>("pointercancel", onPointerCancel);
  listen<GesturePointerEvent>("lostpointercapture", onLostPointerCapture);
  // Not passive: wheel-zoom must stop the page from scrolling.
  listen<GestureWheelEvent>("wheel", onWheel, { passive: false });
  listen<GestureMouseEvent>("contextmenu", onContextMenu);

  return {
    detach(): void {
      for (const { type, listener, options } of bound) {
        el.removeEventListener(type, listener, options);
      }
      bound.length = 0;
      camera.off("change", onCameraChange);
      stopInertia();
      stopWheel();
      pointers.clear();
      samples = [];
      dragId = null;
      pinching = false;
      pressed = null;
      lastTap = null;
      moved = false;
    },
    isGesturing(): boolean {
      return pointers.size > 0 || inertiaVelocity !== null || wheelActive;
    },
  };
}
