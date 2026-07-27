import { WebGLRenderer } from "three";
import type { RenderBackend } from "../core/renderer.ts";

/**
 * Where the React layer gets its GL backend from.
 *
 * The renderer takes an injectable {@link RenderBackend} but `GameMapView`
 * builds it itself, because `GameMapViewProps` must stay field-for-field
 * identical to the Leaflet engine's. Two things therefore live here instead of
 * in a prop:
 *
 *  1. **A graceful fallback.** Creating a `WebGLRenderer` throws where there is
 *     no GL context (jsdom, a browser with WebGL disabled or blocklisted, a
 *     crashed GPU process). Letting that escape would take the whole app down
 *     over a map; instead the view mounts with a no-op backend — chrome, status
 *     bar and coordinates all work, only the picture is missing.
 *  2. **A test seam.** {@link setRenderBackendFactory} lets the package's own
 *     component tests drive the real scheduler and the real layers with a
 *     recording backend, with no GL and no jsdom canvas noise. It is NOT part of
 *     the public barrel: tests import this module directly.
 */

export type RenderBackendFactory = (canvas: HTMLCanvasElement) => RenderBackend;

let override: RenderBackendFactory | null = null;

/**
 * TEST ONLY. Replace the backend factory; returns a function that restores the
 * previous one. Never call this from application code.
 */
export function setRenderBackendFactory(factory: RenderBackendFactory | null): () => void {
  const previous = override;
  override = factory;
  return () => {
    override = previous;
  };
}

/** A backend that draws nothing — see reason 1 above. */
export function createNullBackend(): RenderBackend {
  return {
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {},
  };
}

let warned = false;

export function createRenderBackend(canvas: HTMLCanvasElement): RenderBackend {
  if (override) return override(canvas);
  try {
    return new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (error) {
    if (!warned) {
      warned = true;
      // Once per session: a missing GL context is an environment fact, and one
      // line per remount would bury everything else in the console.
      console.warn(
        "[map-engine-gl] no WebGL context available; the map will not be drawn.",
        error,
      );
    }
    return createNullBackend();
  }
}
