// Driving the map from a spec (helper module, not a spec).
//
// The engine draws every tile, marker and region into ONE `<canvas>`, so there is
// no per-marker DOM to query or click. Everything here goes through
// `window.__glMap`, the handle the view publishes when `exposeTestHandle` is on
// (the app enables it in dev): project a DATA-space coordinate to canvas pixels,
// then click that page point.
//
// The engine renders on demand — there is no continuous frame loop — so nothing
// here sleeps for an animation; it polls `getZoom`/`getCenter` instead.
import { expect, type Locator, type Page } from '@playwright/test'

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
}
interface MapMeta {
  id: string
  worldBounds?: { min: { x: number; y: number }; max: { x: number; y: number } }
}

/** A candidate marker with its localized name (may be ""). */
export interface Candidate {
  id: string
  subtype: string
  x: number
  y: number
  name: string
}

/**
 * Screen-space clearance (CSS px) a click target must have from any other marker.
 * The engine's hit rect is 40px wide and resolves overlaps by nearest centre, so
 * 100px of clearance makes the hit unambiguous.
 */
export const MIN_CLEARANCE = 100

export async function getJson<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path)
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy()
  return (await res.json()) as T
}

/** Open the map and wait until its handle is live. */
export async function openMap(page: Page, query = ''): Promise<Locator> {
  await page.goto(`/${query ? `?${query.replace(/^[?&]/, '')}` : ''}`)
  const canvas = page.getByTestId('gl-map-canvas')
  // The view mounts only once maps.json has loaded, so allow for the fetch.
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  return canvas
}

/** The language i18next resolved, which is what marker names come back in. */
async function resolvedLanguage(page: Page): Promise<string> {
  return page.evaluate(() => {
    // The language is a `site`-scoped record, so it travels in a cookie on the
    // parent domain -- Web Storage cannot cross the games' separate origins.
    // Reading localStorage here silently returned 'en-US' for every visitor.
    const name = 'ark~' + encodeURIComponent('arkive.memory.site.interface.language')
    const hit = document.cookie.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(name + '='))
    if (!hit) return 'en-US'
    try {
      const raw = decodeURIComponent(hit.slice(name.length + 1))
      const value = (JSON.parse(raw) as { value?: unknown }).value
      return typeof value === 'string' ? value : 'en-US'
    } catch {
      return 'en-US'
    }
  })
}

/**
 * Pick a marker of `subtype` that can be clicked unambiguously: named, far from
 * every other marker that is currently drawn, and as close to the map centre as
 * possible so flying to it cannot be clamped against the map edge. Everything
 * comes from the served data — no coordinates are hard-coded.
 *
 * `alsoDrawn` names the subtypes visible BESIDES the `defaultActive` ones, i.e.
 * any the test switched on itself. Clearance is measured against every drawn
 * marker, so getting this wrong picks a target with a neighbour on top of it.
 */
