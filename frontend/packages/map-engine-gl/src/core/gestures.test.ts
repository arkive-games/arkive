import { describe, expect, it, vi } from "vitest";
import { Camera, type CameraOptions } from "./camera.ts";
import {
  centerForZoomAround,
  INERTIA_TAU_MS,
  WHEEL_SETTLE_EPSILON,
} from "./gestureMath.ts";
import {
  attachGestures,
  POINTER_STALE_MS,
  type GestureOptions,
  type GesturePointEvent,
  type GestureTarget,
} from "./gestures.ts";

/**
 * The gesture binding is exercised against a REAL {@link Camera} plus a stub
 * element, an injected clock, frame scheduler and timer — no DOM, no real time.
 * That is the whole point of the injection contract: the drag/pinch/wheel state
 * machine and every sign convention are verifiable, deterministically, in node.
 *
 * Tests speak ELEMENT-LOCAL coordinates; the harness adds the stub's bounding
 * rect offset before dispatching, so the local↔client conversion is covered too.
 *
 * `pump()` stands in for the renderer's render-on-demand loop, which is what
 * drives `camera.tick` for the double-tap zoom (this layer no longer does).
 */

/** One 60 Hz frame — the interval the wheel interpolation factor is defined for. */
const FRAME = 1000 / 60;

interface HarnessOptions {
  camera?: Partial<CameraOptions>;
  gestures?: GestureOptions;
  rect?: { left: number; top: number } | null;
}

function makeHarness(options: HarnessOptions = {}) {
  const rect = options.rect === undefined ? { left: 0, top: 0 } : options.rect;
  const listeners = new Map<string, Set<(ev: never) => void>>();
  const registrations: { type: string; options: unknown }[] = [];
  const captured: number[] = [];
  const released: number[] = [];

  let clock = 1000;
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const timers = new Map<number, { due: number; cb: () => void }>();

  const el: GestureTarget = {
    addEventListener(type, listener, opts) {
      registrations.push({ type, options: opts });
      const set = listeners.get(type) ?? new Set<(ev: never) => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    ...(rect ? { getBoundingClientRect: () => ({ left: rect.left, top: rect.top }) } : {}),
    setPointerCapture(id: number) {
      captured.push(id);
    },
    releasePointerCapture(id: number) {
      released.push(id);
    },
  };

  const camera = new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: 1200,
    viewportHeight: 800,
    center: { x: 4096, y: 4096 },
    zoom: 0,
    ...options.camera,
  });

  let gestureEnds = 0;
  let flyEnds = 0;
  camera.on("gestureend", () => gestureEnds++);
  camera.on("flyend", () => flyEnds++);
  const invalidate = vi.fn();
  const taps: GesturePointEvent[] = [];

  const controller = attachGestures(el, camera, {
    now: () => clock,
    requestFrame: (cb) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    },
    cancelFrame: (handle) => {
      pending.delete(handle);
    },
    setTimer: (cb, ms) => {
      const handle = nextHandle++;
      timers.set(handle, { due: clock + ms, cb });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle);
    },
    invalidate,
    onTap: (e) => taps.push(e),
    // Pinned so the wheel maths is DPR-independent in tests (DPR 1 ⇒ 2).
    wheelPixelFactor: 2,
    ...options.gestures,
  });

  function dispatch(type: string, ev: unknown): void {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as unknown as (e: unknown) => void)(ev);
  }

  /** Advance the clock and fire every timer that came due, in order. */
  function tickClock(ms: number): void {
    clock += ms;
    for (;;) {
      let nextId: number | null = null;
      let next: { due: number; cb: () => void } | null = null;
      for (const [id, timer] of timers) {
        if (timer.due <= clock && (next === null || timer.due < next.due)) {
          nextId = id;
          next = timer;
        }
      }
      if (nextId === null || next === null) return;
      timers.delete(nextId);
      next.cb();
    }
  }

  const offsetX = rect?.left ?? 0;
  const offsetY = rect?.top ?? 0;

  return {
    el,
    camera,
    controller,
    detach: () => controller.detach(),
    captured,
    released,
    registrations,
    invalidate,
    taps,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    pendingFrames: () => pending.size,
    pendingTimers: () => timers.size,
    gestureEnds: () => gestureEnds,
    flyEnds: () => flyEnds,
    now: () => clock,
    advance(ms: number) {
      tickClock(ms);
    },
    /** Advance the clock, then run exactly one generation of scheduled frames. */
    frame(dtMs = FRAME) {
      tickClock(dtMs);
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) cb();
    },
    /** Run frames until nothing is scheduled; returns how many ran. */
    runFrames(dtMs = FRAME, max = 1000) {
      let n = 0;
      while (pending.size > 0 && n < max) {
        this.frame(dtMs);
        n++;
      }
      return n;
    },
    /** What the renderer does: advance time and tick a running camera animation. */
    pump(dtMs = FRAME) {
      tickClock(dtMs);
      if (camera.isAnimating()) camera.tick(clock);
    },
    pumpUntilDone(dtMs = FRAME, max = 1000) {
      let n = 0;
      while (camera.isAnimating() && n < max) {
        this.pump(dtMs);
        n++;
      }
      return n;
    },
    down(id: number, x: number, y: number, extra: Record<string, unknown> = {}) {
      dispatch("pointerdown", {
        pointerId: id,
        clientX: x + offsetX,
        clientY: y + offsetY,
        button: 0,
        ...extra,
      });
    },
    move(id: number, x: number, y: number, extra: Record<string, unknown> = {}) {
      dispatch("pointermove", {
        pointerId: id,
        clientX: x + offsetX,
        clientY: y + offsetY,
        ...extra,
      });
    },
    up(id: number, x: number, y: number) {
      dispatch("pointerup", {
        pointerId: id,
        clientX: x + offsetX,
        clientY: y + offsetY,
      });
    },
    cancel(id: number, x: number, y: number) {
      dispatch("pointercancel", {
        pointerId: id,
        clientX: x + offsetX,
        clientY: y + offsetY,
      });
    },
    lostCapture(id: number) {
      dispatch("lostpointercapture", { pointerId: id, clientX: 0, clientY: 0 });
    },
    wheel(x: number, y: number, deltaY: number, deltaMode = 0) {
      const preventDefault = vi.fn();
      dispatch("wheel", {
        clientX: x + offsetX,
        clientY: y + offsetY,
        deltaY,
        deltaMode,
        preventDefault,
      });
      return preventDefault;
    },
    contextmenu(x: number, y: number) {
      const preventDefault = vi.fn();
      dispatch("contextmenu", {
        clientX: x + offsetX,
        clientY: y + offsetY,
        preventDefault,
      });
      return preventDefault;
    },
    dispatch,
  };
}

