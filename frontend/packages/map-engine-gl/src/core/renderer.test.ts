import { describe, expect, it, vi } from "vitest";
import { Group, OrthographicCamera, Scene, Vector3 } from "three";
import { Camera } from "./camera.ts";
import {
  LayerOrder,
  MapRenderer,
  type MapRendererOptions,
  type RenderFrameContext,
  type RenderLayer,
} from "./renderer.ts";

/**
 * The GL backend is injected, so these tests exercise the real scheduler, the
 * real projection math and the real layer bookkeeping without a WebGL context.
 * Frames are a queue the test drains by hand — that is the only way to assert
 * the binding requirement "idle schedules nothing".
 */
function harness(over: Partial<MapRendererOptions> = {}) {
  const queue: (() => void)[] = [];
  const requestFrame = vi.fn((cb: () => void) => {
    queue.push(cb);
    return queue.length;
  });
  const cancelFrame = vi.fn();
  const backend = {
    setPixelRatio: vi.fn<(dpr: number) => void>(),
    setSize: vi.fn<(w: number, h: number, updateStyle?: boolean) => void>(),
    render: vi.fn<(scene: Scene, camera: OrthographicCamera) => void>(),
    dispose: vi.fn<() => void>(),
  };
  let clock = 0;
  const camera = new Camera({
    mapWidthPx: 8192,
    mapHeightPx: 8192,
    minZoom: -3,
    maxZoom: 2,
    viewportWidth: 1200,
    viewportHeight: 800,
    center: { x: 4096, y: 4096 },
    zoom: 0,
  });
  const renderer = new MapRenderer({
    camera,
    createBackend: () => backend,
    requestFrame,
    cancelFrame,
    now: () => clock,
    width: 1200,
    height: 800,
    devicePixelRatio: 1,
    ...over,
  });

  /** Run queued frames (bounded: an animating camera keeps refilling the queue). */
  function flush(limit = 200): number {
    let ran = 0;
    while (queue.length > 0 && ran < limit) {
      const cb = queue.shift();
      ran++;
      cb?.();
    }
    return ran;
  }

  return {
    camera,
    renderer,
    backend,
    requestFrame,
    cancelFrame,
    queue,
    flush,
    advance(ms: number) {
      clock += ms;
    },
  };
}

function stubLayer(order: number) {
  return {
    object3D: new Group(),
    order,
    update: vi.fn<(camera: Camera, ctx: RenderFrameContext) => void>(),
    dispose: vi.fn<() => void>(),
  };
}

