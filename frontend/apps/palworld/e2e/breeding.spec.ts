import { test, expect } from '@playwright/test'

// The breeding calculator carries a small mutation info badge (violet, matching
// the Passive Skills page badge) whose tooltip explains the mutation mechanic.

test('breeding page shows the mutation info badge with an explanatory tooltip', async ({ page }) => {
  await page.goto('/breeding')
  const badge = page.getByTestId('breeding-mutation-info')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('Mutation')
  await badge.hover()
  // Tooltip text names the game items involved (en-US default locale).
  await expect(page.getByText('Extravagant Vegetable Cake')).toBeVisible()
})
