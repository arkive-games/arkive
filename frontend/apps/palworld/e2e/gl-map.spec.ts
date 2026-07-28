import { test, expect, type Page } from '@playwright/test'

/**
 * `?engine=gl` — the WebGL (three.js) map engine.
 *
 * The GL engine draws every marker into ONE canvas, so there is no per-marker
 * DOM to click (unlike Leaflet's divIcons, which smoke.spec.ts asserts on for
 * the default engine). These tests drive it through `window.__glMap`, published
 * by the view's `exposeTestHandle` (the app enables it in dev): project a
 * DATA-space coordinate to canvas pixels, then click that page point.
 *
 * The engine renders on demand — there is no continuous frame loop — so nothing
 * here sleeps for an animation; it polls `getZoom`/`getCenter` instead.
 */

/** The subset of the engine's `GlMapRef` these tests use. */
interface GlMapHandle {
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
interface Candidate {
  id: string
  subtype: string
  x: number
  y: number
  name: string
}

/** Screen-space clearance (CSS px) a click target must have from any other
 *  marker. The engine's hit rect is 40px wide and resolves overlaps by nearest
 *  centre, so 100px of clearance makes the hit unambiguous. */
const MIN_CLEARANCE = 100

async function getJson<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path)
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy()
  return (await res.json()) as T
}

/** Open the map on the GL engine and wait until its handle is live. */
async function openGlMap(page: Page, query = '') {
  await page.goto(`/?engine=gl${query}`)
  const canvas = page.getByTestId('gl-map-canvas')
  // The view mounts only once maps.json has loaded, so allow for the fetch.
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  return canvas
}

/**
 * Pick a fast-travel marker that can be clicked unambiguously: named, far from
 * every other *visible* marker (only `defaultActive` subtypes are on at load),
 * and as close to the map centre as possible so flying to it can't be clamped
 * against the map edge. Everything comes from the served data — no coordinates
 * are hard-coded here.
 */
async function pickFastTravelTarget(page: Page) {
  const [markersFile, typesFile, mapsFile] = await Promise.all([
    getJson<{ markers: MarkerRow[] }>(page, '/data/markers/MainWorld.json'),
    getJson<{ categories: { subtypes: { id: string; defaultActive?: boolean }[] }[] }>(
      page,
      '/data/types.json',
    ),
    getJson<{ maps: MapMeta[] }>(page, '/data/maps.json'),
  ])
  // The popup shows the name for the language i18next resolved, not necessarily
  // en-US — read it back rather than assume.
  const lng = await page.evaluate(() => localStorage.getItem('i18nextLng') ?? 'en-US')
  const l10n = await getJson<Record<string, { name?: string }>>(
    page,
    `/data/locales/${lng}/markers/MainWorld.json`,
  )

  const defaultActive = new Set(
    typesFile.categories
      .flatMap((c) => c.subtypes)
      .filter((s) => s.defaultActive)
      .map((s) => s.id),
  )
  expect(defaultActive.has('fastTravel')).toBeTruthy()

  const onMap: Candidate[] = markersFile.markers
    .filter((m) => defaultActive.has(m.subtype))
    .map((m) => ({ id: m.id, subtype: m.subtype, x: m.x, y: m.y, name: l10n[m.id]?.name ?? '' }))
  const wanted = onMap.filter((m) => m.subtype === 'fastTravel' && m.name)
  expect(wanted.length).toBeGreaterThan(0)

  const bounds = mapsFile.maps.find((m) => m.id === 'MainWorld')?.worldBounds
  expect(bounds, 'MainWorld worldBounds').toBeTruthy()
  const centre = {
    x: (bounds!.min.x + bounds!.max.x) / 2,
    y: (bounds!.min.y + bounds!.max.y) / 2,
  }

  // Clearances are measured in projected screen space at zoom 0 (scale 1) —
  // that avoids re-implementing the world→pixel transform in the test, and
  // `project` is linear so the distances don't depend on where the camera is.
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
  expect(target, 'an isolated named fast-travel marker').toBeTruthy()
  return { target: target!, onMap }
}

