import { test, expect } from '@playwright/test'

// Boss, wild-pal, and wanted marker popups show kill drops as badges linking
// to the item pages. Field bosses / predators carry a `pal` field; wild spawn
// markers use the pal id as their subtype; wanted criminals (human bosses)
// carry their drops directly on the marker.

test('wanted criminal popup shows its kill-drop badges', async ({ page }) => {
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Ram Lv.59')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Ram Lv.59', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible()

  // The Dark Trader bounty drops bounty tokens, gold, and a Gold Key.
  const drops = popup.getByTestId('marker-drop-item')
  await expect(drops.filter({ hasText: 'Successful Bounty Token' })).toHaveAttribute('href', /\/items\/BountyProof_1$/)
  await expect(drops.filter({ hasText: 'Gold Coin' })).toContainText('×500–1000')
  await expect(drops.filter({ hasText: 'Gold Key' })).toHaveAttribute('href', /\/items\/TreasureBoxKey03$/)
})

test('field boss popup shows the pal drop badges', async ({ page }) => {
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Melpaca Lv.7')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Melpaca Lv.7', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible()

  // Melpaca (Alpaca) drops Leather + Wool.
  const drops = popup.getByTestId('marker-drop-item')
  await expect(drops.filter({ hasText: 'Leather' })).toHaveAttribute('href', /\/items\/Leather$/)
  await expect(drops.filter({ hasText: 'Wool' })).toHaveAttribute('href', /\/items\/Wool$/)
})

test('wild pal spawn popup shows the pal drop badges', async ({ page }) => {
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Lamball')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Lamball', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible()

  // Lamball drops Lamball Mutton ×1 and Wool ×1–3.
  const drops = popup.getByTestId('marker-drop-item')
  await expect(drops.filter({ hasText: 'Lamball Mutton' })).toHaveAttribute('href', /\/items\/Meat_SheepBall$/)
  await expect(drops.filter({ hasText: 'Wool' })).toContainText('×1–3')
})
