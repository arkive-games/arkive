import { describe, expect, it, vi } from "vitest";
import { Camera, type CameraOptions } from "./camera.ts";
import { centerForZoomAround } from "./gestureMath.ts";
import {
  attachGestures,
  type GestureContextMenuEvent,
  type GestureOptions,
  type GestureTarget,
} from "./gestures.ts";

/**
 * The gesture binding is exercised against a REAL {@link Camera} plus a stub
 * element, an injected clock and an injected frame scheduler — no DOM, no timers.
 * That is the whole point of the injection contract: the drag/pinch/wheel state
 * machine and every sign convention are verifiable, deterministically, in node.
 *
 * Tests speak ELEMENT-LOCAL coordinates; the harness adds the stub's bounding
 * rect offset before dispatching, so the local↔client conversion is covered too.
 */

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

  const detach = attachGestures(el, camera, {
    now: () => clock,
    requestFrame: (cb) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    },
    cancelFrame: (handle) => {
      pending.delete(handle);
    },
    // Pinned so the wheel maths is DPR-independent in tests (DPR 1 ⇒ 2).
    wheelPixelFactor: 2,
    ...options.gestures,
  });

  function dispatch(type: string, ev: unknown): void {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as unknown as (e: unknown) => void)(ev);
  }

  const offsetX = rect?.left ?? 0;
  const offsetY = rect?.top ?? 0;

  return {
    el,
    camera,
    detach,
    captured,
    released,
    registrations,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    pendingFrames: () => pending.size,
    gestureEnds: () => gestureEnds,
    flyEnds: () => flyEnds,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
    /** Advance the clock, then run exactly one generation of scheduled frames. */
    frame(dtMs = 16) {
      clock += dtMs;
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) cb();
    },
    /** Run frames until nothing is scheduled; returns how many ran. */
    runFrames(dtMs = 16, max = 1000) {
      let n = 0;
      while (pending.size > 0 && n < max) {
        this.frame(dtMs);
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
    move(id: number, x: number, y: number) {
      dispatch("pointermove", {
        pointerId: id,
        clientX: x + offsetX,
        clientY: y + offsetY,
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
  function flick() {
    const h = makeHarness();
    h.down(1, 600, 400);
    for (const x of [550, 500, 450]) {
      h.advance(10);
      h.move(1, x, 400);
    }
    // 150 px of content in 30 ms = 5 px/ms leftward.
    expect(h.camera.center.x).toBe(4246);
    h.up(1, 450, 400);
    return h;
  }

  it("coasts in the drag direction, monotonically, then ends once", () => {
    const h = flick();
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

  it("is cancelled by the next pointerdown, without a stray gesture end", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    for (const x of [550, 500, 450]) {
      h.advance(10);
      h.move(1, x, 400);
    }
    h.up(1, 450, 400);
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

    h.frame(16);
    expect(h.camera.zoom).toBeCloseTo(0.18, 12); // 30% of the gap
    h.frame(16);
    expect(h.camera.zoom).toBeCloseTo(0.306, 12);
    expect(h.gestureEnds()).toBe(0);

    // 200 ms of silence: the final frame snaps to the exact target and ends.
    h.advance(200);
    h.frame(0);
    expect(h.camera.zoom).toBeCloseTo(0.6, 12);
    expect(h.gestureEnds()).toBe(1);
    expect(h.pendingFrames()).toBe(0);

    // Zoomed toward the cursor: the anchored pixel never left it.
    const under = h.camera.pixelToScreen(anchorPx.x, anchorPx.y);
    expect(under.x).toBeCloseTo(700, 6);
    expect(under.y).toBeCloseTo(300, 6);
  });

  it("accumulates further notches into the same gesture", () => {
    const h = makeHarness();
    h.wheel(700, 300, -100);
    h.frame(16);
    h.wheel(700, 300, -100);
    h.wheel(700, 300, -100);
    h.advance(200);
    h.frame(16);
    expect(h.camera.zoom).toBeCloseTo(1.8, 12);
    expect(h.gestureEnds()).toBe(1);
  });

  it("scrolls down to zoom out, clamped to minZoom", () => {
    const h = makeHarness();
    for (let i = 0; i < 20; i++) h.wheel(600, 400, 100);
    h.advance(200);
    h.frame(16);
    expect(h.camera.zoom).toBe(-3);
    expect(h.gestureEnds()).toBe(1);
  });

  it("respects the sensitivity option", () => {
    const h = makeHarness({ gestures: { sensitivity: 8 } });
    h.wheel(700, 300, -100);
    h.advance(200);
    h.frame(16);
    expect(h.camera.zoom).toBeCloseTo(1.2, 12);
  });

  it("starts a fresh gesture after the idle timeout", () => {
    const h = makeHarness();
    h.wheel(600, 400, -100);
    h.advance(200);
    h.runFrames(16);
    expect(h.camera.zoom).toBeCloseTo(0.6, 12);
    h.wheel(600, 400, -100);
    h.advance(200);
    h.runFrames(16);
    expect(h.camera.zoom).toBeCloseTo(1.2, 12);
    expect(h.gestureEnds()).toBe(2);
  });

  it("registers the wheel listener as non-passive so it can preventDefault", () => {
    const h = makeHarness();
    const wheel = h.registrations.find((r) => r.type === "wheel");
    expect(wheel?.options).toEqual({ passive: false });
  });
});

describe("double-tap zoom", () => {
  it("zooms +1 toward the tapped point, animated, ending once", () => {
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

    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    expect(h.camera.isAnimating()).toBe(false);
    h.advance(100);
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);

    // Animated, not instant.
    expect(h.camera.isAnimating()).toBe(true);
    expect(h.camera.zoom).toBe(0);
    expect(h.pendingFrames()).toBe(1);

    const frames = h.runFrames(25);
    expect(frames).toBeGreaterThan(5); // ~0.25 s at 25 ms/frame
    expect(h.camera.zoom).toBe(1);
    expect(h.camera.center.x).toBeCloseTo(expected.x, 9);
    expect(h.camera.center.y).toBeCloseTo(expected.y, 9);
    const under = h.camera.pixelToScreen(anchorPx.x, anchorPx.y);
    expect(under.x).toBeCloseTo(700, 6);
    expect(under.y).toBeCloseTo(300, 6);
    expect(h.gestureEnds()).toBe(1);
    expect(h.flyEnds()).toBe(1);
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
    h.down(1, 600, 400);
    h.advance(50);
    h.up(1, 600, 400);
    h.advance(100);
    h.down(1, 600, 400);
    h.advance(50);
    h.up(1, 600, 400);
    h.runFrames(25);
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
    h.frame(16);
    expect(h.camera.zoom).toBeGreaterThan(0);

    h.down(1, 600, 400); // interrupts the glide — nothing reported yet
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(0);
    h.advance(20);
    h.up(1, 600, 400); // a plain click, but the view did change: report it once
    expect(h.gestureEnds()).toBe(1);
  });

  it("a pointerdown during the double-tap zoom cancels it silently", () => {
    const h = makeHarness();
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    h.advance(100);
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    h.frame(25);
    expect(h.camera.isAnimating()).toBe(true);

    h.down(1, 700, 300);
    expect(h.camera.isAnimating()).toBe(false);
    expect(h.pendingFrames()).toBe(0);
    expect(h.gestureEnds()).toBe(0);
    expect(h.flyEnds()).toBe(0);
  });
});

describe("context menu", () => {
  it("prevents the default menu and reports screen + pixel coordinates", () => {
    const seen: GestureContextMenuEvent[] = [];
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
    const seen: GestureContextMenuEvent[] = [];
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
    expect(h.listenerCount()).toBe(6);
    h.detach();
    expect(h.listenerCount()).toBe(0);

    h.down(1, 600, 400);
    h.move(1, 700, 400);
    h.wheel(600, 400, -100);
    expect(h.camera.center).toEqual({ x: 4096, y: 4096 });
    expect(h.camera.zoom).toBe(0);
    expect(h.pendingFrames()).toBe(0);
  });

  it("cancels a running inertia animation", () => {
    const h = makeHarness();
    h.down(1, 600, 400);
    for (const x of [550, 500, 450]) {
      h.advance(10);
      h.move(1, x, 400);
    }
    h.up(1, 450, 400);
    expect(h.pendingFrames()).toBe(1);
    h.detach();
    expect(h.pendingFrames()).toBe(0);
    const settled = h.camera.center.x;
    h.frame(16);
    expect(h.camera.center.x).toBe(settled);
  });

  it("cancels a running wheel glide", () => {
    const h = makeHarness();
    h.wheel(600, 400, -100);
    expect(h.pendingFrames()).toBe(1);
    h.detach();
    expect(h.pendingFrames()).toBe(0);
  });

  it("cancels a running double-tap zoom loop", () => {
    const h = makeHarness();
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    h.advance(100);
    h.down(1, 700, 300);
    h.advance(50);
    h.up(1, 700, 300);
    expect(h.pendingFrames()).toBe(1);
    h.detach();
    expect(h.pendingFrames()).toBe(0);
  });
});
