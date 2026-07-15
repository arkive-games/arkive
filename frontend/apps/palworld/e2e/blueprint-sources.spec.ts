import { test, expect } from '@playwright/test'

// Blueprint (schematic) detail pages show the item the schematic unlocks and
// every acquisition channel. Pelt Armor Schematic 3 (Blueprint_FurArmor_4) is
// the richest fixture: chests / fishing / supply / camps / oil rig / treasure
// map / Ancient Shrine, plus the recipe unlock for FurArmor_4.

test('blueprint detail shows unlocked item and acquisition channels', async ({ page }) => {
  await page.goto('/items/Blueprint_FurArmor_4')

  // "Unlocks crafting" section links to the craftable item.
  const unlocks = page.getByTestId('bp-unlocks-craft')
  await expect(unlocks.getByRole('link')).toHaveAttribute('href', /\/items\/FurArmor_4$/)

  const sources = page.getByTestId('bp-sources')
  // Chest row: app-side biome label + chest tier + chance.
  await expect(sources).toContainText('Treasure chests')
  await expect(sources).toContainText('Grasslands')
  await expect(sources).toContainText('Chest tier 3')
  // Oil-rig row uses the game-localized rig name from labels.json.
  await expect(sources).toContainText('Rayne Syndicate Test Drilling Rig')
  // Treasure-map chip links to the map item.
  const mapChip = sources.locator('a[href$="/items/TreasureMap01"]')
  await expect(mapChip).toContainText('Treasure Map')
  // Ancient Shrine chip deep-links into the map filtered to this schematic.
  const shrine = page.getByTestId('bp-shrine-chip')
  await expect(shrine).toHaveAttribute(
    'href',
    /\/\?.*q=Pelt(\+|%20)Armor(\+|%20)Schematic(\+|%20)3/,
  )
})

test('merchant-sold blueprint shows shop and price', async ({ page }) => {
  await page.goto('/items/Blueprint_Head003_1')
  const sources = page.getByTestId('bp-sources')
  await expect(sources).toContainText('Merchants')
  await expect(sources).toContainText('Village merchant')
  await expect(sources).toContainText('500')
  // And the schematic unlocks the headband recipe.
  await expect(page.getByTestId('bp-unlocks-craft').getByRole('link')).toHaveAttribute(
    'href',
    /\/items\/Head003$/,
  )
})

test('raid-only blueprint links the summoning-altar boss', async ({ page }) => {
  await page.goto('/items/Blueprint_YakushimaBoss002_Relic')
  const sources = page.getByTestId('bp-sources')
  await expect(sources).toContainText('Summoning altar raids')
  await expect(sources.locator('a[href$="/pals/YakushimaBoss002"]')).toBeVisible()
})

test('items list surfaces blueprints with no known source', async ({ page }) => {
  await page.goto('/items')
  // The chip only appears while the Blueprint category is selected.
  await expect(page.getByTestId('item-nosource-filter')).toHaveCount(0)
  await page.getByTestId('item-cat-Blueprint').click()
  const chip = page.getByTestId('item-nosource-filter')
  await chip.click()
  // All matches are unobtainable schematics (hidden dead data elsewhere);
  // 99 of the 100 no-source blueprints carry the Blueprint category (the
  // odd one out, Blueprint_WhaleWhistle, is typeA Essential).
  const count = page.getByTestId('item-count')
  await expect(count).toContainText('99')
  await expect(page.getByTestId('item-card').first()).toBeVisible()
  // Its detail page carries the no-source note.
  await page.getByTestId('item-card').first().click()
  await expect(page.getByTestId('bp-no-source')).toBeVisible()
})
