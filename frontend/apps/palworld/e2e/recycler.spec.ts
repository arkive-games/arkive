import { test, expect } from '@playwright/test'

// The Ancient Civilization Relic Recycler converts the five World Tree relics
// into a loot lottery (recycler.json). The building page shows one comparison
// table across all tiers; each relic's item page shows its own conversion
// section linking back to the building.

test('recycler building page compares all relic tiers', async ({ page }) => {
  await page.goto('/buildings/AncientRelicRecycler')
  const table = page.getByTestId('recycler-comparison')
  await expect(table).toBeVisible()

  // One column per relic tier, headed by a link to the relic's item page.
  for (const tier of ['01', '02', '03', '04', '05']) {
    await expect(
      table.locator(`a[href*="/items/WorldTreeRelic_${tier}"]`).first(),
    ).toBeVisible()
  }

  // Work amounts scale with the tier (first data row).
  await expect(table).toContainText('6000')
  await expect(table).toContainText('96000')

  // Guaranteed output rows link to the item pages.
  await expect(table.locator('a[href*="/items/Wood_WorldTree"]').first()).toBeVisible()
  await expect(table.locator('a[href*="/items/AncientParts2"]').first()).toBeVisible()
})

test('relic item page shows its conversion odds and links to the recycler', async ({ page }) => {
  await page.goto('/items/WorldTreeRelic_03')
  const section = page.getByTestId('recycler-recipe')
  await expect(section).toBeVisible()

  // Cross-link back to the building page.
  await expect(section.locator('a[href*="/buildings/AncientRelicRecycler"]')).toBeVisible()

  // Tier 3 costs 24000 work and always yields the two guaranteed materials.
  await expect(section).toContainText('24000')
  await expect(section.locator('a[href*="/items/Wood_WorldTree"]').first()).toBeVisible()
  await expect(section.locator('a[href*="/items/WorldTreeOre"]').first()).toBeVisible()

  // The mutation-implant slot is tier-5 exclusive: absent here, present on 05.
  await expect(section.locator('a[href*="MutationPal"]')).toHaveCount(0)
  await page.goto('/items/WorldTreeRelic_05')
  const t5 = page.getByTestId('recycler-recipe')
  await t5.locator('details summary').last().click()
  await expect(t5.locator('a[href*="MutationPal"]').first()).toBeVisible()
})
