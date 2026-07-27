import { describe, expect, it } from "vitest";
import { Camera, easeInOutCubic } from "./camera.ts";

// A palworld-shaped map: 8192² pixel grid, Leaflet's zoom range, 1200×800 view.
function makeCamera(over: Partial<ConstructorParameters<typeof Camera>[0]> = {}) {
  return new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: 1200,
    viewportHeight: 800,
    center: { x: 4096, y: 4096 },
    zoom: 0,
    ...over,
  });
}

describe("Camera state + clamping", () => {
  it("defaults to the whole-map centre at minZoom", () => {
    const cam = new Camera({
      mapWidthPx: 8192,
      mapHeightPx: 4096,
      minZoom: -3,
      maxZoom: 2,
      viewportWidth: 1000,
      viewportHeight: 500,
    });
    expect(cam.center).toEqual({ x: 4096, y: 2048 });
    expect(cam.zoom).toBe(-3);
    expect(cam.scale()).toBeCloseTo(0.125, 12);
  });

  it("clamps zoom to [minZoom, maxZoom]", () => {
    const cam = makeCamera();
    cam.setView(cam.center, 99);
    expect(cam.zoom).toBe(2);
    cam.setView(cam.center, -99);
    expect(cam.zoom).toBe(-3);
    cam.setView(cam.center, 1.25);
    expect(cam.zoom).toBe(1.25);
  });

  it("clamps the centre into the map rect (half-viewport overpan)", () => {
    const cam = makeCamera();
    cam.setView({ x: -5000, y: 99999 }, 0);
    expect(cam.center).toEqual({ x: 0, y: 8192 });
    // At the clamped corner exactly half the viewport is off-map.
    expect(cam.pixelToScreen(0, 8192)).toEqual({ x: 600, y: 400 });
  });

  it("falls back to the map centre for non-finite input", () => {
    const cam = makeCamera();
    cam.setView({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, Number.NaN);
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(cam.zoom).toBe(-3);
  });

  it("re-clamps on setViewport and emits change", () => {
    const cam = makeCamera();
    let changes = 0;
    cam.on("change", () => changes++);
    cam.setViewport(1400, 900);
    expect(cam.viewportWidth).toBe(1400);
    expect(cam.viewportHeight).toBe(900);
    expect(changes).toBe(1);
    cam.setViewport(1400, 900); // no-op, no event
    expect(changes).toBe(1);
  });
});

describe("Camera projection", () => {
  it("puts the centre at the viewport centre and scales by 2^zoom", () => {
    const cam = makeCamera({ zoom: 1 });
    expect(cam.pixelToScreen(4096, 4096)).toEqual({ x: 600, y: 400 });
    // +100 map px at scale 2 → +200 screen px, y down (no flip).
    expect(cam.pixelToScreen(4196, 4196)).toEqual({ x: 800, y: 600 });
  });

  it("screenToPixel ∘ pixelToScreen = identity across zooms", () => {
    for (const zoom of [-3, -1.25, 0, 0.5, 2]) {
      const cam = makeCamera({ zoom });
      for (const [px, py] of [
        [0, 0],
        [4096, 4096],
        [8192, 1234.5],
      ]) {
        const s = cam.pixelToScreen(px, py);
        const back = cam.screenToPixel(s.x, s.y);
        expect(back.x).toBeCloseTo(px, 9);
        expect(back.y).toBeCloseTo(py, 9);
      }
    }
  });
});

describe("Camera.panBy", () => {
  it("moves the centre by delta / scale", () => {
    const cam = makeCamera({ zoom: 1 });
    cam.panBy(200, -100);
    expect(cam.center).toEqual({ x: 4096 + 100, y: 4096 - 50 });
  });

  it("stays clamped", () => {
    const cam = makeCamera({ zoom: 0, center: { x: 10, y: 4096 } });
    cam.panBy(-500, 0);
    expect(cam.center.x).toBe(0);
  });
});

describe("Camera.zoomAround", () => {
  it("keeps the anchored map point under the same screen point", () => {
    for (const dz of [0.25, 1, -0.75, -2]) {
      const cam = makeCamera({ zoom: 0 });
      const anchor = { x: 750, y: 300 };
      const before = cam.screenToPixel(anchor.x, anchor.y);
      cam.zoomAround(anchor, dz);
      const after = cam.pixelToScreen(before.x, before.y);
      expect(after.x).toBeCloseTo(anchor.x, 6);
      expect(after.y).toBeCloseTo(anchor.y, 6);
      expect(cam.zoom).toBeCloseTo(dz, 12);
    }
  });

  it("respects the zoom clamp (anchor pinned at the clamped zoom)", () => {
    const cam = makeCamera({ zoom: 1.9 });
    const anchor = { x: 400, y: 500 };
    const before = cam.screenToPixel(anchor.x, anchor.y);
    cam.zoomAround(anchor, 5);
    expect(cam.zoom).toBe(2);
    const after = cam.pixelToScreen(before.x, before.y);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
  });
});

describe("Camera.flyTo", () => {
  it("eases to the target and lands exactly on it", () => {
    const cam = makeCamera({ zoom: 0 });
    const changes: number[] = [];
    cam.on("change", () => changes.push(cam.zoom));
    let flyends = 0;
    cam.on("flyend", () => flyends++);

    cam.flyTo({ x: 6000, y: 2000 }, 1.5, 0.5);
    expect(cam.isAnimating()).toBe(true);
    // Nothing moves until the first tick establishes the start time.
    expect(cam.center).toEqual({ x: 4096, y: 4096 });

    expect(cam.tick(1000)).toBe(true); // t = 0
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(cam.tick(1250)).toBe(true); // halfway → eased 0.5
    expect(cam.center.x).toBeCloseTo(4096 + (6000 - 4096) * 0.5, 6);
    expect(cam.tick(1400)).toBe(true);
    expect(cam.tick(1500)).toBe(false); // t = 1

    expect(cam.center).toEqual({ x: 6000, y: 2000 });
    expect(cam.zoom).toBe(1.5);
    expect(cam.isAnimating()).toBe(false);
    expect(flyends).toBe(1);
    expect(changes.length).toBe(4);
    // Monotonic zoom ramp, no overshoot.
    expect(changes).toEqual([...changes].sort((a, b) => a - b));
  });

  it("applies instantly for a non-positive duration", () => {
    const cam = makeCamera();
    let flyends = 0;
    cam.on("flyend", () => flyends++);
    cam.flyTo({ x: 1000, y: 1000 }, 1, 0);
    expect(cam.center).toEqual({ x: 1000, y: 1000 });
    expect(cam.zoom).toBe(1);
    expect(cam.isAnimating()).toBe(false);
    expect(flyends).toBe(1);
  });

  it("clamps the target so the landing view is the reported view", () => {
    const cam = makeCamera();
    cam.flyTo({ x: 99999, y: -5 }, 10, 0.2);
    cam.tick(0);
    cam.tick(500);
    expect(cam.center).toEqual({ x: 8192, y: 0 });
    expect(cam.zoom).toBe(2);
  });

  it("is cancelled by a user gesture and by cancelAnimation, without flyend", () => {
    const cam = makeCamera();
    let flyends = 0;
    cam.on("flyend", () => flyends++);

    cam.flyTo({ x: 6000, y: 2000 }, 1.5, 0.5);
    cam.tick(0);
    cam.panBy(10, 0); // user drag wins
    expect(cam.isAnimating()).toBe(false);
    expect(cam.tick(1000)).toBe(false);

    cam.flyTo({ x: 6000, y: 2000 }, 1.5, 0.5);
    expect(cam.cancelAnimation()).toBe(true);
    expect(cam.cancelAnimation()).toBe(false);
    expect(flyends).toBe(0);
  });
});

describe("Camera events", () => {
  it("supports on/off and only fires gestureend when asked", () => {
    const cam = makeCamera();
    let changes = 0;
    let gestureEnds = 0;
    const onChange = () => changes++;
    cam.on("change", onChange);
    cam.on("gestureend", () => gestureEnds++);

    cam.panBy(10, 10);
    expect(changes).toBe(1);
    expect(gestureEnds).toBe(0);

    cam.emitGestureEnd();
    expect(gestureEnds).toBe(1);
    expect(changes).toBe(1);

    cam.off("change", onChange);
    cam.panBy(10, 10);
    expect(changes).toBe(1);
  });

  it("tolerates a listener unsubscribing during emit", () => {
    const cam = makeCamera();
    let calls = 0;
    const once = () => {
      calls++;
      cam.off("change", once);
    };
    cam.on("change", once);
    cam.panBy(1, 1);
    cam.panBy(1, 1);
    expect(calls).toBe(1);
  });
});

describe("easeInOutCubic", () => {
  it("is pinned at the ends and symmetric about the midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
  });
});