/** A hard flick left: 150 px of content in 30 ms = 5 px/ms. */
function flickLeft(h: ReturnType<typeof makeHarness>): void {
  h.down(1, 600, 400);
  for (const x of [550, 500, 450]) {
    h.advance(10);
    h.move(1, x, 400);
  }
  h.up(1, 450, 400);
}

// `GestureTarget` is a structural subset for weapp portability — it must never
// stop accepting the DOM elements the React layer actually passes. These bodies
// are type-checked by `pnpm check` and never executed against a real DOM; if
// `attachGestures` needs a cast at a call site again, this file stops compiling.
describe("GestureTarget accepts DOM elements without a cast", () => {
  it("type-checks canvas / element / a non-DOM stub", () => {
    const onCanvas = (canvas: HTMLCanvasElement, cam: Camera) =>
      attachGestures(canvas, cam);
    const onElement = (element: HTMLElement, cam: Camera) => attachGestures(element, cam);
    // A host with no DOM at all and its own event shape stays valid too.
    const weappCanvas = {
      addEventListener(_type: string, _listener: (ev: { detail: number }) => void) {},
      removeEventListener(_type: string, _listener: (ev: { detail: number }) => void) {},
    } satisfies GestureTarget;
    const onWeapp = (cam: Camera) => attachGestures(weappCanvas, cam);

    expect([onCanvas, onElement, onWeapp].every((f) => typeof f === "function")).toBe(true);
  });
});

