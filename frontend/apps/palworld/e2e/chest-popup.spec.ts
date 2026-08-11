import { test, expect } from '@playwright/test'

test('loot marker popups show the matching source pool', async ({ page }) => {
  const cases = [
    { query: 'Chest', kind: 'Treasure chests', tier: 'Loot tier 3' },
    { query: 'Fishing Spot', kind: 'Fishing spots' },
    { query: 'Supplies', kind: 'Supply drops' },
    { query: 'Base', kind: 'Faction camps' },
    { query: 'Oil Rig', kind: 'Oil rigs' },
  ]

  for (const { query, kind, tier } of cases) {
    await page.goto(`/?map=MainWorld&q=${encodeURIComponent(query)}`)
    await page.getByTestId('search-results').getByText(query, { exact: true }).first().click()

    const summary = page.getByTestId('marker-popup-card').getByTestId('marker-loot-summary')
    await expect(summary).toBeVisible()
    await expect(summary.getByTestId('marker-loot-kind')).toHaveText(kind)
    await expect(summary.getByTestId('marker-loot-item')).toHaveCount(4)
    await expect(summary.getByTestId('marker-loot-item').first()).toHaveAttribute('href', /\/items\//)
    await expect(summary.getByTestId('marker-loot-region-link')).toHaveAttribute('href', /\/regions\//)
    await expect(summary).not.toContainText('Loot tier 0')
    if (tier) {
      await expect(summary.getByTestId('marker-loot-tier')).toHaveText(tier)
    }
  }
})
