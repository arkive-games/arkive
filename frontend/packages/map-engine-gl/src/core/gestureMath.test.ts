import { describe, expect, it } from "vitest";
import { Camera } from "./camera.ts";
import {
  accumulateWheelTarget,
  centerDeltaForDrag,
  centerForZoomAround,
  clampZoom,
  DEFAULT_WHEEL_SENSITIVITY,
  DOUBLE_CLICK_ZOOM_DELTA,
  DOUBLE_CLICK_ZOOM_SECONDS,
  distanceBetween,
  hasInertia,
  INERTIA_STOP_SPEED,
  INERTIA_TAU_MS,
  inertiaStep,
  isDoubleTap,
  isTap,
  lerpZoom,
  midpointOf,
  MIN_PINCH_DISTANCE_PX,
  normalizeWheelDelta,
  pinchUpdate,
  pushSample,
  speedOf,
  VELOCITY_WINDOW_MS,
  velocityFrom,
  WHEEL_IDLE_MS,
  WHEEL_LERP,
  wheelLerpFactor,
  WHEEL_SETTLE_EPSILON,
  WHEEL_ZOOM_FACTOR,
  wheelTargetDelta,
  type PointerSample,
} from "./gestureMath.ts";

describe("centerDeltaForDrag", () => {
  it("negates the content movement (the engine's only pan sign flip)", () => {
    expect(centerDeltaForDrag({ x: 30, y: -12 })).toEqual({ x: -30, y: 12 });
  });

  it("degenerates a non-finite delta to no movement", () => {
    expect(centerDeltaForDrag({ x: Number.NaN, y: 5 })).toEqual({ x: 0, y: -5 });
  });
});

describe("pointer sampling", () => {
  it("keeps only the trailing window, and always the newest sample", () => {
    let s: readonly PointerSample[] = [];
    for (const t of [0, 40, 80, 120, 160]) s = pushSample(s, { x: t, y: 0, t });
    // Window 100 ms ending at 160 → 80/120/160 (60 is older than the window).
    expect(s.map((p) => p.t)).toEqual([80, 120, 160]);

    // A long pause collapses the history: nothing else is within the window.
    s = pushSample(s, { x: 160, y: 0, t: 900 });
    expect(s.map((p) => p.t)).toEqual([900]);
  });

  it("documents its window as 100 ms", () => {
    expect(VELOCITY_WINDOW_MS).toBe(100);
  });

  it("ignores non-finite samples", () => {
    const input = [{ x: 0, y: 0, t: 0 }];
    const s = pushSample(input, { x: Number.NaN, y: 0, t: 10 });
    expect(s).toBe(input); // no allocation for a sample that changes nothing
  });

  it("averages velocity over the window in px/ms", () => {
    const s = [
      { x: 0, y: 0, t: 1000 },
      { x: 60, y: -30, t: 1020 },
      { x: 100, y: -50, t: 1050 },
    ];
    expect(velocityFrom(s)).toEqual({ x: 2, y: -1 });
  });

  it("reports no velocity without two distinct timestamps", () => {
    expect(velocityFrom([])).toEqual({ x: 0, y: 0 });
    expect(velocityFrom([{ x: 0, y: 0, t: 5 }])).toEqual({ x: 0, y: 0 });
    expect(
      velocityFrom([
        { x: 0, y: 0, t: 5 },
        { x: 90, y: 0, t: 5 },
      ]),
    ).toEqual({ x: 0, y: 0 });
  });

  it("holding still before release cancels the fling", () => {
    // The drag itself was fast (2 px/ms)...
    let s: readonly PointerSample[] = [];
    s = pushSample(s, { x: 0, y: 0, t: 1000 });
    s = pushSample(s, { x: 100, y: 0, t: 1050 });
    expect(hasInertia(velocityFrom(s))).toBe(true);
    // ...but the finger rested at the same spot for 200 ms before lifting.
    s = pushSample(s, { x: 100, y: 0, t: 1250 });
    expect(velocityFrom(s)).toEqual({ x: 0, y: 0 });
    expect(hasInertia(velocityFrom(s))).toBe(false);
  });
});

