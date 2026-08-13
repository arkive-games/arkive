import { test, expect } from '@playwright/test'
import { openMap } from './glMap'

// Named regions come from the game's region trigger volumes (regions/<map>.json).
// Each marker is stamped with the region containing it; the popup shows the
// localized region name, and a "Show regions" toggle draws the region borders.
//
// Borders are drawn INTO the canvas, so there are no border elements to count;
// the toggle test compares the rendered pixels instead.

test('marker popup shows the containing region name', async ({ page }) => {
  // "Sword Schematic 3" is an Ancient Shrine inside the Crescent Moon Shore
  // region (Forest_001).
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Sword Schematic 3')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Sword Schematic 3', { exact: true }).first().click()

  const popup = page.getByTestId('marker-detail-drawer')
  await expect(popup).toBeVisible()
  await expect(popup.getByTestId('marker-region')).toContainText('Crescent Moon Shore')
})

test('show-regions toggle draws region borders', async ({ page }) => {
  const canvas = await openMap(page)
  const toggle = page.getByTestId('map-show-regions').first()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  // Borders live INSIDE the canvas, so there is no element to count. What can be
  // observed is the rendered output: Playwright screenshots the composited canvas
  // (no `preserveDrawingBuffer` needed), so drawing borders must change the
  // pixels. Comparing the two shots is the only assertion here that would fail if
  // the toggle stopped reaching the renderer.
  const before = await canvas.screenshot()

  // By test id, not by label: this was `name: 'Show regions'` until 08a6fbfd
  // renamed the control to "Show region borders", and the spec went quietly red.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), before) !== 0, {
      timeout: 10_000,
    })
    .toBe(true)
})
