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
});

// GameMapMeta arrives over HTTP and the viewport from element measurement, so
// every constructor/setter input is normalized rather than trusted.
describe("Camera input hardening", () => {
  it("degenerates a non-finite map extent to 0 instead of NaN", () => {
    const cam = makeCamera({ mapWidthPx: Number.NaN, mapHeightPx: -100 });
    expect(cam.center).toEqual({ x: 0, y: 0 });
    expect(cam.pixelToScreen(0, 0)).toEqual({ x: 600, y: 400 });
  });

  it("normalizes a non-finite viewport and initial zoom", () => {
    const cam = makeCamera({
      viewportWidth: Number.NaN,
      viewportHeight: -10,
      zoom: Number.NaN,
    });
    expect(cam.viewportWidth).toBe(0);
    expect(cam.viewportHeight).toBe(0);
    expect(cam.zoom).toBe(-3);
  });

  it("keeps minZoom <= maxZoom even when passed swapped", () => {
    const cam = makeCamera({ minZoom: 2, maxZoom: -3, zoom: 5 });
    expect(cam.minZoom).toBe(-3);
    expect(cam.maxZoom).toBe(2);
    expect(cam.zoom).toBe(2);
  });

  it("ignores a non-finite viewport resize (no NaN projections, no event)", () => {
    const cam = makeCamera();
    let changes = 0;
    cam.on("change", () => changes++);
    cam.setViewport(Number.NaN, 600);
    expect(cam.viewportWidth).toBe(1200);
    expect(cam.viewportHeight).toBe(600);
    cam.setViewport(Number.NaN, Number.NaN);
    expect(changes).toBe(1);
    expect(cam.pixelToScreen(4096, 4096)).toEqual({ x: 600, y: 300 });
  });

  it("ignores a non-finite tick clock instead of teleporting", () => {
    const cam = makeCamera();
    cam.flyTo({ x: 6000, y: 2000 }, 1, 0.5);
    expect(cam.tick(Number.NaN)).toBe(true);
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(cam.zoom).toBe(0);
    // The animation is still pending and starts from the first finite tick.
    expect(cam.tick(1000)).toBe(true);
    expect(cam.tick(1500)).toBe(false);
    expect(cam.center).toEqual({ x: 6000, y: 2000 });
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

  it("setViewport changes the projection, emits change once, dedupes no-ops", () => {
    const cam = makeCamera();
    let changes = 0;
    cam.on("change", () => changes++);
    cam.setViewport(1400, 900);
    expect(cam.viewportWidth).toBe(1400);
    expect(cam.viewportHeight).toBe(900);
    expect(cam.pixelToScreen(4096, 4096)).toEqual({ x: 700, y: 450 });
    // The centre clamp is viewport-independent, so a resize never moves it.
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(changes).toBe(1);
    cam.setViewport(1400, 900);
    expect(changes).toBe(1);
  });
});

describe("Camera.visibleBounds", () => {
  it("is the on-screen pixel rect, y-down, optionally padded in map px", () => {
    const cam = makeCamera({ zoom: 0 });
    expect(cam.visibleBounds()).toEqual({
      minX: 4096 - 600,
      minY: 4096 - 400,
      maxX: 4096 + 600,
      maxY: 4096 + 400,
    });
    // At scale 0.5 the view covers twice as many map px; pad = one 1024px tile.
    const zoomedOut = makeCamera({ zoom: -1 });
    expect(zoomedOut.visibleBounds(1024)).toEqual({
      minX: 4096 - 1200 - 1024,
      minY: 4096 - 800 - 1024,
      maxX: 4096 + 1200 + 1024,
      maxY: 4096 + 800 + 1024,
    });
  });

  it("is not clipped to the map rect (overpan reports out-of-grid pixels)", () => {
    const cam = makeCamera({ zoom: 0, center: { x: 0, y: 0 } });
    const b = cam.visibleBounds();
    expect(b.minX).toBe(-600);
    expect(b.minY).toBe(-400);
  });

  it("treats a non-finite pad as no pad", () => {
    const cam = makeCamera({ zoom: 0 });
    expect(cam.visibleBounds(Number.NaN)).toEqual(cam.visibleBounds(0));
  });
});

describe("Camera.zoomToFit", () => {
  it("returns the zoom whose scale fits the tighter axis", () => {
    const cam = makeCamera(); // 1200×800 viewport
    // 2400 px wide → scale 0.5 → zoom -1; the height alone would allow scale 1.
    expect(cam.zoomToFit(2400, 800)).toBeCloseTo(-1, 12);
    expect(cam.zoomToFit(1200, 800)).toBeCloseTo(0, 12);
  });

  it("clamps into the zoom range", () => {
    const cam = makeCamera();
    // 8192 px in an 800 px viewport needs scale 0.098, below minZoom -3 (0.125).
    expect(cam.zoomToFit(8192, 8192)).toBe(-3);
    expect(cam.zoomToFit(4, 4)).toBe(2);
  });

  it("handles degenerate extents and viewports", () => {
    const cam = makeCamera();
    expect(cam.zoomToFit(0, 0)).toBe(2); // a single point: fit means zoom in
    expect(cam.zoomToFit(Number.NaN, Number.NaN)).toBe(2);
    const unmeasured = makeCamera({ viewportWidth: 0, viewportHeight: 0 });
    expect(unmeasured.zoomToFit(8192, 8192)).toBe(-3);
  });
});

describe("Camera.panBy", () => {
  it("moves the centre by delta / scale", () => {
    const cam = makeCamera({ zoom: 1 });
    cam.panBy(200, -100);
    expect(cam.center).toEqual({ x: 4096 + 100, y: 4096 - 50 });
  });

  it("stays clamped, and is therefore lossy at the edge", () => {
    const cam = makeCamera({ zoom: 0, center: { x: 10, y: 4096 } });
    cam.panBy(-500, 0);
    expect(cam.center.x).toBe(0);
    // Documented consequence: the reverse pan does not return to x=10, so a
    // gesture must replay from a captured start view instead of accumulating.
    cam.panBy(500, 0);
    expect(cam.center.x).toBe(500);
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

  it("lets the centre clamp win at the map edge (anchor drifts by design)", () => {
    const cam = makeCamera({ zoom: 0, center: { x: 30, y: 4096 } });
    const anchor = { x: 100, y: 400 };
    const before = cam.screenToPixel(anchor.x, anchor.y); // px = -470
    cam.zoomAround(anchor, 1);
    // Anchor preservation would need centre x = -220; the clamp wins instead.
    expect(cam.center.x).toBe(0);
    expect(cam.pixelToScreen(before.x, before.y).x).not.toBeCloseTo(anchor.x, 0);
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

    expect(cam.tick(1000)).toBe(true); // t = 0 → view unchanged
    expect(cam.center).toEqual({ x: 4096, y: 4096 });
    expect(cam.tick(1250)).toBe(true); // halfway → eased 0.5
    expect(cam.center.x).toBeCloseTo(4096 + (6000 - 4096) * 0.5, 6);
    expect(cam.tick(1400)).toBe(true);
    expect(cam.tick(1500)).toBe(false); // t = 1

    expect(cam.center).toEqual({ x: 6000, y: 2000 });
    expect(cam.zoom).toBe(1.5);
    expect(cam.isAnimating()).toBe(false);
    expect(flyends).toBe(1);
    // 3, not 4: the t=0 tick resolves to the identical view and is deduped.
    expect(changes.length).toBe(3);
    // Monotonic zoom ramp, no overshoot.
    expect(changes).toEqual([...changes].sort((a, b) => a - b));
  });

  it("applies instantly for a non-positive or non-finite duration", () => {
    for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cam = makeCamera();
      let flyends = 0;
      cam.on("flyend", () => flyends++);
      cam.flyTo({ x: 1000, y: 1000 }, 1, seconds);
      expect(cam.center).toEqual({ x: 1000, y: 1000 });
      expect(cam.zoom).toBe(1);
      // Crucially: nothing pending, so nothing keeps asking for frames.
      expect(cam.isAnimating()).toBe(false);
      expect(cam.tick(0)).toBe(false);
      expect(flyends).toBe(1);
    }
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

  // `change` schedules a GL repaint, so a mutation resolving to the current view
  // must stay silent (e.g. wheeling while already at maxZoom).
  it("does not emit change for no-op mutations", () => {
    const cam = makeCamera();
    let changes = 0;
    cam.on("change", () => changes++);

    cam.setView(cam.center, cam.zoom);
    cam.panBy(0, 0);
    expect(changes).toBe(0);

    cam.setView({ x: -1, y: -1 }, -99); // clamps to the top-left corner at minZoom
    expect(changes).toBe(1);
    cam.setView({ x: -2, y: -2 }, -99); // clamps to the same view again
    expect(changes).toBe(1);

    cam.setView(cam.center, 2);
    cam.zoomAround({ x: 600, y: 400 }, 1); // already at maxZoom, anchor centred
    expect(changes).toBe(2);
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

  it("notifies every listener of a multi-subscriber event", () => {
    const cam = makeCamera();
    const seen: string[] = [];
    cam.on("change", () => seen.push("a"));
    cam.on("change", () => seen.push("b"));
    cam.panBy(1, 1);
    expect(seen).toEqual(["a", "b"]);
  });

  it("removeAllListeners drops every subscription", () => {
    const cam = makeCamera();
    let changes = 0;
    let flyends = 0;
    let gestureEnds = 0;
    cam.on("change", () => changes++);
    cam.on("flyend", () => flyends++);
    cam.on("gestureend", () => gestureEnds++);

    cam.removeAllListeners();
    cam.panBy(10, 10);
    cam.flyTo({ x: 10, y: 10 }, 1, 0);
    cam.emitGestureEnd();
    expect([changes, flyends, gestureEnds]).toEqual([0, 0, 0]);
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