/** Fly the marker to the middle of the view at zoom 0 and click it. */
async function clickMarker(page: Page, target: Candidate) {
  await page.evaluate((t) => window.__glMap!.flyTo(t.x, t.y, 0, 0), target)
  // `flyTo(..., 0)` applies synchronously, but poll rather than trust it: the
  // camera clamps and the app may fly again on its own.
  await page.waitForFunction(() => Math.abs((window.__glMap?.getZoom() ?? -99) - 0) < 1e-6)

  const canvas = page.getByTestId('gl-map-canvas')
  const box = (await canvas.boundingBox())!
  const pt = await page.evaluate((t) => window.__glMap!.project(t.x, t.y), target)
  expect(pt.sx).toBeGreaterThan(0)
  expect(pt.sy).toBeGreaterThan(0)
  await page.mouse.click(box.x + pt.sx, box.y + pt.sy)
}

test('renders the GL canvas and publishes the map handle', async ({ page }) => {
  await openGlMap(page)
  // Leaflet must not be mounted at all on this path.
  await expect(page.locator('.leaflet-container')).toHaveCount(0)
  const view = await page.evaluate(() => ({
    zoom: window.__glMap!.getZoom(),
    centre: window.__glMap!.getCenter(),
  }))
  // Default view: whole map at min zoom, centred somewhere finite in DATA space.
  expect(view.zoom).toBeCloseTo(-3, 5)
  expect(Number.isFinite(view.centre.x)).toBeTruthy()
  expect(Number.isFinite(view.centre.y)).toBeTruthy()
})