describe("drag pan", () => {
  it("moves the map the same direction as the finger", () => {
    const h = makeHarness();
    // The map point grabbed at the viewport centre.
    const grabbed = h.camera.screenToPixel(600, 400);
    expect(grabbed).toEqual({ x: 4096, y: 4096 });

    h.down(1, 600, 400);
    h.advance(16);
    h.move(1, 700, 450);

    // Finger right/down by (100, 50) at scale 1 → centre left/up by the same.
    expect(h.camera.center).toEqual({ x: 3996, y: 4046 });
    // The proof the sign is right: the grabbed pixel is still under the finger.
    const under = h.camera.pixelToScreen(grabbed.x, grabbed.y);
    expect(under.x).toBeCloseTo(700, 9);
    expect(under.y).toBeCloseTo(450, 9);
    // No gesture end until the finger lifts.
    expect(h.gestureEnds()).toBe(0);
  });

  it("scales the pan by the zoom (drag follows the finger at every zoom)", () => {
    for (const zoom of [-2, 0, 1.5]) {
      const h = makeHarness({ camera: { zoom } });
      const grabbed = h.camera.screenToPixel(500, 300);
      h.down(1, 500, 300);
      h.advance(16);
      h.move(1, 560, 260);
      const under = h.camera.pixelToScreen(grabbed.x, grabbed.y);
      expect(under.x).toBeCloseTo(560, 6);
      expect(under.y).toBeCloseTo(260, 6);
    }
  });

  it("captures the pointer and releases it on lift", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    expect(h.captured).toEqual([1]);
    h.up(1, 600, 400);
    expect(h.released).toEqual([1]);
  });

  it("ignores right/middle button presses", () => {
    const h = makeHarness();
    h.down(1, 600, 400, { button: 2 });
    h.advance(16);
    h.move(1, 700, 400);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
    expect(h.captured).toEqual([]);
  });

  it("ignores moves from pointers it never saw go down", () => {
    const h = makeHarness();
    h.move(9, 700, 400);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
  });

  it("stays silent for a click that never moved the map", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    h.advance(20);
    h.up(1, 600, 400);
    expect(h.gestureEnds()).toBe(0);
    expect(h.pendingFrames()).toBe(0);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
  });

  // `moved` is observed from the camera, not from "we asked it to pan", so a drag
  // the clamp swallowed must not report a view change that never happened.
  it("stays silent for a drag the centre clamp swallowed", () => {
    const h = makeHarness({ camera: { center: { x: 0, y: 4096 } } });
    h.down(1, 600, 400);
    h.advance(16);
    h.move(1, 700, 400); // pushes the centre further left, into the clamp
    expect(h.camera.center).toEqual({ x: 0, y: 4096 });
    h.up(1, 700, 400);
    expect(h.gestureEnds()).toBe(0);
  });

  it("ends the gesture immediately when the release has no velocity", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    h.advance(16);
    h.move(1, 500, 400);
    // The finger rests for 250 ms before lifting: no fling.
    h.advance(250);
    h.up(1, 500, 400);
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(1);
    expect(h.camera.center).toEqual({ x: 4196, y: 4096 });
  });
});

describe("drag inertia", () => {
  it("coasts in the drag direction, monotonically, then ends once", () => {
    const h = makeHarness();
    flickLeft(h);
    expect(h.camera.center.x).toBe(4246);
    expect(h.pendingFrames()).toBe(1);
    expect(h.gestureEnds()).toBe(0);

    const seen: number[] = [h.camera.center.x];
    let frames = 0;
    while (h.pendingFrames() > 0 && frames < 500) {
      h.frame(16);
      seen.push(h.camera.center.x);
      frames++;
    }
    expect(frames).toBeGreaterThan(10);
    expect(frames).toBeLessThan(100);
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // monotonic
    // Total coast ≈ v0 × τ = 5 px/ms × 120 ms = 600 px, minus the tail.
    expect(h.camera.center.x - 4246).toBeGreaterThan(570);
    expect(h.camera.center.x - 4246).toBeLessThan(600);
    expect(h.camera.center.y).toBe(4096);
    expect(h.gestureEnds()).toBe(1);
    expect(h.pendingFrames()).toBe(0);
  });

  it("coasts the same distance at 30 and 120 Hz", () => {
    const slow = makeHarness();
    flickLeft(slow);
    slow.runFrames(32);
    const fast = makeHarness();
    flickLeft(fast);
    fast.runFrames(8);
    expect(slow.camera.center.x).toBeCloseTo(fast.camera.center.x, 0);
  });

  it("caps one frame's step so a background-tab stall cannot teleport the map", () => {
    const h = makeHarness();
    flickLeft(h);
    const before = h.camera.center.x;
    // 5 s between frames: integrating that would coast the full 600 px at once.
    h.frame(5000);
    const capped = 5 * INERTIA_TAU_MS * (1 - Math.exp(-64 / INERTIA_TAU_MS));
    expect(h.camera.center.x - before).toBeCloseTo(capped, 6);
    expect(h.camera.center.x - before).toBeLessThan(260);
  });

  it("treats a clock that went backwards as a zero-length frame", () => {
    const h = makeHarness();
    flickLeft(h);
    const before = h.camera.center.x;
    h.frame(-100);
    expect(h.camera.center.x).toBe(before);
    expect(h.pendingFrames()).toBe(1); // still coasting, not aborted
  });

  it("is cancelled by the next pointerdown, without a stray gesture end", () => {
    const h = makeHarness();
    flickLeft(h);
    h.frame(16);
    const stopped = h.camera.center.x;
    expect(h.pendingFrames()).toBe(1);

    h.down(2, 600, 400);
    expect(h.pendingFrames()).toBe(0);
    h.frame(16);
    expect(h.camera.center.x).toBe(stopped);
    expect(h.gestureEnds()).toBe(0);
  });

  it("does not fling on pointercancel, but still ends the gesture", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    for (const x of [550, 500, 450]) {
      h.advance(10);
      h.move(1, x, 400);
    }
    h.cancel(1, 450, 400);
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(1);
  });
});

