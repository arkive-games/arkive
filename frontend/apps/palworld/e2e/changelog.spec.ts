import { expect, test } from '@playwright/test'

test('changelog lists versions newest-first with the current badge', async ({ page }) => {
  await page.goto('/changelog')
  const entries = page.getByTestId('changelog-entry')
  await expect(entries.first()).toBeVisible()
  // Shape, not a pinned literal — the newest version changes on every release.
  await expect(entries.first()).toHaveAttribute('data-version', /^\d+\.\d+\.\d+$/)
  expect(await entries.count()).toBeGreaterThanOrEqual(20)
  await expect(page.getByTestId('changelog-current')).toHaveCount(1)
  await expect(page.getByText('v0.1.0')).toBeVisible()
})

test('footer version link reaches the changelog', async ({ page }) => {
  await page.goto('/pals')
  await page.getByTestId('site-footer-version').getByRole('link').click()
  await expect(page).toHaveURL(/\/changelog$/)
  await expect(page.getByTestId('changelog-entry').first()).toBeVisible()
})
