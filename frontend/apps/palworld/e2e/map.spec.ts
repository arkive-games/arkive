import { test, expect } from '@playwright/test'
import { clickMarker, openMap, pickClickableMarker } from './glMap'

/**
 * The map: the WebGL (three.js) engine. The canvas-driving helpers live in
 * `glMap.ts` because completion.spec.ts needs them too.
 */

test('renders the GL canvas and publishes the map handle', async ({ page }) => {
  await openMap(page)
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
  await openMap(page)
  // fastTravel is a `defaultActive` subtype, so its filter toggle starts on —
  // assert that rather than clicking it (a click would HIDE the markers, as
  // smoke.spec.ts does for the app chrome).
  await expect(page.getByTestId('subtype-toggle-fastTravel')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const { target, onMap } = await pickClickableMarker(page, 'fastTravel')
  await clickMarker(page, target)

  const popup = page.getByTestId('marker-detail-drawer')
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

/**
 * The subtype filter has to reach the CANVAS, not just the button's aria state.
 * With no per-marker DOM to count, the proof is that the very same click stops
 * selecting anything once the subtype is off.
 */
test('toggling a subtype stops its markers being drawn', async ({ page }) => {
  await openMap(page)
  const { target } = await pickClickableMarker(page, 'fastTravel')

  await clickMarker(page, target)
  const popup = page.getByTestId('marker-detail-drawer')
  await expect(popup).toBeVisible({ timeout: 10_000 })

  // Close the popup, then hide the subtype and click the exact same point.
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0, { timeout: 10_000 })
  await page.getByTestId('subtype-toggle-fastTravel').click()
  await expect(page.getByTestId('subtype-toggle-fastTravel')).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  await clickMarker(page, target)
  await expect(popup).toHaveCount(0)
})

test('the cursor readout follows the pointer over the canvas', async ({ page }) => {
  const canvas = await openMap(page)
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
  // pre-existing app-chrome overlap (verified:
  // `document.elementFromPoint` at the pill's centre returns the search panel
  // for BOTH engines), so it is not something this spec should encode as
  // engine behaviour.
  test('the zoom control zooms the camera in', async ({ page }) => {
    await openMap(page)
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
    await openMap(page)
    await expect(page.getByTestId('map-coords')).toBeVisible()

    await page.getByTestId('map-fab-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByTestId('map-fab-search').click()
    await expect(page.getByTestId('search-sheet')).toBeVisible()
    await expect(page.getByTestId('marker-search')).toBeVisible()
  })
})

// There is one renderer, so no chrome may offer a choice of one. Cheap to assert
// and it catches a switcher being reintroduced by accident.
test.describe('no renderer controls', () => {
  test('desktop map chrome omits a renderer switcher', async ({ page }) => {
    await openMap(page)
    await expect(page.getByTestId('engine-menu')).toHaveCount(0)
  })

  test('mobile More sheet omits renderer choices', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openMap(page)
    await page.getByTestId('tab-more').click()
    await expect(page.getByTestId('more-sheet')).toBeVisible()
    await expect(page.locator('[data-testid^="more-engine-"]')).toHaveCount(0)
  })
})