export async function pickClickableMarker(
  page: Page,
  subtype: string,
  alsoDrawn: readonly string[] = [],
): Promise<{ target: Candidate; onMap: Candidate[] }> {
  const [markersFile, typesFile, mapsFile] = await Promise.all([
    getJson<{ markers: MarkerRow[] }>(page, '/data/markers/MainWorld.json'),
    getJson<{ categories: { subtypes: { id: string; defaultActive?: boolean }[] }[] }>(
      page,
      '/data/types.json',
    ),
    getJson<{ maps: MapMeta[] }>(page, '/data/maps.json'),
  ])
  const lng = await resolvedLanguage(page)
  const l10n = await getJson<Record<string, { name?: string }>>(
    page,
    `/data/locales/${lng}/markers/MainWorld.json`,
  )

  const drawn = new Set([
    ...typesFile.categories
      .flatMap((c) => c.subtypes)
      .filter((s) => s.defaultActive)
      .map((s) => s.id),
    ...alsoDrawn,
  ])
  expect(drawn.has(subtype), `${subtype} must be drawn to be clicked`).toBeTruthy()

  const onMap: Candidate[] = markersFile.markers
    .filter((m) => drawn.has(m.subtype))
    .map((m) => ({ id: m.id, subtype: m.subtype, x: m.x, y: m.y, name: l10n[m.id]?.name ?? '' }))
  const wanted = onMap.filter((m) => m.subtype === subtype && m.name)
  expect(wanted.length, `named ${subtype} markers`).toBeGreaterThan(0)

  const bounds = mapsFile.maps.find((m) => m.id === 'MainWorld')?.worldBounds
  expect(bounds, 'MainWorld worldBounds').toBeTruthy()
  const centre = {
    x: (bounds!.min.x + bounds!.max.x) / 2,
    y: (bounds!.min.y + bounds!.max.y) / 2,
  }

  // Clearances are measured in projected screen space at zoom 0 (scale 1) — that
  // avoids re-implementing the world→pixel transform in the test, and `project`
  // is linear so the distances do not depend on where the camera is.
  const target = await page.evaluate(
    ({ onMap, wanted, centre, minClearance }) => {
      const gl = window.__glMap!
      gl.flyTo(centre.x, centre.y, 0, 0)
      const others = onMap.map((m) => ({ id: m.id, ...gl.project(m.x, m.y) }))
      const centrePt = gl.project(centre.x, centre.y)
      let best: (Candidate & { clearance: number }) | null = null
      let bestToCentre = Number.POSITIVE_INFINITY
      for (const cand of wanted) {
        const p = gl.project(cand.x, cand.y)
        let clearance = Number.POSITIVE_INFINITY
        for (const o of others) {
          if (o.id === cand.id) continue
          const d = Math.hypot(o.sx - p.sx, o.sy - p.sy)
          if (d < clearance) clearance = d
        }
        if (clearance < minClearance) continue
        const toCentre = Math.hypot(p.sx - centrePt.sx, p.sy - centrePt.sy)
        if (toCentre < bestToCentre) {
          bestToCentre = toCentre
          best = { ...cand, clearance }
        }
      }
      return best
    },
    { onMap, wanted, centre, minClearance: MIN_CLEARANCE },
  )
  expect(target, `an isolated named ${subtype} marker`).toBeTruthy()
  return { target: target!, onMap }
}

/**
 * Every marker of `subtype` in DATA ORDER, which is the order the app numbers
 * them in ("Altar #1" is index 0). Use this when a test needs a SPECIFIC marker
 * rather than any conveniently isolated one — `pickClickableMarker` chooses by
 * clearance and would silently pick a different altar as the data grows.
 */
export async function markersOfSubtype(page: Page, subtype: string): Promise<Candidate[]> {
  const markersFile = await getJson<{ markers: MarkerRow[] }>(
    page,
    '/data/markers/MainWorld.json',
  )
  const lng = await resolvedLanguage(page)
  const l10n = await getJson<Record<string, { name?: string }>>(
    page,
    `/data/locales/${lng}/markers/MainWorld.json`,
  )
  const out = markersFile.markers
    .filter((m) => m.subtype === subtype)
    .map((m) => ({ id: m.id, subtype: m.subtype, x: m.x, y: m.y, name: l10n[m.id]?.name ?? '' }))
  expect(out.length, `${subtype} markers`).toBeGreaterThan(0)
  return out
}

/**
 * Fly the marker to the middle of the view and click it.
 *
 * `zoom` matters when the target has close neighbours: the hit test resolves
 * overlaps by nearest centre, so two markers a few metres apart are one target at
 * zoom 0 and two distinct ones zoomed in. The Leaflet suite worked around the same
 * problem by dispatching a click straight at an element, which a canvas cannot do.
 */
export async function clickMarker(page: Page, target: Candidate, zoom = 0): Promise<void> {
  await page.evaluate(([t, z]) => window.__glMap!.flyTo(
    (t as Candidate).x,
    (t as Candidate).y,
    z as number,
    0,
  ), [target, zoom] as [Candidate, number])
  // `flyTo(..., 0)` applies synchronously, but poll rather than trust it: the
  // camera clamps and the app may fly again on its own.
  await page.waitForFunction(
    (z) => Math.abs((window.__glMap?.getZoom() ?? -99) - z) < 1e-6,
    zoom,
  )

  const canvas = page.getByTestId('gl-map-canvas')
  const box = (await canvas.boundingBox())!
  const pt = await page.evaluate((t) => window.__glMap!.project(t.x, t.y), target)
  expect(pt.sx).toBeGreaterThan(0)
  expect(pt.sy).toBeGreaterThan(0)
  await page.mouse.click(box.x + pt.sx, box.y + pt.sy)
}

/** Click a point on the canvas that has no marker near it, to deselect. */
export async function clickEmptySpot(page: Page): Promise<void> {
  const canvas = page.getByTestId('gl-map-canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 40, box.y + 40)
}
