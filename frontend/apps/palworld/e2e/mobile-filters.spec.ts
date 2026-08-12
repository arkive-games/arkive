import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('items page exposes category filters below search', async ({ page }) => {
  await page.goto('/items')
  await expect(page.getByTestId('item-card').first()).toBeVisible()
  await expect(page.getByTestId('mobile-filter-button')).toHaveCount(0)
  const filters = page.getByTestId('item-category-filter')
  await expect(filters).toBeVisible()

  const readTotal = async () =>
    Number((await page.getByTestId('item-count').innerText()).replace(/\D/g, ''))
  const total = await readTotal()
  const chip = filters.locator('[data-testid^="item-cat-"]').first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  expect(await readTotal()).toBeLessThan(total)
})

test('passive skill filters stay visible and narrow the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  await expect(page.getByTestId('passive-search')).toBeVisible()
  await expect(page.getByTestId('passive-rarity-filter')).toBeVisible()
  await expect(page.getByTestId('passive-category-filter')).toBeVisible()

  const total = await rows.count()
  await page.getByTestId('category-work').click()
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('paldeck facets are visible in the page flow', async ({ page }) => {
  await page.goto('/pals')
  await expect(page.getByTestId('pal-card').first()).toBeVisible()
  const chip = page.getByTestId('pal-element-Fire')
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
})
