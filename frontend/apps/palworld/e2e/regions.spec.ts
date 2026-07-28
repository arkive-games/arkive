import { test, expect } from '@playwright/test'

// Named regions come from the game's region trigger volumes (regions/<map>.json).
// Each marker is stamped with the region containing it; the popup shows the
// localized region name, and a "Show regions" toggle draws the region borders.
//
// The border test pins `?engine=leaflet`: the WebGL engine is the default now
// (see lib/mapEngineChoice) and draws borders into its canvas, so there is no
// `.leaflet-overlay-pane path` to count. The popup test is engine-agnostic (the
// popup is app chrome) and deliberately runs on the default engine.

test('marker popup shows the containing region name', async ({ page }) => {
  // "Sword Schematic 3" is an Ancient Shrine inside the Crescent Moon Shore
  // region (Forest_001).
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Sword Schematic 3')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Sword Schematic 3', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible()
  await expect(popup.getByTestId('marker-region')).toContainText('Crescent Moon Shore')
})

test('show-regions toggle draws region borders', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  // No region border polylines until the toggle is on.
  const borders = page.locator('.leaflet-overlay-pane path')
  await expect(borders.first()).toBeHidden()
  await page.getByRole('button', { name: 'Show regions' }).first().click()
  await expect(borders.first()).toBeVisible({ timeout: 10_000 })
})