describe("inertia decay", () => {
  it("decays geometrically and stops after a finite number of frames", () => {
    let v = { x: 2, y: -1 }; // ~2.24 px/ms, a fast flick
    let travelled = 0;
    let steps = 0;
    let lastOffset = Number.POSITIVE_INFINITY;
    while (hasInertia(v) && steps < 1000) {
      const step = inertiaStep(v, 16.7);
      const size = speedOf(step.offset);
      expect(size).toBeLessThan(lastOffset); // monotonically shorter hops
      lastOffset = size;
      expect(speedOf(step.velocity)).toBeLessThan(speedOf(v));
      travelled += size;
      v = step.velocity;
      steps++;
    }
    expect(hasInertia(v)).toBe(false);
    // 120 ms time constant → total coast ≈ v0 × τ, minus the tail below the
    // stop threshold. ~34 frames at 60 Hz.
    const ideal = speedOf({ x: 2, y: -1 }) * INERTIA_TAU_MS;
    expect(travelled).toBeLessThan(ideal);
    expect(travelled).toBeGreaterThan(ideal * 0.98);
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(100);
  });

  it("is frame-rate independent: same distance at 30 and 144 Hz", () => {
    function coast(dt: number): number {
      let v = { x: 1.5, y: 0 };
      let d = 0;
      for (let i = 0; i < 5000 && hasInertia(v); i++) {
        const step = inertiaStep(v, dt);
        d += step.offset.x;
        v = step.velocity;
      }
      return d;
    }
    // Both integrate the same exponential; only the last sub-threshold hop differs.
    expect(coast(33.3)).toBeCloseTo(coast(6.9), 0);
  });

  it("treats a zero/negative/non-finite step as a no-op", () => {
    for (const dt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const step = inertiaStep({ x: 2, y: 2 }, dt);
      expect(step.offset).toEqual({ x: 0, y: 0 });
      expect(step.velocity).toEqual({ x: 2, y: 2 });
    }
  });

  it("stops dead for a non-positive time constant, and sanitizes velocity", () => {
    expect(inertiaStep({ x: 2, y: 2 }, 16, 0)).toEqual({
      offset: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    });
    expect(inertiaStep({ x: Number.NaN, y: 2 }, 16).offset.x).toBe(0);
  });

  it("has a stop threshold below one pixel per frame", () => {
    expect(INERTIA_STOP_SPEED * 16.7).toBeLessThan(1);
    expect(hasInertia({ x: 0, y: 0 })).toBe(false);
    expect(hasInertia({ x: INERTIA_STOP_SPEED, y: 0 })).toBe(false);
    expect(hasInertia({ x: INERTIA_STOP_SPEED * 2, y: 0 })).toBe(true);
  });
});

describe("pinch", () => {
  it("doubling the finger distance is +1 zoom, halving is −1", () => {
    const spread = pinchUpdate(
      { x: 500, y: 400 },
      { x: 700, y: 400 },
      { x: 400, y: 400 },
      { x: 800, y: 400 },
    );
    expect(spread?.dz).toBeCloseTo(1, 12);
    const squeeze = pinchUpdate(
      { x: 400, y: 400 },
      { x: 800, y: 400 },
      { x: 500, y: 400 },
      { x: 700, y: 400 },
    );
    expect(squeeze?.dz).toBeCloseTo(-1, 12);
  });

  it("anchors on the new midpoint and pans by the midpoint's movement", () => {
    const u = pinchUpdate(
      { x: 500, y: 400 },
      { x: 700, y: 400 },
      { x: 600, y: 500 },
      { x: 900, y: 500 },
    );
    // Midpoint 600,400 → 750,500.
    expect(u?.anchor).toEqual({ x: 750, y: 500 });
    expect(u?.centerDelta).toEqual({ x: -150, y: -100 });
    expect(u?.dz).toBeCloseTo(Math.log2(300 / 200), 12);
  });

  it("two fingers moving in parallel is a pure pan (dz 0)", () => {
    const u = pinchUpdate(
      { x: 500, y: 400 },
      { x: 700, y: 400 },
      { x: 520, y: 400 },
      { x: 720, y: 400 },
    );
    expect(u?.dz).toBe(0);
    expect(u?.centerDelta).toEqual({ x: -20, y: 0 });
  });

  it("guards degenerate distances instead of emitting a huge dz", () => {
    const collapsed = pinchUpdate(
      { x: 600, y: 400 },
      { x: 600, y: 400 },
      { x: 400, y: 400 },
      { x: 800, y: 400 },
    );
    // log2(400 / 0) would be +Infinity → a full-range zoom jump.
    expect(collapsed?.dz).toBe(0);
    expect(collapsed?.centerDelta).toEqual({ x: 0, y: 0 });

    const nearlyCollapsed = pinchUpdate(
      { x: 600, y: 400 },
      { x: 600 + MIN_PINCH_DISTANCE_PX / 2, y: 400 },
      { x: 400, y: 400 },
      { x: 800, y: 400 },
    );
    expect(nearlyCollapsed?.dz).toBe(0);
  });

  it("returns null for non-finite coordinates", () => {
    expect(
      pinchUpdate(
        { x: 500, y: 400 },
        { x: Number.NaN, y: 400 },
        { x: 400, y: 400 },
        { x: 800, y: 400 },
      ),
    ).toBeNull();
  });

  it("has straightforward distance/midpoint helpers", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distanceBetween({ x: 0, y: Number.NaN }, { x: 3, y: 4 })).toBe(0);
    expect(midpointOf({ x: 0, y: 10 }, { x: 4, y: 20 })).toEqual({ x: 2, y: 15 });
  });
});

