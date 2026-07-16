import { test, expect } from '@playwright/test'

// Named regions come from the game's region trigger volumes (regions/<map>.json).
// Each marker is stamped with the region containing it; the popup shows the
// localized region name, and a "Show regions" toggle draws the region borders.

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
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  // No region border polylines until the toggle is on.
  const borders = page.locator('.leaflet-overlay-pane path')
  await expect(borders.first()).toBeHidden()
  await page.getByRole('button', { name: 'Show regions' }).first().click()
  await expect(borders.first()).toBeVisible({ timeout: 10_000 })
})
