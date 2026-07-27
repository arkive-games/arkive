import type { Camera } from "./camera.ts";
import {
  accumulateWheelTarget,
  centerDeltaForDrag,
  centerForZoomAround,
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
  type PointerSample,
  type TapRecord,
} from "./gestureMath.ts";
import type { Point } from "./types.ts";

/**
 * The DOM binding for map gestures: pointer drag with inertia, two-pointer
 * pinch, smooth wheel zoom, double-tap zoom, context-menu passthrough.
 *
 * Deliberately thin — it owns event plumbing and gesture *state machine* only;
 * every number it feeds the camera comes from `gestureMath.ts`. It touches no
 * global except the injectable `requestAnimationFrame`/`cancelAnimationFrame`/
 * `performance.now()` defaults, and reaches the DOM only through the element it
 * is handed, so a WeChat mini-program can supply its own event source and clock.
 *
 * Interaction contract with the {@link Camera}:
 * - Every gesture first cancels an in-flight `flyTo` — a user dragging during a
 *   programmatic fly always wins.
 * - `camera.emitGestureEnd()` fires exactly once per gesture that moved the
 *   view, at the moment it settles: inertia below threshold, pinch release,
 *   200 ms of wheel silence, or the end of the double-tap zoom animation. A tap
 *   or a drag that never moved the camera stays silent, so the React layer's
 *   `onViewChange` is not woken by every click. (The double-tap zoom rides on
 *   `flyTo`, so it emits `flyend` as well — a consumer subscribing to both must
 *   coalesce.)
 * - The camera's own `change` event drives repainting; this file never renders.
 *
 * Requires `touch-action: none` on the element, or the browser eats touch
 * pointermoves for scrolling before they arrive (the React layer's stylesheet
 * sets it).
 */

/**
 * The subset of an element this binding uses — `HTMLElement` satisfies it
 * structurally. Capture and rect are optional so a non-DOM host (or a test
 * stub) can omit them; without `setPointerCapture` a drag simply ends when the
 * pointer leaves the element, and without `getBoundingClientRect` event
 * coordinates are assumed to already be element-local.
 */
