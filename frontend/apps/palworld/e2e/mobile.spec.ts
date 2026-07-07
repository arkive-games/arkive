import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('bottom tab bar is visible and desktop nav is hidden on mobile', async ({ page }) => {
  await page.goto('/pals')
  await expect(page.getByTestId('bottom-tab-bar')).toBeVisible()
  // Desktop top bar (map-shell header) is hidden < md.
  await expect(page.getByTestId('lang-menu')).toBeHidden()
})

test('bottom tabs navigate between sections', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-/items').click()
  await expect(page).toHaveURL(/\/items$/)
  await page.getByTestId('tab-/buildings').click()
  await expect(page).toHaveURL(/\/buildings$/)
})

test('More sheet opens and navigates to a secondary route', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-sheet')).toBeVisible()
  await page.getByTestId('more-/technology').click()
  await expect(page).toHaveURL(/\/technology$/)
})

test('map page shows FABs that open filter and search sheets', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  // Close (Escape) then open search.
  await page.keyboard.press('Escape')
  await page.getByTestId('map-fab-search').click()
  await expect(page.getByTestId('search-sheet')).toBeVisible()
  await expect(page.getByTestId('marker-search')).toBeVisible()
})
