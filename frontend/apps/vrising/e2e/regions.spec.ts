import { test, expect } from '@playwright/test'
import { expectPixelsChanged, getJson, openMap } from './glMap'

// Region polygons are on by default (see MapPage's showRegions initial state) and
// are drawn INTO the canvas, so there are no paths to count. Two things stay
// checkable: the toggle changes the rendered output, and the region GEOMETRY
// itself is inside the map — which is a data assertion and never needed the DOM.

test('toggling the region control changes what the map draws', async ({ page }) => {
  const canvas = await openMap(page)
  // Regions start on, so the first shot has them; let the paint settle first.
  await page.waitForTimeout(1500)
  const withRegions = await canvas.screenshot()
  await page.getByRole('button', { name: 'Show regions' }).click()
  await expectPixelsChanged(canvas, withRegions)
})

test('every region polygon stays inside the 6080px map', async ({ page }) => {
  // A calibration error large enough to push regions off the tile grid would show
  // here as coordinates outside 0..6080 in DATA space.
  await openMap(page)
  const { regions } = await getJson<{ regions: { borders: number[][][] }[] }>(
    page,
    '/data/regions/Vardoran.json',
  )
  expect(regions.length).toBeGreaterThan(20)
  let bad = 0
  for (const region of regions) {
    for (const ring of region.borders) {
      for (const [x, y] of ring) {
        if (x < -1 || y < -1 || x > 6081 || y > 6081) bad++
      }
    }
  }
  expect(bad).toBe(0)
})