describe("pinch", () => {
  it("zooms toward the midpoint while panning with it", () => {
    const h = makeHarness();
    // Fingers 200 px apart, midpoint at the viewport centre.
    const anchored = h.camera.screenToPixel(600, 400);
    h.down(1, 500, 400);
    h.down(2, 700, 400);
    h.advance(16);
    // Spread to 400 px AND shift the midpoint right by 100.
    h.move(2, 900, 400);

    expect(h.camera.zoom).toBeCloseTo(1, 12);
    expect(h.camera.center).toEqual({ x: 4046, y: 4096 });
    // The map point under the old midpoint is under the new midpoint (700, 400).
    const under = h.camera.pixelToScreen(anchored.x, anchored.y);
    expect(under.x).toBeCloseTo(700, 9);
    expect(under.y).toBeCloseTo(400, 9);
    expect(h.gestureEnds()).toBe(0);
  });

  it("pinching in zooms out", () => {
    const h = makeHarness();
    h.down(1, 400, 400);
    h.down(2, 800, 400);
    h.advance(16);
    h.move(2, 600, 400);
    expect(h.camera.zoom).toBeCloseTo(-1, 12);
  });

  it("ignores a third finger", () => {
    const h = makeHarness();
    h.down(1, 500, 400);
    h.down(2, 700, 400);
    h.down(3, 300, 700);
    expect(h.captured).toEqual([1, 2]);
    h.advance(16);
    h.move(3, 100, 700); // not part of the gesture
    expect(h.camera.zoom).toBe(0);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
  });

  it("hands back to a one-finger drag without a jump", () => {
    const h = makeHarness();
    h.down(1, 500, 400);
    h.down(2, 700, 400);
    h.advance(16);
    h.move(2, 900, 400);
    expect(h.camera.zoom).toBeCloseTo(1, 12);

    h.advance(16);
    h.up(2, 900, 400);
    const centerAtHandoff = h.camera.center;
    const grabbed = h.camera.screenToPixel(500, 400);

    h.advance(16);
    h.move(1, 530, 400);
    // Exactly the surviving finger's own delta / scale — nothing jumps to the
    // released finger's last position.
    expect(h.camera.center.x).toBeCloseTo(centerAtHandoff.x - 30 / 2, 9);
    expect(h.camera.center.y).toBe(centerAtHandoff.y);
    const under = h.camera.pixelToScreen(grabbed.x, grabbed.y);
    expect(under.x).toBeCloseTo(530, 9);
  });

  it("never flings when the pinch is released", () => {
    const h = makeHarness();
    h.down(1, 500, 400);
    h.down(2, 700, 400);
    for (const x of [750, 800, 850]) {
      h.advance(10);
      h.move(2, x, 400);
    }
    h.advance(10);
    h.up(2, 850, 400);
    h.advance(10);
    h.up(1, 500, 400);
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(1);
  });
});

