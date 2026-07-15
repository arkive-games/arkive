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

test('boss rewards: difficulty tabs, deduped interior chest, expanded loot', async ({ page }) => {
  await page.goto('/dungeons/Grass001')
  const section = page.getByTestId('dungeon-boss-rewards')
  await expect(section).toBeVisible()

  // Grass001 has Easy/Medium/Hard(+bonus) tiers → three tab buttons.
  await expect(section.getByTestId('dungeon-tier-tab-easy')).toBeVisible()
  await expect(section.getByTestId('dungeon-tier-tab-medium')).toBeVisible()
  await expect(section.getByTestId('dungeon-tier-tab-hard')).toBeVisible()

  // Easy tab (default): its treasure chest reuses the interior chest lottery →
  // one-line reference instead of a repeated table.
  await expect(section.getByTestId('dungeon-reward-shared-chest').first()).toBeVisible()
  // Non-shared chest lotteries (the scrap pile) render expanded: item links are
  // visible without opening any <details>.
  await expect(section.locator('a[href*="/items/"]').first()).toBeVisible()

  // The Hard tab shows the bonus tier under its own subheading.
  await section.getByTestId('dungeon-tier-tab-hard').click()
  await expect(section.getByText('Hard · bonus')).toBeVisible()
})

test('boss rewards without tier variants render no tab bar', async ({ page }) => {
  await page.goto('/dungeons/Island001')
  const section = page.getByTestId('dungeon-boss-rewards')
  await expect(section).toBeVisible()
  await expect(section.getByTestId('dungeon-tier-tab-hard')).toHaveCount(0)
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
