import { test, expect } from '@playwright/test'

// Region polygons render as SVG paths in the Leaflet overlay pane. They are on
// by default (see MapPage's showRegions initial state).
//
// These pin `?engine=leaflet`: the WebGL engine is the default now (see
// lib/mapEngineChoice) and draws borders into its canvas, so there is no
// `.leaflet-overlay-pane svg path` to count.

test('region polygons are drawn on load', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  const paths = page.locator('.leaflet-overlay-pane svg path')
  await expect(paths.first()).toBeVisible({ timeout: 15_000 })
  expect(await paths.count()).toBeGreaterThan(20)
})

test('toggling the region control removes the polygons', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  const paths = page.locator('.leaflet-overlay-pane svg path')
  await expect(paths.first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Show regions' }).click()
  await expect(paths).toHaveCount(0, { timeout: 10_000 })
})

test('every drawn polygon stays inside the 6080px canvas', async ({ page }) => {
  // A calibration error large enough to push regions off the tile grid would
  // show here as coordinates outside 0..6080 in DATA space.
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane svg path').first()).toBeVisible({ timeout: 15_000 })
  const bad = await page.evaluate(async () => {
    const r = await fetch('/data/regions/Vardoran.json')
    const { regions } = (await r.json()) as { regions: { borders: number[][][] }[] }
    let count = 0
    for (const region of regions) {
      for (const ring of region.borders) {
        for (const [x, y] of ring) {
          if (x < -1 || y < -1 || x > 6081 || y > 6081) count++
        }
      }
    }
    return count
  })
  expect(bad).toBe(0)
})