describe("smooth wheel zoom", () => {
  it("glides toward the accumulated target and lands on it after 200 ms idle", () => {
    const h = makeHarness();
    const anchorPx = h.camera.screenToPixel(700, 300);

    // One 100 px notch up at DPR 1 → +0.6 zoom target.
    const prevented = h.wheel(700, 300, -100);
    expect(prevented).toHaveBeenCalledTimes(1);
    expect(h.camera.zoom).toBe(0); // nothing until the first frame
    expect(h.pendingFrames()).toBe(1);

    h.frame(FRAME);
    expect(h.camera.zoom).toBeCloseTo(0.18, 12); // 30% of the gap at 60 Hz
    h.frame(FRAME);
    expect(h.camera.zoom).toBeCloseTo(0.306, 12);
    expect(h.gestureEnds()).toBe(0);

    // 200 ms of silence: the idle deadline snaps to the exact target and ends.
    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(0.6, 12);
    expect(h.gestureEnds()).toBe(1);
    expect(h.pendingFrames()).toBe(0);
    expect(h.pendingTimers()).toBe(0);

    // Zoomed toward the cursor: the anchored pixel never left it.
    const under = h.camera.pixelToScreen(anchorPx.x, anchorPx.y);
    expect(under.x).toBeCloseTo(700, 6);
    expect(under.y).toBeCloseTo(300, 6);
  });

  it("accumulates further notches into the same gesture", () => {
    const h = makeHarness();
    h.wheel(700, 300, -100);
    h.frame(FRAME);
    h.wheel(700, 300, -100);
    h.wheel(700, 300, -100);
    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(1.8, 12);
    expect(h.gestureEnds()).toBe(1);
  });

  it("scrolls down to zoom out, clamped to minZoom", () => {
    const h = makeHarness();
    for (let i = 0; i < 20; i++) h.wheel(600, 400, 100);
    h.advance(200);
    expect(h.camera.zoom).toBe(-3);
    expect(h.gestureEnds()).toBe(1);
  });

  it("respects the sensitivity option", () => {
    const h = makeHarness({ gestures: { sensitivity: 8 } });
    h.wheel(700, 300, -100);
    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(1.2, 12);
  });

  it("starts a fresh gesture after the idle timeout", () => {
    const h = makeHarness();
    h.wheel(600, 400, -100);
    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(0.6, 12);
    h.wheel(600, 400, -100);
    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(1.2, 12);
    expect(h.gestureEnds()).toBe(2);
  });

  it("glides at the same rate per unit of time at 60 and 120 Hz", () => {
    const slow = makeHarness();
    slow.wheel(700, 300, -100);
    for (let i = 0; i < 5; i++) slow.frame(FRAME);
    const fast = makeHarness();
    fast.wheel(700, 300, -100);
    for (let i = 0; i < 10; i++) fast.frame(FRAME / 2);
    expect(fast.camera.zoom).toBeCloseTo(slow.camera.zoom, 9);
    // ...and both are still mid-glide (the idle deadline has not fired).
    expect(slow.camera.zoom).toBeLessThan(0.6);
    expect(slow.camera.zoom).toBeGreaterThan(0.4);
  });

  // Every frame is a full GL repaint, so the loop must stop once the remaining
  // gap is invisible instead of spinning until the idle deadline.
  it("stops asking for frames once converged, and still ends on the deadline", () => {
    const h = makeHarness();
    h.wheel(700, 300, -0.2); // a tiny trackpad nudge: target ≈ 0.0012
    const frames = h.runFrames(FRAME, 200);
    expect(frames).toBeLessThan(12); // fewer than the 200 ms window holds
    expect(Math.abs(0.0012 - h.camera.zoom)).toBeLessThanOrEqual(WHEEL_SETTLE_EPSILON);
    expect(h.controller.isGesturing()).toBe(true); // not over yet
    expect(h.gestureEnds()).toBe(0);

    h.advance(200);
    expect(h.camera.zoom).toBeCloseTo(0.0012, 12);
    expect(h.controller.isGesturing()).toBe(false);
    expect(h.gestureEnds()).toBe(1);
  });

  it("registers the wheel listener as non-passive so it can preventDefault", () => {
    const h = makeHarness();
    const wheel = h.registrations.find((r) => r.type === "wheel");
    expect(wheel?.options).toEqual({ passive: false });
  });

  it("wheeling mid-drag is one burst: no gesture end while a pointer is down", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    h.advance(16);
    h.move(1, 700, 400);
    expect(h.camera.center.x).toBe(3996);

    h.wheel(700, 300, -100);
    h.runFrames(FRAME, 5);
    h.advance(200); // the wheel deadline fires with the finger still down
    expect(h.camera.zoom).toBeCloseTo(0.6, 12);
    expect(h.gestureEnds()).toBe(0);

    h.advance(200);
    h.up(1, 700, 400);
    expect(h.gestureEnds()).toBe(1);
  });
});

