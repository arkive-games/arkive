// Driving the map from a spec (helper module, not a spec).
//
// The engine draws every tile, marker, region and patrol route into ONE
// `<canvas>`, so there is no per-marker DOM to query, click or hover. Everything
// here goes through `window.__glMap`, the handle the view publishes when
// `exposeTestHandle` is on (the app enables it in dev): project a DATA-space
// coordinate to canvas pixels, then aim the mouse at that page point.
//
// The engine renders on demand — there is no continuous frame loop — so nothing
// here sleeps for an animation; it polls the handle, or the rendered pixels.
import { expect, type Locator, type Page } from '@playwright/test'

const MAP_ID = 'Vardoran'

/** The subset of the engine's `GlMapRef` these tests use. */
export interface GlMapHandle {
  getCenter(): { x: number; y: number }
  getZoom(): number
  flyTo(x: number, y: number, zoom?: number, seconds?: number): void
  project(x: number, y: number): { sx: number; sy: number }
}
declare global {
  interface Window {
    __glMap?: GlMapHandle
  }
}

interface MarkerRow {
  id: string
  subtype: string
  x: number
  y: number
  icon?: string
}

export interface Marker {
  id: string
  subtype: string
  x: number
  y: number
  icon: string
}

export async function getJson<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path)
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy()
  return (await res.json()) as T
}

/** Open the map and wait until its handle is live. */
export async function openMap(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/${query ? `?${query.replace(/^[?&]/, '')}` : ''}`)
  const canvas = page.getByTestId('gl-map-canvas')
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  return canvas
}

/** Every marker on the map, in data order. */
export async function allMarkers(page: Page): Promise<Marker[]> {
  const file = await getJson<{ markers: MarkerRow[] }>(page, `/data/markers/${MAP_ID}.json`)
  return file.markers.map((m) => ({
    id: m.id,
    subtype: m.subtype,
    x: m.x,
    y: m.y,
    icon: m.icon ?? '',
  }))
}

/**
 * The marker whose icon contains `needle`, chosen for CLEARANCE: Vardoran has 372
 * region markers that overlap at the whole-map zoom, so the one furthest from its
 * nearest neighbour is the only one a click or hover can land on unambiguously.
 */
export async function isolatedMarkerByIcon(page: Page, needle: string): Promise<Marker> {
  const markers = await allMarkers(page)
  const wanted = markers.filter((m) => m.icon.includes(needle))
  expect(wanted.length, `markers with icon ~ ${needle}`).toBeGreaterThan(0)
  const best = await page.evaluate(
    ({ all, wanted }) => {
      const gl = window.__glMap!
      const others = all.map((m) => ({ id: m.id, ...gl.project(m.x, m.y) }))
      let pick = wanted[0]
      let bestClearance = -1
      for (const cand of wanted) {
        const p = gl.project(cand.x, cand.y)
        let clearance = Number.POSITIVE_INFINITY
        for (const o of others) {
          if (o.id === cand.id) continue
          const d = Math.hypot(o.sx - p.sx, o.sy - p.sy)
          if (d < clearance) clearance = d
        }
        if (clearance > bestClearance) {
          bestClearance = clearance
          pick = cand
        }
      }
      return pick
    },
    { all: markers, wanted },
  )
  return best
}

/** Fly `marker` to the middle of the view at `zoom` and return its page point. */
async function aimAt(
  page: Page,
  marker: Marker,
  zoom: number,
): Promise<{ x: number; y: number }> {
  await page.evaluate(([m, z]) => window.__glMap!.flyTo(
    (m as Marker).x,
    (m as Marker).y,
    z as number,
    0,
  ), [marker, zoom] as [Marker, number])
  await page.waitForFunction(
    (z) => Math.abs((window.__glMap?.getZoom() ?? -99) - z) < 1e-6,
    zoom,
  )
  const box = (await page.getByTestId('gl-map-canvas').boundingBox())!
  const pt = await page.evaluate((m) => window.__glMap!.project(m.x, m.y), marker)
  return { x: box.x + pt.sx, y: box.y + pt.sy }
}

/** Click a marker. Zoom in far enough that its neighbours are not under it. */
export async function clickMarker(page: Page, marker: Marker, zoom = 1): Promise<void> {
  const at = await aimAt(page, marker, zoom)
  await page.mouse.click(at.x, at.y)
}

/** Hover a marker, which is how a roaming boss reveals its patrol route. */
export async function hoverMarker(page: Page, marker: Marker, zoom = 1): Promise<void> {
  const at = await aimAt(page, marker, zoom)
  await page.mouse.move(at.x, at.y)
}

/** Wait until the canvas no longer matches `before`. */
export async function expectPixelsChanged(canvas: Locator, before: Buffer): Promise<void> {
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), before) !== 0, {
      timeout: 10_000,
    })
    .toBe(true)
}
