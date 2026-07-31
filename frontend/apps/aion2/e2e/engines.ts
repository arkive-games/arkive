// Engine-awareness for the e2e suite (helper module, not a spec).
//
// aion2 renders the map route with one of two engines: the WebGL one
// (`@gamemap/map-engine-gl`), which is the DEFAULT, or Leaflet
// (`@gamemap/map-engine`). They put completely different things in the DOM:
//
//   Leaflet  →  `.leaflet-container`, one node per tile and per marker,
//               an SVG `.leaflet-overlay-pane` for regions, `.leaflet-popup`.
//   WebGL    →  a single `<canvas data-testid="gl-map-canvas">`. Tiles,
//               markers and regions are drawn INSIDE it, so there is no
//               per-marker DOM to query or click. The chrome that does stay
//               DOM is prefixed `gmgl-` (`.gmgl-zoom`, `.gmgl-label`, …).
//
// So a spec has to say which engine it means. `?engine=<gl|leaflet>` on the map
// route pins it for that visit without touching the stored preference (see
// src/lib/mapEngineChoice.ts), and that is what every helper here uses — never
// localStorage, so tests stay independent of each other.
//
// The escape hatch for driving the map is per engine too: Leaflet publishes the
// real `L.Map` on `window.__leafletMap`, the GL view a small DATA-space handle
// on `window.__glMap` (both only when `exposeTestHandle` is on, i.e. in dev).
// `panTo`/`readCentre` below wrap that difference so a spec about APP behaviour
// can run against both engines from one body.
import { type Locator, type Page } from "@playwright/test";

export type Engine = "gl" | "leaflet";

/** Both engines, for `for (const engine of ENGINES)` parameterized specs. */
export const ENGINES = ["gl", "leaflet"] as const;

/**
 * Height in DATA pixels of World_L_A (tileHeight 1024 × tilesCountY 8) — the
 * map every map spec opens. Only the Leaflet path needs it: `CRS.Simple` counts
 * latitude UP from the bottom, so DATA y (image space, DOWN) is `height - lat`.
 */
export const WORLD_L_A_HEIGHT = 8192;

/** The GL view's `window.__glMap` (see `GlMapRef` in the engine package). */
export interface GlMapHandle {
  getCenter(): { x: number; y: number };
  getZoom(): number;
  flyTo(x: number, y: number, zoom?: number, seconds?: number): void;
  project(x: number, y: number): { sx: number; sy: number };
}

/** The subset of `L.Map` the specs use, published as `window.__leafletMap`. */
export interface LeafletMapHandle {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  setView(
    center: [number, number],
    zoom: number,
    opts?: { animate?: boolean },
  ): void;
  project(latlng: [number, number], zoom: number): { x: number; y: number };
  getMaxZoom(): number;
}

declare global {
  interface Window {
    __glMap?: GlMapHandle;
    __leafletMap?: LeafletMapHandle;
  }
}

/** Default deep link every map spec opens: one known map, one known language. */
export const DEFAULT_MAP_PARAMS = "map=World_L_A&lng=en-US";

/** `/?engine=<engine>&<params>` — the map route with the engine pinned. */
export function mapUrl(engine: Engine, params: string = DEFAULT_MAP_PARAMS): string {
  const rest = params.replace(/^[?&]/, "");
  return rest ? `/?engine=${engine}&${rest}` : `/?engine=${engine}`;
}

/**
 * The element that IS the map for this engine: Leaflet's container, or the GL
 * canvas. Both fill the map column, so a bounding box means the same thing.
 */
export function mapRoot(page: Page, engine: Engine): Locator {
  return engine === "gl"
    ? page.getByTestId("gl-map-canvas")
    : page.locator(".leaflet-container");
}

/** Wait until the engine has published its window handle. */
export async function waitForHandle(page: Page, engine: Engine): Promise<void> {
  if (engine === "gl") {
    await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 });
  } else {
    await page.waitForFunction(() => !!window.__leafletMap, null, { timeout: 20_000 });
  }
}

/** Open the map route on `engine` and wait until it is live. */
export async function openMap(
  page: Page,
  engine: Engine,
  params: string = DEFAULT_MAP_PARAMS,
): Promise<Locator> {
  await page.goto(mapUrl(engine, params));
  const root = mapRoot(page, engine);
  await root.waitFor({ state: "visible", timeout: 20_000 });
  await waitForHandle(page, engine);
  return root;
}

/** The zoom pill, and its buttons — same markup, different class prefix. */
export function zoomPill(page: Page, engine: Engine): Locator {
  return page.locator(engine === "gl" ? ".gmgl-zoom" : ".gm-zoom");
}
export function zoomButtons(page: Page, engine: Engine): Locator {
  return page.locator(engine === "gl" ? ".gmgl-zoom-btn" : ".gm-zoom-btn");
}

/**
 * Move the view to a DATA-space point, without animation. Leaflet is fed the
 * flipped latitude; the GL engine takes DATA coordinates directly.
 */
export async function panTo(
  page: Page,
  engine: Engine,
  x: number,
  y: number,
  mapHeight: number = WORLD_L_A_HEIGHT,
): Promise<void> {
  if (engine === "gl") {
    await page.evaluate(([px, py]) => window.__glMap?.flyTo(px, py, undefined, 0), [x, y]);
  } else {
    await page.evaluate(
      ([px, py, h]) => {
        const map = window.__leafletMap;
        map?.setView([h - py, px], map.getZoom(), { animate: false });
      },
      [x, y, mapHeight],
    );
  }
}

/** The current view centre, in DATA space (x right, y DOWN), for either engine. */
export async function readCentre(
  page: Page,
  engine: Engine,
  mapHeight: number = WORLD_L_A_HEIGHT,
): Promise<{ x: number; y: number } | null> {
  if (engine === "gl") {
    return page.evaluate(() => {
      const map = window.__glMap;
      if (!map) return null;
      const c = map.getCenter();
      return { x: Math.round(c.x), y: Math.round(c.y) };
    });
  }
  return page.evaluate((h) => {
    const map = window.__leafletMap;
    if (!map) return null;
    const c = map.getCenter();
    return { x: Math.round(c.lng), y: Math.round(h - c.lat) };
  }, mapHeight);
}