describe("double-tap zoom", () => {
  function doubleTap(h: ReturnType<typeof makeHarness>, x = 700, y = 300): void {
    h.down(1, x, y);
    h.advance(50);
    h.up(1, x, y);
    h.advance(100);
    h.down(1, x, y);
    h.advance(50);
    h.up(1, x, y);
  }

  it("zooms +1 toward the tapped point, animated by the frame owner", () => {
    const h = makeHarness();
    const anchorPx = h.camera.screenToPixel(700, 300);
    const expected = centerForZoomAround(
      h.camera.center,
      h.camera.zoom,
      h.camera.viewportWidth,
      h.camera.viewportHeight,
      { x: 700, y: 300 },
      1,
    );
    expect(expected).toEqual({ x: 4146, y: 4046 });

    doubleTap(h);

    // Animated, not instant — and this layer runs no loop of its own: it asks
    // the host to pump instead.
    expect(h.camera.isAnimating()).toBe(true);
    expect(h.camera.zoom).toBe(0);
    expect(h.pendingFrames()).toBe(0);
    expect(h.invalidate).toHaveBeenCalledTimes(1);

    const pumps = h.pumpUntilDone(25);
    expect(pumps).toBeGreaterThan(5); // ~0.25 s at 25 ms/frame
    expect(h.camera.zoom).toBe(1);
    expect(h.camera.center.x).toBeCloseTo(expected.x, 9);
    expect(h.camera.center.y).toBeCloseTo(expected.y, 9);
    const under = h.camera.pixelToScreen(anchorPx.x, anchorPx.y);
    expect(under.x).toBeCloseTo(700, 6);
    expect(under.y).toBeCloseTo(300, 6);
    // Reported through `flyend` only — no duplicate notification.
    expect(h.flyEnds()).toBe(1);
    expect(h.gestureEnds()).toBe(0);
  });

  // The bug: an unclamped target zoom solved a centre for a scale the camera
  // refuses, so a double-tap at the zoom limit slid the map sideways.
  it("does nothing at maxZoom", () => {
    const h = makeHarness({ camera: { zoom: 2 } });
    doubleTap(h, 1100, 50);
    expect(h.camera.zoom).toBe(2);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.flyEnds()).toBe(0);
    expect(h.gestureEnds()).toBe(0);
    expect(h.pendingFrames()).toBe(0);
  });

  it("does nothing at minZoom with a negative zoomDelta", () => {
    const h = makeHarness({ camera: { zoom: -3 }, gestures: { zoomDelta: -1 } });
    doubleTap(h, 1100, 50);
    expect(h.camera.zoom).toBe(-3);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.gestureEnds()).toBe(0);
  });

  it("clamps a step that overshoots the limit, keeping the anchor honest", () => {
    const h = makeHarness({ camera: { zoom: 1.75 } });
    const anchorPx = h.camera.screenToPixel(700, 300);
    doubleTap(h);
    h.pumpUntilDone(25);
    expect(h.camera.zoom).toBe(2); // 1.75 + 1 clamped
    const under = h.camera.pixelToScreen(anchorPx.x, anchorPx.y);
    expect(under.x).toBeCloseTo(700, 6);
    expect(under.y).toBeCloseTo(300, 6);
  });

  it("needs two quick taps at the same spot", () => {
    // Too slow.
    const slow = makeHarness();
    slow.down(1, 700, 300);
    slow.advance(50);
    slow.up(1, 700, 300);
    slow.advance(500);
    slow.down(1, 700, 300);
    slow.advance(50);
    slow.up(1, 700, 300);
    expect(slow.camera.isAnimating()).toBe(false);
    expect(slow.camera.zoom).toBe(0);

    // Too far apart.
    const far = makeHarness();
    far.down(1, 700, 300);
    far.advance(50);
    far.up(1, 700, 300);
    far.advance(100);
    far.down(1, 700, 500);
    far.advance(50);
    far.up(1, 700, 500);
    expect(far.camera.isAnimating()).toBe(false);

    // Second press dragged → not a tap at all.
    const dragged = makeHarness();
    dragged.down(1, 700, 300);
    dragged.advance(50);
    dragged.up(1, 700, 300);
    dragged.advance(100);
    dragged.down(1, 700, 300);
    dragged.advance(50);
    dragged.move(1, 640, 300);
    dragged.up(1, 640, 300);
    expect(dragged.camera.isAnimating()).toBe(false);
    expect(dragged.camera.zoom).toBe(0);
  });

  it("honours a custom zoomDelta", () => {
    const h = makeHarness({ gestures: { zoomDelta: 0.25 } });
    doubleTap(h, 600, 400);
    h.pumpUntilDone(25);
    expect(h.camera.zoom).toBe(0.25);
  });

  it("is not started by a pinch release", () => {
    const h = makeHarness();
    h.down(1, 500, 400);
    h.down(2, 700, 400);
    h.advance(20);
    h.up(2, 700, 400);
    h.advance(20);
    h.up(1, 500, 400);
    h.advance(50);
    h.down(1, 500, 400);
    h.advance(20);
    h.up(1, 500, 400);
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.camera.zoom).toBe(0);
  });
});

