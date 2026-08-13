// Map helpers for the e2e suite (helper module, not a spec).
//
// The map is drawn by `@gamemap/map-engine-gl` into a single
// `<canvas data-testid="gl-map-canvas">`. Tiles, markers and regions all live
// INSIDE it, so there is no per-marker DOM to query or click — the chrome that
// does stay DOM is prefixed `gmgl-` (`.gmgl-zoom`, `.gmgl-label`, …).
//
// Driving the camera therefore goes through the view's escape hatch: a small
// DATA-space handle published on `window.__glMap`, and only when
// `exposeTestHandle` is on (i.e. in dev). `panTo`/`readCentre` below wrap it.
//
// This module was a two-engine abstraction while Leaflet was still selectable.
// It is kept as the one place that knows the map's locators and its handle, so a
// spec never hard-codes either.
import { type Locator, type Page } from "@playwright/test";

/** The GL view's `window.__glMap` (see `GlMapRef` in the engine package). */
export interface GlMapHandle {
  getCenter(): { x: number; y: number };
  getZoom(): number;
  flyTo(x: number, y: number, zoom?: number, seconds?: number): void;
  project(x: number, y: number): { sx: number; sy: number };
}

declare global {
  interface Window {
    __glMap?: GlMapHandle;
  }
}

/** Default deep link every map spec opens: one known map, one known language. */
export const DEFAULT_MAP_PARAMS = "map=World_L_A&lng=en-US";

/** `/?<params>` — the map route. */
export function mapUrl(params: string = DEFAULT_MAP_PARAMS): string {
  const rest = params.replace(/^[?&]/, "");
  return rest ? `/?${rest}` : "/";
}

/** The element that IS the map: the GL canvas, which fills the map column. */
export function mapRoot(page: Page): Locator {
  return page.getByTestId("gl-map-canvas");
}

/** Wait until the engine has published its window handle. */
export async function waitForHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 });
}

/** Open the map route and wait until it is live. */
export async function openMap(
  page: Page,
  params: string = DEFAULT_MAP_PARAMS,
): Promise<Locator> {
  await page.goto(mapUrl(params));
  const root = mapRoot(page);
  await root.waitFor({ state: "visible", timeout: 20_000 });
  await waitForHandle(page);
  return root;
}

/** The zoom pill, and its buttons. */
export function zoomPill(page: Page): Locator {
  return page.locator(".gmgl-zoom");
}
export function zoomButtons(page: Page): Locator {
  return page.locator(".gmgl-zoom-btn");
}

/** Move the view to a DATA-space point, without animation. */
export async function panTo(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([px, py]) => window.__glMap?.flyTo(px, py, undefined, 0), [x, y]);
}

/** The current view centre, in DATA space (x right, y DOWN). */
export async function readCentre(
  page: Page,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const map = window.__glMap;
    if (!map) return null;
    const c = map.getCenter();
    return { x: Math.round(c.x), y: Math.round(c.y) };
  });
}
