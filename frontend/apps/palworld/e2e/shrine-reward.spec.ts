import { test, expect } from '@playwright/test'

// Ancient Shrines grant a gear schematic (+ Dog Coins). The popup shows the
// unlocked item and the schematic itself as badges linking to their item
// pages, plus the Dog Coin amount. "Sword Schematic 3" is the shrine granting
// Blueprint_Sword_4, whose recipe unlock resolves to the Sword_4 item.

test('ancient shrine popup shows item, schematic, and dog coin badges', async ({ page }) => {
  await page.goto(`/?map=MainWorld&q=${encodeURIComponent('Sword Schematic 3')}`)
  const results = page.getByTestId('search-results')
  await results.getByText('Sword Schematic 3', { exact: true }).first().click()

  const popup = page.getByTestId('marker-popup-card')
  await expect(popup).toBeVisible()

  // Item badge: the gear the schematic unlocks, linking to its item page.
  const itemBadge = popup.getByTestId('marker-reward-product')
  await expect(itemBadge).toContainText('Sword')
  await expect(itemBadge).toHaveAttribute('href', /\/items\/Sword_4$/)

  // Schematic badge: the reward item itself.
  const schematicBadge = popup.getByTestId('marker-reward-item')
  await expect(schematicBadge).toContainText('Sword Schematic 3')
  await expect(schematicBadge).toHaveAttribute('href', /\/items\/Blueprint_Sword_4$/)

  // Dog Coin badge keeps the granted amount.
  await expect(popup.getByTestId('marker-reward-coins')).toContainText('×25')
})
