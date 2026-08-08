import { test, expect, type Page } from '@playwright/test'

/**
 * The map-engine switcher: the WebGL (three.js) engine is the DEFAULT, the
 * sidebar control swaps engines live, and the choice is persisted under
 * `vrising.map.engine` (see src/lib/mapEngineChoice.ts).
 *
 * The GL engine draws every marker into ONE canvas, so there is no per-marker
 * DOM to assert on (that is what smoke.spec.ts does, pinned to Leaflet). These
 * tests assert on the canvas, on `window.__glMap` — published by the view's
 * `exposeTestHandle`, which the app enables in dev — and on the URL/storage.
 *
 * They deliberately visit `/` with NO `?engine=` param where the default is the
 * point.
 */

/** The subset of the engine's `GlMapRef` these tests use. */
interface GlMapHandle {
  getCenter(): { x: number; y: number }
  getZoom(): number
}
declare global {
  interface Window {
    __glMap?: GlMapHandle
  }
}

const STORAGE_KEY = 'vrising.map.engine'
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
  const tiles: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/vrisingres/tiles/Vardoran/')) tiles.push(r.url())
  })
  await page.goto('/')
  expect(await storedEngine(page)).toBeNull()
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  // Leaflet must not be mounted at all on this path.
  await expect(leafletContainer(page)).toHaveCount(0)

  const view = await page.evaluate(() => ({
    zoom: window.__glMap!.getZoom(),
    centre: window.__glMap!.getCenter(),
  }))
  expect(Number.isFinite(view.zoom)).toBeTruthy()
  expect(Number.isFinite(view.centre.x)).toBeTruthy()
  expect(Number.isFinite(view.centre.y)).toBeTruthy()

  // The GL engine loads the same 5x5 tile grid the Leaflet one does.
  await expect.poll(() => tiles.length, { timeout: 20_000 }).toBeGreaterThan(0)
  for (const url of tiles) {
    const m = /Vardoran_(\d{2})_(\d{2})\.webp/.exec(url)
    expect(m, url).not.toBeNull()
    expect(Number(m![1])).toBeLessThan(5)
    expect(Number(m![2])).toBeLessThan(5)
  }
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

/**
 * Regression: a pick that happens to MATCH the stored value still has to take
 * effect when `?engine=` is overriding it. Storing `leaflet` and then arriving
 * on `?engine=gl` renders GL while storage says `leaflet`, so picking "Leaflet"
 * writes nothing new — the switcher must act on the pick itself rather than on a
 * change to the stored value, or the click silently does nothing.
 */
test('a pick matching the stored value still overrides an opposing ?engine=', async ({ page }) => {
  await page.goto('/')
  await pickEngine(page, 'leaflet')
  await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
  expect(await storedEngine(page)).toBe('leaflet')

  // Stored `leaflet`, but the URL forces GL.
  await page.goto('/?engine=gl')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  expect(await storedEngine(page)).toBe('leaflet')

  // Picking the already-stored engine must still switch the map and the URL.
  await pickEngine(page, 'leaflet')
  await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
  await expect(glCanvas(page)).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]engine=leaflet\b/)
})
