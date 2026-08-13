import { test, expect, type Page } from '@playwright/test'

/**
 * The map surface itself.
 *
 * The engine draws every marker into one canvas, so there is no per-marker DOM to
 * assert on — these tests use the canvas, `window.__glMap` (published by the
 * view's `exposeTestHandle`, which the app enables in dev) and the tile requests.
 *
 * This file was about picking a renderer while there were two; what is left is the
 * part that still means something: the map really comes up, it draws the tiles it
 * should, and no chrome offers a choice of renderer.
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

const glCanvas = (page: Page) => page.getByTestId('gl-map-canvas')

test('brings up the map and fetches only real Vardoran tiles', async ({ page }) => {
  const tiles: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/vrisingres/tiles/Vardoran/')) tiles.push(request.url())
  })
  await page.goto('/')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 })

  const view = await page.evaluate(() => ({
    zoom: window.__glMap!.getZoom(),
    centre: window.__glMap!.getCenter(),
  }))
  expect(Number.isFinite(view.zoom)).toBeTruthy()
  expect(Number.isFinite(view.centre.x)).toBeTruthy()
  expect(Number.isFinite(view.centre.y)).toBeTruthy()

  // The tile grid is 5x5, so a request outside it means the layer computed a tile
  // range the map does not have.
  await expect.poll(() => tiles.length, { timeout: 20_000 }).toBeGreaterThan(0)
  for (const url of tiles) {
    const match = /Vardoran_(\d{2})_(\d{2})\.webp/.exec(url)
    expect(match, url).not.toBeNull()
    expect(Number(match![1])).toBeLessThan(5)
    expect(Number(match![2])).toBeLessThan(5)
  }
})

// There is one renderer, so no chrome may offer a choice of one. Cheap to assert
// and it catches a switcher being reintroduced by accident.
test('does not expose a renderer picker', async ({ page }) => {
  await page.goto('/')
  await expect(glCanvas(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('engine-menu')).toHaveCount(0)
})