describe("wheel zoom (Leaflet port)", () => {
  it("normalizes wheel deltas like L.DomEvent.getWheelDelta", () => {
    expect(normalizeWheelDelta(100, 0, 2)).toBe(-50); // pixels, DPR 1
    expect(normalizeWheelDelta(100, 0, 4)).toBe(-25); // pixels, DPR 2
    expect(normalizeWheelDelta(-3, 1)).toBe(60); // lines
    expect(normalizeWheelDelta(-1, 2)).toBe(60); // pages
    expect(normalizeWheelDelta(100, 7)).toBe(0); // unknown mode
    expect(normalizeWheelDelta(Number.NaN, 0)).toBe(0);
    expect(normalizeWheelDelta(100, 0, 0)).toBe(-50); // bad factor → default
  });

  it("turns one wheel notch into the documented zoom step", () => {
    // 100 px notch at DPR 1 → delta 50 → 50 × 0.003 × 4 = 0.6 zoom levels.
    expect(DEFAULT_WHEEL_SENSITIVITY).toBe(4);
    expect(WHEEL_ZOOM_FACTOR).toBe(0.003);
    expect(wheelTargetDelta(normalizeWheelDelta(-100, 0, 2))).toBeCloseTo(0.6, 12);
    expect(wheelTargetDelta(normalizeWheelDelta(100, 0, 2))).toBeCloseTo(-0.6, 12);
  });

  it("scales linearly with sensitivity", () => {
    const base = wheelTargetDelta(50, 1);
    expect(wheelTargetDelta(50, 4)).toBeCloseTo(base * 4, 12);
    expect(wheelTargetDelta(50, 8)).toBeCloseTo(base * 8, 12);
    expect(wheelTargetDelta(50, Number.NaN)).toBeCloseTo(base * 4, 12); // default
    expect(wheelTargetDelta(Number.NaN, 4)).toBe(0);
  });

  it("accumulates a fixed wheel sequence into a clamped target zoom", () => {
    let target = 0;
    for (const delta of [50, 50, 50]) {
      target = accumulateWheelTarget(target, delta, 4, -3, 2);
    }
    expect(target).toBeCloseTo(1.8, 12);
    // A fourth notch would reach 2.4; the range clamp holds it at maxZoom so no
    // "zoom debt" builds up while scrolling against the limit.
    target = accumulateWheelTarget(target, 50, 4, -3, 2);
    expect(target).toBe(2);
    target = accumulateWheelTarget(target, 50, 4, -3, 2);
    expect(target).toBe(2);
    // ...and one notch back down responds immediately.
    expect(accumulateWheelTarget(target, -50, 4, -3, 2)).toBeCloseTo(1.4, 12);
  });

  it("survives a broken zoom range or target", () => {
    expect(accumulateWheelTarget(Number.NaN, 50, 4, -3, 2)).toBeCloseTo(0.6, 12);
    expect(accumulateWheelTarget(0, 50, 4, 2, -3)).toBeCloseTo(0.6, 12); // inverted
    expect(accumulateWheelTarget(0, 50, 4, Number.NaN, Number.NaN)).toBeCloseTo(0.6, 12);
  });

  it("interpolates 30% of the remaining gap per frame, monotonically", () => {
    expect(WHEEL_LERP).toBe(0.3);
    const target = 1.8;
    let z = 0;
    const seen: number[] = [];
    for (let frame = 0; frame < 40; frame++) {
      const next = lerpZoom(z, target);
      expect(next).toBeGreaterThan(z); // no stall
      expect(next).toBeLessThanOrEqual(target); // no overshoot
      z = next;
      seen.push(z);
      // Closed form: the gap shrinks by 0.7 every frame.
      expect(target - z).toBeCloseTo(target * Math.pow(1 - WHEEL_LERP, frame + 1), 12);
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    // ~12 frames of a 60 Hz idle window leaves ~1% of the gap.
    expect(target - seen[11]).toBeLessThan(target * 0.02);
    expect(z).toBeCloseTo(target, 5);
  });

  it("interpolates downward the same way", () => {
    let z = 2;
    for (let i = 0; i < 30; i++) {
      const next = lerpZoom(z, -1);
      expect(next).toBeLessThan(z);
      expect(next).toBeGreaterThanOrEqual(-1);
      z = next;
    }
    expect(z).toBeCloseTo(-1, 3);
  });

  it("clamps the interpolation factor and tolerates non-finite input", () => {
    expect(lerpZoom(0, 1, 0)).toBe(0);
    expect(lerpZoom(0, 1, 1)).toBe(1);
    expect(lerpZoom(0, 1, 5)).toBe(1);
    expect(lerpZoom(0, 1, -5)).toBe(0);
    expect(lerpZoom(0, 1, Number.NaN)).toBeCloseTo(0.3, 12);
    expect(lerpZoom(0.5, Number.NaN)).toBe(0.5);
    expect(lerpZoom(Number.NaN, 0.5)).toBe(0.5);
  });

  it("ends the gesture after 200 ms of wheel silence", () => {
    expect(WHEEL_IDLE_MS).toBe(200);
  });

  it("makes the glide frame-rate independent (Leaflet's flat 0.3 per frame is not)", () => {
    // At exactly 60 Hz the factor IS Leaflet's, so the ported feel is preserved.
    expect(wheelLerpFactor(1000 / 60)).toBeCloseTo(WHEEL_LERP, 12);
    // Two 120 Hz frames compose into one 60 Hz frame.
    const half = wheelLerpFactor(1000 / 120);
    expect((1 - half) ** 2).toBeCloseTo(1 - WHEEL_LERP, 12);
    // Same wall clock, wildly different refresh rates → same remaining gap.
    function glide(dt: number, ms: number): number {
      let z = 0;
      for (let t = 0; t < ms - 1e-9; t += dt) z = lerpZoom(z, 1.8, wheelLerpFactor(dt));
      return z;
    }
    expect(glide(1000 / 120, 100)).toBeCloseTo(glide(1000 / 60, 100), 9);
    expect(glide(1000 / 240, 100)).toBeCloseTo(glide(1000 / 60, 100), 9);
  });

  it("treats a zero/negative/non-finite frame as no progress", () => {
    for (const dt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(wheelLerpFactor(dt)).toBe(0);
    }
    expect(wheelLerpFactor(16, 1)).toBe(1); // a factor of 1 always lands
    expect(wheelLerpFactor(16, Number.NaN)).toBeCloseTo(wheelLerpFactor(16), 12);
    expect(wheelLerpFactor(16, 0.3, 0)).toBeCloseTo(0.3, 12); // broken reference
  });

  it("has a settle epsilon below a tenth of a pixel at the viewport edge", () => {
    // A zoom gap g moves a point 600 px from the centre by ~600 × ln2 × g px.
    expect(600 * Math.LN2 * WHEEL_SETTLE_EPSILON).toBeLessThan(0.1);
  });
});

describe("clampZoom", () => {
  it("clamps into range and leaves broken input alone", () => {
    expect(clampZoom(5, -3, 2)).toBe(2);
    expect(clampZoom(-9, -3, 2)).toBe(-3);
    expect(clampZoom(0.25, -3, 2)).toBe(0.25);
    expect(clampZoom(1, 2, -3)).toBe(1); // inverted range
    expect(clampZoom(Number.NaN, -3, 2)).toBeNaN();
    expect(clampZoom(9, Number.NaN, Number.NaN)).toBe(9);
  });
});

describe("double-click zoom", () => {
  it("is one zoom level over a quarter second", () => {
    expect(DOUBLE_CLICK_ZOOM_DELTA).toBe(1);
    expect(DOUBLE_CLICK_ZOOM_SECONDS).toBe(0.25);
  });

  it("recognizes a tap but not a drag or a long press", () => {
    const down = { x: 100, y: 100, t: 1000 };
    expect(isTap(down, { x: 103, y: 98, t: 1120 })).toBe(true);
    expect(isTap(down, { x: 140, y: 100, t: 1120 })).toBe(false); // dragged
    expect(isTap(down, { x: 100, y: 100, t: 1500 })).toBe(false); // held
    expect(isTap(down, { x: 100, y: 100, t: 900 })).toBe(false); // clock went back
  });

  it("recognizes a double tap only when close in time and space", () => {
    const first = { x: 100, y: 100, t: 1000 };
    expect(isDoubleTap(first, { x: 110, y: 105, t: 1150 })).toBe(true);
    expect(isDoubleTap(first, { x: 110, y: 105, t: 1500 })).toBe(false); // too slow
    expect(isDoubleTap(first, { x: 200, y: 100, t: 1150 })).toBe(false); // too far
  });

  it("centerForZoomAround matches Camera.zoomAround exactly", () => {
    for (const [anchorX, anchorY, dz] of [
      [750, 300, 1],
      [600, 400, 1],
      [200, 700, -1.5],
      [1100, 50, 0.25],
    ]) {
      const cam = new Camera({
        mapWidthPx: 8192,
        mapHeightPx: 8192,
        minZoom: -3,
        maxZoom: 2,
        viewportWidth: 1200,
        viewportHeight: 800,
        center: { x: 4096, y: 4096 },
        zoom: 0,
      });
      const anchor = { x: anchorX, y: anchorY };
      const predicted = centerForZoomAround(
        cam.center,
        cam.zoom,
        cam.viewportWidth,
        cam.viewportHeight,
        anchor,
        cam.zoom + dz,
      );
      cam.zoomAround(anchor, dz);
      expect(predicted.x).toBeCloseTo(cam.center.x, 9);
      expect(predicted.y).toBeCloseTo(cam.center.y, 9);
    }
  });

  // The bug this pins: an UNCLAMPED nextZoom solves the centre for a scale the
  // camera will refuse, so `flyTo` lands at the clamped zoom with a centre that
  // belongs to another one — a spurious pan on a gesture that should be inert.
  it("is NOT equivalent to zoomAround when nextZoom is out of range", () => {
    function cameraAtMax() {
      return new Camera({
        mapWidthPx: 8192,
        mapHeightPx: 8192,
        minZoom: -3,
        maxZoom: 2,
        viewportWidth: 1200,
        viewportHeight: 800,
        center: { x: 4096, y: 4096 },
        zoom: 2,
      });
    }
    const anchor = { x: 1100, y: 50 };
    const cam = cameraAtMax();
    const unclamped = centerForZoomAround(
      cam.center,
      cam.zoom,
      cam.viewportWidth,
      cam.viewportHeight,
      anchor,
      3, // camera.zoom + 1, past maxZoom
    );
    cam.zoomAround(anchor, 1); // the camera clamps the zoom first: nothing moves
    expect(cam.zoom).toBe(2);
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(unclamped.x).not.toBeCloseTo(4096, 0);
    expect(unclamped.y).not.toBeCloseTo(4096, 0);

    // Clamping first is what makes them agree — and reveals the gesture is inert.
    const nextZoom = clampZoom(2 + 1, cam.minZoom, cam.maxZoom);
    expect(nextZoom).toBe(cam.zoom);
    const clamped = centerForZoomAround(
      cam.center,
      cam.zoom,
      cam.viewportWidth,
      cam.viewportHeight,
      anchor,
      nextZoom,
    );
    expect(clamped).toEqual({ x: 4096, y: 4096 });
  });

  it("falls back to the current centre for non-finite input", () => {
    const center = { x: 10, y: 20 };
    expect(
      centerForZoomAround(center, 0, 1200, 800, { x: Number.NaN, y: 0 }, 1),
    ).toEqual(center);
    expect(centerForZoomAround(center, 0, 1200, 800, { x: 0, y: 0 }, Number.NaN)).toEqual(
      center,
    );
  });
});