test('clicking a fast-travel marker opens its popup; background click closes it', async ({
  page,
}) => {
  await openGlMap(page)
  // fastTravel is a `defaultActive` subtype, so its filter toggle starts on —
  // assert that rather than clicking it (a click would HIDE the markers, as
  // smoke.spec.ts does for the Leaflet engine).
  await expect(page.getByTestId('subtype-toggle-fastTravel')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const { target, onMap } = await pickFastTravelTarget(page)
  await clickMarker(page, target)

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible({ timeout: 10_000 })
  await expect(popup).toContainText(target.name)

  // Now click somewhere with no marker under it, outside the popup and clear of
  // the bottom chrome (status pill left, zoom pill right).
  const canvas = page.getByTestId('gl-map-canvas')
  const box = (await canvas.boundingBox())!
  const popupBox = (await popup.boundingBox())!
  const projected = await page.evaluate(
    (ms) => ms.map((m) => window.__glMap!.project(m.x, m.y)),
    onMap,
  )
  const forbidden = {
    x: popupBox.x - box.x - 20,
    y: popupBox.y - box.y - 20,
    w: popupBox.width + 40,
    h: popupBox.height + 40,
  }
  let empty: { sx: number; sy: number } | null = null
  for (let sy = 60; sy < box.height - 100 && !empty; sy += 40) {
    for (let sx = 60; sx < box.width - 60; sx += 40) {
      if (sx > forbidden.x && sx < forbidden.x + forbidden.w) {
        if (sy > forbidden.y && sy < forbidden.y + forbidden.h) continue
      }
      const clear = projected.every((p) => Math.hypot(p.sx - sx, p.sy - sy) > 60)
      if (clear) {
        empty = { sx, sy }
        break
      }
    }
  }
  expect(empty, 'a marker-free spot on the canvas').toBeTruthy()
  await page.mouse.click(box.x + empty!.sx, box.y + empty!.sy)
  await expect(popup).toHaveCount(0, { timeout: 10_000 })
})

test('the cursor readout follows the pointer over the canvas', async ({ page }) => {
  const canvas = await openGlMap(page)
  const box = (await canvas.boundingBox())!
  const coords = page.getByTestId('map-coords')
  await expect(coords).toHaveText(/x:--,y:--/)

  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
  await expect(coords).toHaveText(/x:-?\d+,y:-?\d+/)
  const first = await coords.textContent()

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
  await expect(coords).not.toHaveText(first!)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // The zoom pill is asserted at the mobile viewport on purpose: on desktop the
  // app's floating search panel (`top-3 right-3 bottom-3`, pointer-events-auto)
  // covers the bottom-right corner and swallows the click. That is a
  // pre-existing app-chrome overlap, identical on the Leaflet path (verified:
  // `document.elementFromPoint` at the pill's centre returns the search panel
  // for BOTH engines), so it is not something this spec should encode as
  // engine behaviour.
  test('the zoom control zooms the camera in', async ({ page }) => {
    await openGlMap(page)
    const before = await page.evaluate(() => window.__glMap!.getZoom())
    // The pill renders zoom-in first (`+`), zoom-out second (`−`).
    await page.locator('.gmgl-zoom .gmgl-zoom-btn').first().click()
    // Animated over a fixed step: poll instead of sleeping.
    await page.waitForFunction((z) => (window.__glMap?.getZoom() ?? z) > z, before, {
      timeout: 10_000,
    })
    expect(await page.evaluate(() => window.__glMap!.getZoom())).toBeGreaterThan(before)
  })

  test('the GL map keeps the mobile chrome working', async ({ page }) => {
    await openGlMap(page)
    await expect(page.getByTestId('map-coords')).toBeVisible()

    await page.getByTestId('map-fab-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByTestId('map-fab-search').click()
    await expect(page.getByTestId('search-sheet')).toBeVisible()
    await expect(page.getByTestId('marker-search')).toBeVisible()
  })
})

/**
 * Engine selection: the GL engine is the DEFAULT, the top-bar switcher swaps
 * engines live, and the choice is persisted in localStorage under
 * `palworld.map.engine` (see src/lib/mapEngineChoice.ts).
 *
 * These tests deliberately visit `/` with NO `?engine=` param — that is the
 * whole point — and drive the switcher, so they must not use `openGlMap`.
 */
test.describe('engine selection', () => {
  const STORAGE_KEY = 'palworld.map.engine'
  const glCanvas = (page: Page) => page.getByTestId('gl-map-canvas')
  const leafletContainer = (page: Page) => page.locator('.leaflet-container')
  const storedEngine = (page: Page) =>
    page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)

  /** Open the switcher and pick an engine. */
  async function pickEngine(page: Page, choice: 'gl' | 'leaflet') {
    await page.getByTestId('engine-menu').click()
    await page.getByTestId(`engine-${choice}`).click()
  }

  test('defaults to the GL engine with no param and empty storage', async ({ page }) => {
    await page.goto('/')
    expect(await storedEngine(page)).toBeNull()
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
    await expect(leafletContainer(page)).toHaveCount(0)
  })

  test('the switcher swaps engines both ways without a reload', async ({ page }) => {
    await page.goto('/')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })

    await pickEngine(page, 'leaflet')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    await expect(glCanvas(page)).toHaveCount(0)
    // The GL handle is published by the view, so it goes away with the engine.
    await page.waitForFunction(() => !window.__glMap, null, { timeout: 20_000 })

    await pickEngine(page, 'gl')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    await expect(leafletContainer(page)).toHaveCount(0)
    await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  })

  test('the picked engine survives a reload of a param-free URL', async ({ page }) => {
    await page.goto('/')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })

    await pickEngine(page, 'leaflet')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    expect(await storedEngine(page)).toBe('leaflet')

    await page.goto('/')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    await expect(glCanvas(page)).toHaveCount(0)

    await pickEngine(page, 'gl')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    expect(await storedEngine(page)).toBe('gl')

    await page.goto('/')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    await expect(leafletContainer(page)).toHaveCount(0)
  })

  test('?engine= wins for the visit but never overwrites the stored choice', async ({ page }) => {
    // Store "gl" the way a user would, then arrive via a shared leaflet link.
    await page.goto('/')
    await pickEngine(page, 'leaflet')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    await pickEngine(page, 'gl')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    expect(await storedEngine(page)).toBe('gl')

    await page.goto('/?engine=leaflet')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    await expect(glCanvas(page)).toHaveCount(0)
    // The link must not have rewritten the saved preference…
    expect(await storedEngine(page)).toBe('gl')
    // …and dropping the param restores it.
    await page.goto('/')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  })

  test('switching with an explicit ?engine= present rewrites the param', async ({ page }) => {
    await page.goto('/?engine=gl')
    await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
    await pickEngine(page, 'leaflet')
    await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/[?&]engine=leaflet\b/)
    expect(await storedEngine(page)).toBe('leaflet')
  })
})