export interface GestureTarget {
  addEventListener(
    type: string,
    listener: (ev: never) => void,
    options?: { passive?: boolean; capture?: boolean } | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (ev: never) => void,
    options?: { capture?: boolean } | boolean,
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

/** Payload of the `contextmenu` passthrough. */
export interface GestureContextMenuEvent {
  /**
   * Element-local CSS pixels — the camera's screen space, NOT the DOM's
   * `MouseEvent.screenX` (which is monitor-relative).
   */
  screenX: number;
  screenY: number;
  /** The same point in map-pixel space, for "copy position". */
  pixel: Point;
}

export interface GestureOptions {
  /**
   * Schedules one animation frame and returns a cancellation handle. The
   * callback takes no timestamp on purpose: every duration in this file is
   * measured with {@link GestureOptions.now} so the two can never disagree.
   */
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
  /** Monotonic clock in ms. Must be the same clock the camera's `tick` receives. */
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
  /** Called on `contextmenu` after `preventDefault()`. */
  onContextMenu?: (e: GestureContextMenuEvent) => void;
}

function defaultRequestFrame(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  // No frame source: animated gestures (inertia/wheel glide/double-tap) simply
  // do not run. Such a host must inject `requestFrame`.
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
 * Bind gestures to `el`, driving `camera`. Returns a detach function that
 * removes every listener and cancels every pending frame — call it on unmount.
 */
export function attachGestures(
  el: GestureTarget,
  camera: Camera,
  opts: GestureOptions = {},
): () => void {
  const requestFrame = opts.requestFrame ?? defaultRequestFrame;
  const cancelFrame = opts.cancelFrame ?? defaultCancelFrame;
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

  // --- pointer state: id → last element-local position, in press order -------
  const pointers = new Map<number, Point>();
  /** The pointer currently panning, or null while pinching / idle. */
  let dragId: number | null = null;
  let pinching = false;
  let samples: PointerSample[] = [];
  /** Press that may still turn out to be a tap (null once it cannot). */
  let pressed: TapRecord | null = null;
  /** The previous completed tap, for double-tap recognition. */
  let lastTap: TapRecord | null = null;
  /** Whether the current gesture has actually moved the camera (gates `gestureend`). */
  let moved = false;

  // --- animation loops (at most one of the three runs at a time) -------------
  let inertiaVelocity: Point | null = null;
  let inertiaFrame: number | null = null;
  let inertiaLastMs = 0;
  let wheelActive = false;
  let wheelFrame: number | null = null;
  let wheelTarget = 0;
  let wheelAnchor: Point = { x: 0, y: 0 };
  let wheelLastMs = 0;
  let flyFrame: number | null = null;

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

  function stopInertia(): void {
    if (inertiaFrame !== null) cancelFrame(inertiaFrame);
    inertiaFrame = null;
    inertiaVelocity = null;
  }

  function stopWheel(): void {
    if (wheelFrame !== null) cancelFrame(wheelFrame);
    wheelFrame = null;
    wheelActive = false;
  }

  function stopFly(): void {
    if (flyFrame !== null) cancelFrame(flyFrame);
    flyFrame = null;
  }

  /**
   * Drop any camera motion this gesture is taking over from. Cancelling the fly
   * loop BEFORE `cancelAnimation()` matters: the loop must never observe the
   * cancellation, or it would report a `gestureend` for a gesture that was
   * interrupted rather than finished.
   */
  function takeOverCameraMotion(): void {
    stopFly();
    camera.cancelAnimation();
  }

  /** Emit `gestureend` iff this gesture moved the view, then reset the flag. */
  function settle(): void {
    if (moved) camera.emitGestureEnd();
    moved = false;
  }

  // ------------------------------------------------------------------ drag ---

  function onPointerDown(e: GesturePointerEvent): void {
    // Right/middle button: no drag (the right button is the context menu).
    if (typeof e.button === "number" && e.button > 0) return;
    // A third finger joins nothing; the pinch keeps its original two pointers.
    if (pointers.size >= 2) return;
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
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      dragId = e.pointerId;
      pinching = false;
      samples = pushSample([], { x: p.x, y: p.y, t });
      pressed = { x: p.x, y: p.y, t };
      // `moved` is deliberately NOT reset: if this press interrupted a wheel
      // glide or a fling that had already moved the view, that pending
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
    const p = localPoint(e);
    if (!finite(p)) return;

    if (pinching && pointers.size === 2) {
      const ids = [...pointers.keys()];
      const beforeA = pointers.get(ids[0]) as Point;
      const beforeB = pointers.get(ids[1]) as Point;
      const afterA = ids[0] === e.pointerId ? p : beforeA;
      const afterB = ids[1] === e.pointerId ? p : beforeB;
      pointers.set(e.pointerId, p);
      const update = pinchUpdate(beforeA, beforeB, afterA, afterB);
      if (!update) return;
      // Pan first, then zoom around where the fingers are now — see pinchUpdate.
      if (update.centerDelta.x !== 0 || update.centerDelta.y !== 0) {
        camera.panBy(update.centerDelta.x, update.centerDelta.y);
        moved = true;
      }
      if (update.dz !== 0) {
        camera.zoomAround(update.anchor, update.dz);
        moved = true;
      }
      return;
    }

    pointers.set(e.pointerId, p);
    if (e.pointerId !== dragId) return;

    const delta = centerDeltaForDrag({ x: p.x - prev.x, y: p.y - prev.y });
    if (delta.x !== 0 || delta.y !== 0) {
      camera.panBy(delta.x, delta.y);
      moved = true;
    }
    samples = pushSample(samples, { x: p.x, y: p.y, t: now() });
  }

  function onPointerUp(e: GesturePointerEvent): void {
    finishPointer(e, false);
  }

  function onPointerCancel(e: GesturePointerEvent): void {
    finishPointer(e, true);
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
      const survivor = [...pointers.keys()][0];
      const at = pointers.get(survivor) as Point;
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
    inertiaVelocity = velocity;
    inertiaLastMs = now();
    inertiaFrame = requestFrame(inertiaTick);
  }

  function inertiaTick(): void {
    inertiaFrame = null;
    const velocity = inertiaVelocity;
    if (!velocity) return;

    const t = now();
    const raw = t - inertiaLastMs;
    const dt = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), INERTIA_MAX_STEP_MS);
    inertiaLastMs = t;

    const step = inertiaStep(velocity, dt);
    const delta = centerDeltaForDrag(step.offset);
    if (delta.x !== 0 || delta.y !== 0) {
      camera.panBy(delta.x, delta.y);
      moved = true;
    }
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
    wheelLastMs = now();
    if (wheelFrame === null) wheelFrame = requestFrame(wheelTick);
  }

  function wheelTick(): void {
    wheelFrame = null;
    if (!wheelActive) return;

    const current = camera.zoom;
    const next = lerpZoom(current, wheelTarget);
    if (next !== current) {
      camera.zoomAround(wheelAnchor, next - current);
      moved = true;
    }

    if (now() - wheelLastMs >= WHEEL_IDLE_MS) {
      // Land exactly on the accumulated target: the geometric interpolation
      // leaves ~1% of the gap after 200 ms at 60 Hz. Invisible, but it would
      // otherwise be the value reported to `onViewChange` and persisted.
      const rest = wheelTarget - camera.zoom;
      if (rest !== 0) {
        camera.zoomAround(wheelAnchor, rest);
        moved = true;
      }
      wheelActive = false;
      settle();
      return;
    }
    wheelFrame = requestFrame(wheelTick);
  }

  // ------------------------------------------------------- double-tap zoom ---

  function startDoubleTapZoom(at: TapRecord): void {
    const nextZoom = camera.zoom + zoomDelta;
    const target = centerForZoomAround(
      camera.center,
      camera.zoom,
      camera.viewportWidth,
      camera.viewportHeight,
      at,
      nextZoom,
    );
    moved = false;
    camera.flyTo(target, nextZoom, DOUBLE_CLICK_ZOOM_SECONDS);
    if (!camera.isAnimating()) {
      // Duration disabled: `flyTo` already applied the view and emitted `flyend`.
      camera.emitGestureEnd();
      return;
    }
    flyFrame = requestFrame(flyTick);
  }

  function flyTick(): void {
    flyFrame = null;
    if (camera.tick(now())) {
      flyFrame = requestFrame(flyTick);
      return;
    }
    camera.emitGestureEnd();
  }

  // ---------------------------------------------------------- context menu ---

  function onContextMenu(e: GestureMouseEvent): void {
    e.preventDefault?.();
    const p = localPoint(e);
    if (!finite(p)) return;
    opts.onContextMenu?.({
      screenX: p.x,
      screenY: p.y,
      pixel: camera.screenToPixel(p.x, p.y),
    });
  }

  // ------------------------------------------------------------- plumbing ---

  const bound: { type: string; listener: (ev: never) => void }[] = [];

  function listen<E>(
    type: string,
    handler: (e: E) => void,
    options?: { passive?: boolean },
  ): void {
    // One cast for the whole file: the structural event interfaces above are
    // what the handlers actually need, and `GestureTarget` accepts any handler.
    const listener = handler as unknown as (ev: never) => void;
    el.addEventListener(type, listener, options);
    bound.push({ type, listener });
  }

  listen<GesturePointerEvent>("pointerdown", onPointerDown);
  listen<GesturePointerEvent>("pointermove", onPointerMove);
  listen<GesturePointerEvent>("pointerup", onPointerUp);
  listen<GesturePointerEvent>("pointercancel", onPointerCancel);
  // Not passive: wheel-zoom must stop the page from scrolling.
  listen<GestureWheelEvent>("wheel", onWheel, { passive: false });
  listen<GestureMouseEvent>("contextmenu", onContextMenu);

  return function detach(): void {
    for (const { type, listener } of bound) el.removeEventListener(type, listener);
    bound.length = 0;
    stopInertia();
    stopWheel();
    stopFly();
    pointers.clear();
    samples = [];
    dragId = null;
    pinching = false;
    pressed = null;
    lastTap = null;
    moved = false;
  };
}
