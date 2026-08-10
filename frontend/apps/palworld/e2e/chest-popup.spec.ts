import { test, expect } from '@playwright/test'

test('chest popup shows its regional loot pool and links to the region', async ({ page }) => {
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Chest')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Chest', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  const summary = popup.getByTestId('chest-loot-summary')
  await expect(summary).toBeVisible()
  await expect(summary.getByTestId('chest-loot-area')).toContainText('Grasslands')
  await expect(summary.getByTestId('chest-loot-item')).toHaveCount(4)
  await expect(summary.getByTestId('chest-loot-grade-group')).toHaveCount(1)
  await expect(summary.getByTestId('chest-loot-grade-group')).toContainText('Chest tier 3')
  await expect(summary.getByTestId('chest-loot-item').first()).not.toContainText('Chest tier')
  await expect(summary.getByTestId('chest-loot-item').first()).toHaveAttribute('href', /\/items\//)
  await expect(summary.getByTestId('chest-loot-region-link')).toHaveAttribute('href', /\/regions\/Grass$/)
})