describe("taking over camera animations", () => {
  it("a pointerdown cancels an in-flight flyTo (dragging during a fly wins)", () => {
    const h = makeHarness();
    h.camera.flyTo({ x: 8000, y: 200 }, 2, 1);
    h.camera.tick(h.now());
    expect(h.camera.isAnimating()).toBe(true);

    h.down(1, 600, 400);
    expect(h.camera.isAnimating()).toBe(false);
    h.advance(16);
    h.move(1, 700, 400);
    expect(h.camera.center.x).toBeLessThan(4096); // the drag, not the fly
    expect(h.flyEnds()).toBe(0);
  });

  it("a wheel cancels an in-flight flyTo", () => {
    const h = makeHarness();
    h.camera.flyTo({ x: 8000, y: 200 }, 2, 1);
    h.camera.tick(h.now());
    h.wheel(600, 400, -100);
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.flyEnds()).toBe(0);
  });

  it("reports exactly one gesture end for a wheel glide cut short by a click", () => {
    const h = makeHarness();
    h.wheel(600, 400, -100);
    h.frame(FRAME);
    expect(h.camera.zoom).toBeGreaterThan(0);

    h.down(1, 600, 400); // interrupts the glide — nothing reported yet
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(0);
    h.advance(20);
    h.up(1, 600, 400); // a plain click, but the view did change: report it once
    expect(h.gestureEnds()).toBe(1);
  });

  // An interrupted double-tap zoom leaves the camera mid-flight; that view must
  // still reach the host, or the persisted view keeps the pre-zoom value.
  it("reports the view change of a double-tap zoom interrupted mid-flight", () => {
    const h = makeHarness();
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    h.advance(100);
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    expect(h.camera.isAnimating()).toBe(true);

    h.pump(25);
    h.pump(25);
    const interrupted = h.camera.zoom;
    expect(interrupted).toBeGreaterThan(0);
    expect(interrupted).toBeLessThan(1);

    h.down(1, 700, 300);
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.gestureEnds()).toBe(0);
    expect(h.flyEnds()).toBe(0);

    h.advance(20);
    h.up(1, 700, 300);
    // The half-finished zoom is where the map stands, and it is reported once.
    expect(h.camera.zoom).toBe(interrupted);
    expect(h.gestureEnds()).toBe(1);
  });
});

describe("lost pointers", () => {
  it("reclaims a pointer whose capture was lost, so the next drag is clean", () => {
    const h = makeHarness();
    h.down(11, 600, 400);
    h.advance(16);
    h.move(11, 500, 400);
    expect(h.camera.center.x).toBe(4196);

    // The `pointerup` never arrives; only the implicit capture release does.
    h.lostCapture(11);
    expect(h.controller.isGesturing()).toBe(false);
    expect(h.gestureEnds()).toBe(1);

    // A fresh finger (new id, as touch always does) is a plain drag, not a pinch.
    h.advance(16);
    h.down(12, 600, 400);
    h.advance(16);
    h.move(12, 700, 400);
    expect(h.camera.zoom).toBe(0);
    expect(h.camera.center.x).toBe(4096);
  });

  it("sweeps a pointer gone silent for too long when the next press arrives", () => {
    const h = makeHarness();
    h.down(11, 600, 400);
    h.advance(16);
    h.move(11, 500, 400); // 100 px of pan
    expect(h.camera.center.x).toBe(4196);
    // No pointerup, no lostpointercapture, no further events: a ghost.

    h.advance(POINTER_STALE_MS + 1);
    h.down(12, 600, 400);
    expect(h.controller.isGesturing()).toBe(true);
    h.advance(16);
    h.move(12, 700, 400);
    // A one-finger drag: the centre moves by the finger delta and zoom is intact.
    expect(h.camera.zoom).toBe(0);
    expect(h.camera.center.x).toBe(4096);
    h.advance(250); // rest before lifting, so no fling muddies the assertion
    h.up(12, 700, 400);
    // One report covers both the ghost's pan and this drag's.
    expect(h.gestureEnds()).toBe(1);
    expect(h.controller.isGesturing()).toBe(false);
  });

  it("reclaims a mouse pointer that reports no buttons held", () => {
    const h = makeHarness();
    h.down(1, 600, 400, { buttons: 1 });
    h.advance(16);
    h.move(1, 500, 400, { buttons: 1 });
    expect(h.camera.center.x).toBe(4196);

    // The button was released outside the element: do not keep panning.
    h.advance(16);
    h.move(1, 300, 400, { buttons: 0 });
    expect(h.camera.center.x).toBe(4196);
    expect(h.controller.isGesturing()).toBe(false);
    expect(h.gestureEnds()).toBe(1);

    h.advance(16);
    h.move(1, 100, 400, { buttons: 0 });
    expect(h.camera.center.x).toBe(4196);
  });

  it("treats a repeated pointerdown id as a re-press, not a second finger", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    h.advance(16);
    h.down(1, 500, 400);
    h.advance(16);
    h.move(1, 600, 400);
    expect(h.camera.zoom).toBe(0); // no pinch
    expect(h.camera.center.x).toBe(3996); // +100 relative to the re-press
  });

  it("does not wedge after two lost pointers", () => {
    const h = makeHarness();
    h.down(11, 500, 400);
    h.down(12, 700, 400);
    h.advance(POINTER_STALE_MS + 1);
    // Both ghosts would otherwise block every future press.
    h.down(13, 600, 400);
    expect(h.controller.isGesturing()).toBe(true);
    h.advance(16);
    h.move(13, 700, 400);
    expect(h.camera.zoom).toBe(0);
    expect(h.camera.center.x).toBe(3996);
  });
});