describe("MapRenderer scheduling (render-on-demand)", () => {
  it("paints once on mount and then requests nothing", () => {
    const h = harness();
    expect(h.requestFrame).toHaveBeenCalledTimes(1);
    h.flush();
    expect(h.backend.render).toHaveBeenCalledTimes(1);
    // The binding requirement: idle = 0 fps.
    expect(h.requestFrame).toHaveBeenCalledTimes(1);
    expect(h.renderer.isFramePending()).toBe(false);
  });

  it("coalesces many invalidations into one frame and one render", () => {
    const h = harness();
    h.flush();
    h.renderer.invalidate();
    h.renderer.invalidate();
    h.renderer.invalidate();
    expect(h.requestFrame).toHaveBeenCalledTimes(2);
    h.flush();
    expect(h.backend.render).toHaveBeenCalledTimes(2);
  });

  it("repaints on camera change and stays quiet afterwards", () => {
    const h = harness();
    h.flush();
    h.camera.panBy(120, 0);
    expect(h.renderer.isFramePending()).toBe(true);
    h.flush();
    expect(h.backend.render).toHaveBeenCalledTimes(2);
    expect(h.renderer.isFramePending()).toBe(false);
  });

  it("a frame with nothing dirty renders nothing", () => {
    const h = harness();
    h.flush();
    // Force a frame without dirt (what a stray external schedule would do).
    h.renderer.invalidate();
    h.renderer.render(); // clears the dirty flag itself
    expect(h.backend.render).toHaveBeenCalledTimes(2);
    h.flush();
    expect(h.backend.render).toHaveBeenCalledTimes(2);
  });

  it("keeps scheduling when the frame source hands out handle 0", () => {
    // A frame handle of 0 is legitimate; the scheduler must not treat it as
    // "a frame is pending" forever.
    const queue: (() => void)[] = [];
    const h = harness({
      requestFrame: (cb) => {
        queue.push(cb);
        return 0;
      },
    });
    expect(queue).toHaveLength(1);
    queue.shift()?.();
    expect(h.renderer.isFramePending()).toBe(false);
    h.renderer.invalidate();
    expect(queue).toHaveLength(1);
    queue.shift()?.();
    expect(h.backend.render).toHaveBeenCalledTimes(2);
  });

  it("throws instead of wedging when there is no frame source at all", () => {
    // Precondition: this is the node test environment, with no global rAF.
    expect(typeof requestAnimationFrame).toBe("undefined");
    expect(
      () =>
        new MapRenderer({
          camera: new Camera({
            mapWidthPx: 100,
            mapHeightPx: 100,
            minZoom: 0,
            maxZoom: 0,
            viewportWidth: 10,
            viewportHeight: 10,
          }),
          createBackend: () => ({
            setPixelRatio: () => {},
            setSize: () => {},
            render: () => {},
            dispose: () => {},
          }),
        }),
    ).toThrow(/requestFrame/);
  });

  it("skips the draw entirely while the viewport is degenerate", () => {
    const h = harness({ width: 0, height: 0 });
    h.flush();
    // A 0×0 frustum would divide by zero and fill the projection with NaN.
    expect(h.backend.render).not.toHaveBeenCalled();
    expect(Number.isFinite(h.renderer.projectionCamera.projectionMatrix.elements[0])).toBe(
      true,
    );
    h.renderer.setSize(800, 600);
    h.flush();
    expect(h.backend.render).toHaveBeenCalledTimes(1);
  });

  it("drives a fly animation from its own loop, then stops", () => {
    const h = harness();
    h.flush();
    const renders = h.backend.render.mock.calls.length;

    h.camera.flyTo({ x: 5000, y: 5000 }, 1, 0.5);
    // `flyTo` alone emits no `change`, so the loop must be kick-started by the
    // caller — the React layer does this; here it stands in for that call.
    h.renderer.invalidate();

    let frames = 0;
    for (let t = 0; t < 40 && h.queue.length > 0; t++) {
      h.advance(25);
      frames += h.flush(1);
    }
    expect(frames).toBeGreaterThan(5);
    expect(h.camera.zoom).toBe(1);
    expect(h.camera.center).toEqual({ x: 5000, y: 5000 });
    expect(h.backend.render.mock.calls.length).toBeGreaterThan(renders + 5);
    // Animation over → nothing pending.
    expect(h.renderer.isFramePending()).toBe(false);
  });
});

describe("MapRenderer projection (y-down)", () => {
  it("flips the frustum so larger map y is lower on screen", () => {
    const h = harness();
    h.flush();
    const cam = h.renderer.projectionCamera;
    expect(cam).toBeInstanceOf(OrthographicCamera);
    expect(cam.top).toBeLessThan(cam.bottom);
  });

  it("projects map pixels exactly where camera.pixelToScreen says", () => {
    const h = harness();
    h.camera.setView({ x: 4096, y: 4096 }, -1);
    h.flush();
    const cam = h.renderer.projectionCamera;

    for (const p of [
      { x: 4096, y: 4096 },
      { x: 4096 + 100, y: 4096 - 200 },
      { x: 0, y: 0 },
      { x: 8192, y: 8192 },
    ]) {
      const ndc = new Vector3(p.x, p.y, 0).project(cam);
      // Standard viewport transform, y down (canvas top-left origin).
      const screen = {
        x: ((ndc.x + 1) / 2) * h.renderer.viewportWidth,
        y: ((1 - ndc.y) / 2) * h.renderer.viewportHeight,
      };
      const expected = h.camera.pixelToScreen(p.x, p.y);
      expect(screen.x).toBeCloseTo(expected.x, 6);
      expect(screen.y).toBeCloseTo(expected.y, 6);
    }
  });
});

