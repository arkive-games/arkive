import { test, expect } from '@playwright/test'

// The topbar global search palette: opens by button and Ctrl+K, prefix-matches
// (no fuzzy), and navigates to the picked entity.

test('finds a pal by name and navigates to its detail page', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('global-search-button').click()
  const input = page.getByTestId('global-search-input')
  await expect(input).toBeVisible()
  await input.fill('Lamball')
  const hit = page.getByTestId('global-search-item').filter({ hasText: 'Lamball' }).first()
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(page).toHaveURL(/\/pals\/SheepBall$/)
})

test('opens with Ctrl+K and finds an item from a catalog page', async ({ page }) => {
  await page.goto('/items')
  await page.keyboard.press('Control+k')
  const input = page.getByTestId('global-search-input')
  await expect(input).toBeVisible()
  await input.fill('Paldium')
  await expect(page.getByTestId('global-search-item').first()).toBeVisible()
})

test('does not fuzzy-match typos', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('global-search-button').click()
  const input = page.getByTestId('global-search-input')
  await input.fill('Lamball') // warm-up: wait for sources to load
  await expect(page.getByTestId('global-search-item').first()).toBeVisible()
  await input.fill('Lambell') // one edit away — must yield nothing
  await expect(page.getByTestId('global-search-item')).toHaveCount(0)
})
