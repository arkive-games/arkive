import { test, expect } from '@playwright/test'

test('desktop top bars omit the retired global search control', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('global-search-button')).toHaveCount(0)

  await page.goto('/items')
  await expect(page.getByTestId('global-search-button')).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('global-search-input')).toHaveCount(0)
})
