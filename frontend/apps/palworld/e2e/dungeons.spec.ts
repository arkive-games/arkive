import { test, expect } from '@playwright/test'

// The dungeons feature: a list-only /dungeons page linking to per-dungeon
// detail pages, with legacy ?d= deep links redirecting to the new route.

test('dungeon list shows all dungeons, difficulty-ordered, linking to detail pages', async ({ page }) => {
  await page.goto('/dungeons')
  const rows = page.getByTestId('dungeon-row')
  await expect(rows).toHaveCount(14)
  // Lowest EXP bonus first → Grass001 ("Hillside Cavern").
  await expect(rows.first()).toContainText('Hillside Cavern')
  await rows.first().click()
  await expect(page).toHaveURL(/\/dungeons\/Grass001$/)
})

test('dungeon detail renders header, sections, and the entrance map', async ({ page }) => {
  await page.goto('/dungeons/Grass001')
  await expect(page.getByTestId('dungeon-header')).toContainText('Hillside Cavern')
  await expect(page.getByTestId('dungeon-notable-drops')).toBeVisible()
  await expect(page.getByTestId('dungeon-encounters')).toBeVisible()
  await expect(page.getByTestId('dungeon-chest-loot')).toBeVisible()
  await expect(page.getByTestId('dungeon-boss-rewards')).toBeVisible()
  // Entrance mini-map: Grass001 has 4 portals on MainWorld.
  const widget = page.getByTestId('dungeon-entrance-map')
  await expect(widget).toBeVisible()
  await expect(widget.locator('.leaflet-marker-icon')).toHaveCount(4)
  // Prev/next: the easiest dungeon has no prev; next exists.
  await expect(page.getByTestId('dungeon-prev')).toHaveCount(0)
  await page.getByTestId('dungeon-next').click()
  await expect(page).toHaveURL(/\/dungeons\/Island001$/)
})

test('legacy ?d= deep link redirects to the detail page', async ({ page }) => {
  await page.goto('/dungeons?d=Forest001')
  await expect(page).toHaveURL(/\/dungeons\/Forest001/)
  await expect(page.getByTestId('dungeon-header')).toBeVisible()
})

test('item detail dungeon chip navigates to a dungeon detail page', async ({ page }) => {
  await page.goto('/items/PalUpgradeStone')
  const chips = page.getByTestId('item-dungeon-sources').getByRole('link')
  await chips.first().click()
  await expect(page).toHaveURL(/\/dungeons\/[A-Za-z]+\d+$/)
  await expect(page.getByTestId('dungeon-header')).toBeVisible()
})
