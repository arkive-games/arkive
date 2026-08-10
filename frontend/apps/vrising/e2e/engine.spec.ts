import { test, expect, type Page } from '@playwright/test'

/**
 * The WebGL (three.js) engine is the default. The renderer picker is no longer
 * exposed in the sidebar, but existing saved preferences and direct
 * `?engine=` links remain supported (see src/lib/mapEngineChoice.ts).
 *
 * The GL engine draws every marker into one canvas, so there is no per-marker
 * DOM to assert on (that is what smoke.spec.ts does, pinned to Leaflet). These
 * tests assert on the canvas, on `window.__glMap` — published by the view's
 * `exposeTestHandle`, which the app enables in dev — and on the URL/storage.
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

const STORAGE_KEY = 'arkive.memory.vrising.map.engine'
const glCanvas = (page: Page) => page.getByTestId('gl-map-canvas')
const leafletContainer = (page: Page) => page.locator('.leaflet-container')
const storedEngine = (page: Page) =>
  page.evaluate((key) => {
    // Stored as a state-memory envelope now, not a bare string.
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try { return (JSON.parse(raw) as { value?: unknown }).value ?? null } catch { return null }
  }, STORAGE_KEY)

test('defaults to the GL engine with no param and empty storage', async ({ page }) => {
  const tiles: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/vrisingres/tiles/Vardoran/')) tiles.push(request.url())
  })
  await page.goto('/')
  expect(await storedEngine(page)).toBeNull()
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })
  await expect(leafletContainer(page)).toHaveCount(0)

  const view = await page.evaluate(() => ({
    zoom: window.__glMap!.getZoom(),
    centre: window.__glMap!.getCenter(),
  }))
  expect(Number.isFinite(view.zoom)).toBeTruthy()
  expect(Number.isFinite(view.centre.x)).toBeTruthy()
  expect(Number.isFinite(view.centre.y)).toBeTruthy()

  await expect.poll(() => tiles.length, { timeout: 20_000 }).toBeGreaterThan(0)
  for (const url of tiles) {
    const match = /Vardoran_(\d{2})_(\d{2})\.webp/.exec(url)
    expect(match, url).not.toBeNull()
    expect(Number(match![1])).toBeLessThan(5)
    expect(Number(match![2])).toBeLessThan(5)
  }
})

test('does not expose a renderer picker in the sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('engine-menu')).toHaveCount(0)
})

test('honors an existing stored Leaflet preference without sidebar UI', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
    schemaVersion: '1.0.0', stateClass: 'user_preference', writtenAt: Date.now(),
    value: 'leaflet',
  })), STORAGE_KEY)
  await page.reload()
  await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
  await expect(glCanvas(page)).toHaveCount(0)
  expect(await storedEngine(page)).toBe('leaflet')
})

test('?engine= wins for the visit but never overwrites the stored choice', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({
    schemaVersion: '1.0.0', stateClass: 'user_preference', writtenAt: Date.now(),
    value: 'gl',
  })), STORAGE_KEY)
  expect(await storedEngine(page)).toBe('gl')

  await page.goto('/?engine=leaflet')
  await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })
  await expect(glCanvas(page)).toHaveCount(0)
  expect(await storedEngine(page)).toBe('gl')

  await page.goto('/')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
})

test('direct renderer links still select either engine', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(leafletContainer(page)).toBeVisible({ timeout: 20_000 })

  await page.goto('/?engine=gl')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await expect(leafletContainer(page)).toHaveCount(0)
})