describe("isGesturing", () => {
  it("tracks pointer, fling and wheel activity", () => {
    const h = makeHarness();
    expect(h.controller.isGesturing()).toBe(false);

    h.down(1, 600, 400);
    expect(h.controller.isGesturing()).toBe(true);
    h.advance(16);
    h.move(1, 550, 400);
    h.advance(250); // rest before lifting: no fling
    h.up(1, 550, 400);
    expect(h.controller.isGesturing()).toBe(false);

    flickLeft(h);
    expect(h.controller.isGesturing()).toBe(true); // coasting
    h.runFrames(16);
    expect(h.controller.isGesturing()).toBe(false);

    h.wheel(600, 400, -100);
    expect(h.controller.isGesturing()).toBe(true);
    h.advance(200);
    expect(h.controller.isGesturing()).toBe(false);
  });
});

describe("tap passthrough", () => {
  it("reports a tap with screen and pixel coordinates", () => {
    const h = makeHarness({ rect: { left: 20, top: 10 } });
    h.down(1, 700, 300);
    h.advance(40);
    h.up(1, 700, 300);
    expect(h.taps).toHaveLength(1);
    expect(h.taps[0].screenX).toBe(700);
    expect(h.taps[0].screenY).toBe(300);
    expect(h.taps[0].pixel).toEqual({ x: 4196, y: 3996 });
  });

  it("does not report a drag, a long press or a pinch as a tap", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    h.advance(16);
    h.move(1, 500, 400);
    h.up(1, 500, 400);

    h.down(1, 600, 400);
    h.advance(500);
    h.up(1, 600, 400);

    h.down(1, 500, 400);
    h.down(2, 700, 400);
    h.advance(20);
    h.up(2, 700, 400);
    h.up(1, 500, 400);
    expect(h.taps).toEqual([]);
  });

  it("reports only the FIRST tap of a double tap (the second is the zoom)", () => {
    const h = makeHarness();
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    h.advance(100);
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    expect(h.taps).toHaveLength(1);
    expect(h.camera.isAnimating()).toBe(true);
  });
});

describe("context menu", () => {
  it("prevents the default menu and reports screen + pixel coordinates", () => {
    const seen: GesturePointEvent[] = [];
    // A non-zero element rect: the payload must be element-local, not client.
    const h = makeHarness({
      rect: { left: 20, top: 10 },
      gestures: { onContextMenu: (e) => seen.push(e) },
    });
    const prevented = h.contextmenu(700, 300);
    expect(prevented).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].screenX).toBe(700);
    expect(seen[0].screenY).toBe(300);
    expect(seen[0].pixel).toEqual(h.camera.screenToPixel(700, 300));
    expect(seen[0].pixel).toEqual({ x: 4196, y: 3996 });
  });

  it("still prevents the default menu without a callback", () => {
    const h = makeHarness();
    expect(h.contextmenu(700, 300)).toHaveBeenCalledTimes(1);
  });

  it("treats event coordinates as element-local when there is no rect", () => {
    const seen: GesturePointEvent[] = [];
    const h = makeHarness({
      rect: null,
      gestures: { onContextMenu: (e) => seen.push(e) },
    });
    h.contextmenu(700, 300);
    expect(seen[0].screenX).toBe(700);
  });
});

describe("detach", () => {
  it("removes every listener", () => {
    const h = makeHarness();
    expect(h.listenerCount()).toBe(7);
    h.detach();
    expect(h.listenerCount()).toBe(0);

    h.down(1, 600, 400);
    h.move(1, 700, 400);
    h.wheel(600, 400, -100);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
    expect(h.camera.zoom).toBe(0);
    expect(h.pendingFrames()).toBe(0);
  });

  it("unsubscribes from the camera", () => {
    const h = makeHarness();
    h.detach();
    // A camera change after detach must not be able to emit anything later.
    h.camera.panBy(100, 0);
    expect(h.gestureEnds()).toBe(0);
  });

  it("cancels a running inertia animation", () => {
    const h = makeHarness();
    flickLeft(h);
    expect(h.pendingFrames()).toBe(1);
    h.detach();
    expect(h.pendingFrames()).toBe(0);
    const settled = h.camera.center.x;
    h.frame(16);
    expect(h.camera.center.x).toBe(settled);
  });

  it("cancels a running wheel glide and its idle deadline", () => {
    const h = makeHarness();
    h.wheel(600, 400, -100);
    expect(h.pendingFrames()).toBe(1);
    expect(h.pendingTimers()).toBe(1);
    h.detach();
    expect(h.pendingFrames()).toBe(0);
    expect(h.pendingTimers()).toBe(0);
    expect(h.controller.isGesturing()).toBe(false);
  });
});