describe("MapRenderer layers", () => {
  it("attaches layers sorted by order and stamps renderOrder", () => {
    const h = harness();
    const markers = stubLayer(LayerOrder.markers);
    const tiles = stubLayer(LayerOrder.tiles);
    const vectors = stubLayer(LayerOrder.vectors);
    h.renderer.addLayer(markers);
    h.renderer.addLayer(tiles);
    h.renderer.addLayer(vectors);
    h.flush();

    expect(h.renderer.sceneRoot.children).toEqual([
      tiles.object3D,
      vectors.object3D,
      markers.object3D,
    ]);
    expect(tiles.object3D.renderOrder).toBe(LayerOrder.tiles);
    expect(vectors.object3D.renderOrder).toBe(LayerOrder.vectors);
    expect(markers.object3D.renderOrder).toBe(LayerOrder.markers);
    expect(h.renderer.scene).toBeInstanceOf(Scene);
    expect(h.renderer.scene.children).toEqual([h.renderer.sceneRoot]);
  });

  it("updates every layer with the camera and the frame context", () => {
    const h = harness({ devicePixelRatio: 2 });
    const layer = stubLayer(LayerOrder.tiles);
    h.renderer.addLayer(layer);
    h.flush();
    expect(layer.update).toHaveBeenCalledWith(h.camera, { pixelRatio: 2 });
    const calls = layer.update.mock.calls.length;
    h.camera.panBy(50, 50);
    h.flush();
    expect(layer.update.mock.calls.length).toBe(calls + 1);
  });

  it("hands every layer of one frame the same context", () => {
    const seen: unknown[] = [];
    const h = harness();
    const a = stubLayer(LayerOrder.tiles);
    const b = stubLayer(LayerOrder.markers);
    a.update.mockImplementation((_c, ctx) => {
      seen.push(ctx);
    });
    b.update.mockImplementation((_c, ctx) => {
      seen.push(ctx);
    });
    h.renderer.addLayer(a);
    h.renderer.addLayer(b);
    h.flush();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("reports the live pixel ratio through the frame context", () => {
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { defaultView: { devicePixelRatio: 1 } },
    };
    const emits: ((w: number, h: number) => void)[] = [];
    const h = harness({
      devicePixelRatio: undefined,
      canvas,
      observeSize: (cb) => {
        emits.push(cb);
        return () => {};
      },
    });
    const layer = stubLayer(LayerOrder.markers);
    h.renderer.addLayer(layer);
    h.flush();
    expect(layer.update).toHaveBeenLastCalledWith(h.camera, { pixelRatio: 1 });

    // The window moved to a 2x panel: the observer fires and the ratio follows,
    // so an atlas composed at DPR can recompose.
    canvas.ownerDocument.defaultView.devicePixelRatio = 2;
    emits[0](1200, 801);
    h.flush();
    expect(h.renderer.pixelRatioUsed).toBe(2);
    expect(layer.update).toHaveBeenLastCalledWith(h.camera, { pixelRatio: 2 });
  });

  it("lets a layer request a follow-up frame from its update", () => {
    const h = harness();
    let pending = 2;
    const layer: RenderLayer = {
      object3D: new Group(),
      order: LayerOrder.tiles,
      update: () => {
        if (pending-- > 0) h.renderer.invalidate();
      },
      dispose: () => {},
    };
    h.renderer.addLayer(layer);
    const frames = h.flush();
    // Mount frame + the two follow-ups the layer asked for, then silence.
    expect(frames).toBe(3);
    expect(h.renderer.isFramePending()).toBe(false);
  });

  it("removeLayer detaches without disposing; dispose disposes", () => {
    const h = harness();
    const a = stubLayer(LayerOrder.tiles);
    const b = stubLayer(LayerOrder.markers);
    h.renderer.addLayer(a);
    h.renderer.addLayer(b);
    h.flush();

    h.renderer.removeLayer(a);
    expect(a.dispose).not.toHaveBeenCalled();
    expect(h.renderer.sceneRoot.children).toEqual([b.object3D]);
    h.flush();
    h.renderer.dispose();
    expect(a.dispose).not.toHaveBeenCalled();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("MapRenderer size + pixel ratio", () => {
  it("caps the pixel ratio at 2", () => {
    const h = harness({ devicePixelRatio: 3 });
    expect(h.backend.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(h.renderer.pixelRatioUsed).toBe(2);
  });

  it("re-reads the canvas DPR on resize (monitor change), still capped", () => {
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { defaultView: { devicePixelRatio: 1 } },
    };
    const emits: ((w: number, h: number) => void)[] = [];
    const h = harness({
      devicePixelRatio: undefined,
      canvas,
      observeSize: (cb) => {
        emits.push(cb);
        return () => {};
      },
    });
    expect(h.renderer.pixelRatioUsed).toBe(1);

    canvas.ownerDocument.defaultView.devicePixelRatio = 3;
    emits[0](1200, 800); // same CSS size, new ratio
    expect(h.backend.setPixelRatio).toHaveBeenLastCalledWith(2); // cap holds
    expect(h.renderer.pixelRatioUsed).toBe(2);

    canvas.ownerDocument.defaultView.devicePixelRatio = 1.5;
    emits[0](1200, 800);
    expect(h.renderer.pixelRatioUsed).toBe(1.5);
  });

  it("keeps an explicitly pinned pixel ratio across resizes", () => {
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { defaultView: { devicePixelRatio: 1 } },
    };
    const emits: ((w: number, h: number) => void)[] = [];
    const h = harness({
      devicePixelRatio: 1,
      canvas,
      observeSize: (cb) => {
        emits.push(cb);
        return () => {};
      },
    });
    canvas.ownerDocument.defaultView.devicePixelRatio = 2;
    emits[0](640, 480);
    expect(h.renderer.pixelRatioUsed).toBe(1);
  });

  it("reads the pixel ratio from the canvas' own window", () => {
    const h = harness({
      devicePixelRatio: undefined,
      canvas: {
        width: 0,
        height: 0,
        ownerDocument: { defaultView: { devicePixelRatio: 1.5 } },
      },
    });
    expect(h.renderer.pixelRatioUsed).toBe(1.5);
  });

  it("setSize resizes the backend and the camera viewport together", () => {
    const h = harness();
    h.flush();
    h.renderer.setSize(640, 480);
    expect(h.backend.setSize).toHaveBeenLastCalledWith(640, 480, false);
    expect(h.camera.viewportWidth).toBe(640);
    expect(h.camera.viewportHeight).toBe(480);
    expect(h.renderer.isFramePending()).toBe(true);
    h.flush();
    // The projection follows the new viewport.
    expect(h.renderer.projectionCamera.right).toBeCloseTo(320, 9);
  });

  it("ignores a no-op resize and invalid sizes", () => {
    const h = harness();
    h.flush();
    const sizes = h.backend.setSize.mock.calls.length;
    h.renderer.setSize(1200, 800);
    h.renderer.setSize(Number.NaN, -5);
    expect(h.backend.setSize.mock.calls.length).toBe(sizes);
    expect(h.renderer.isFramePending()).toBe(false);
  });

  it("wires an injected size observer and unsubscribes on dispose", () => {
    const unobserve = vi.fn();
    const emits: ((w: number, h: number) => void)[] = [];
    const h = harness({
      observeSize: (cb) => {
        emits.push(cb);
        return unobserve;
      },
    });
    h.flush();
    expect(emits).toHaveLength(1);
    emits[0](500, 250);
    expect(h.camera.viewportWidth).toBe(500);
    expect(h.camera.viewportHeight).toBe(250);
    h.renderer.dispose();
    expect(unobserve).toHaveBeenCalledTimes(1);
  });
});

describe("MapRenderer teardown", () => {
  it("cancels the pending frame, unsubscribes the camera and disposes the backend", () => {
    const h = harness();
    expect(h.renderer.isFramePending()).toBe(true);
    h.renderer.dispose();
    expect(h.cancelFrame).toHaveBeenCalledTimes(1);
    expect(h.backend.dispose).toHaveBeenCalledTimes(1);
    expect(h.renderer.isDisposed).toBe(true);

    const requests = h.requestFrame.mock.calls.length;
    h.camera.panBy(100, 100);
    h.renderer.invalidate();
    h.renderer.setSize(300, 300);
    expect(h.requestFrame.mock.calls.length).toBe(requests);
    // A frame already queued before dispose must not render either.
    h.flush();
    expect(h.backend.render).not.toHaveBeenCalled();
  });

  it("is idempotent", () => {
    const h = harness();
    h.renderer.dispose();
    h.renderer.dispose();
    expect(h.backend.dispose).toHaveBeenCalledTimes(1);
  });
});
