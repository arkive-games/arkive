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

test('active skills render as cards, not the wide table', async ({ page }) => {
  await page.goto('/active-skills')
  await expect(page.getByTestId('active-skill-row').first()).toBeVisible()
  await expect(page.locator('table')).toHaveCount(0)
})

test('partner skills render as cards, not the wide table', async ({ page }) => {
  await page.goto('/partner-skills')
  await expect(page.getByTestId('partner-skill-row').first()).toBeVisible()
  await expect(page.locator('table')).toHaveCount(0)
})

test('stat simulator keeps the in-game column pinned inside the viewport', async ({ page }) => {
  await page.goto('/stat-simulator?pal=Anubis')
  const input = page.getByTestId('sim-ingame-hp')
  await input.scrollIntoViewIfNeeded()
  await expect(input).toBeVisible()
  // Sticky right column: the IV-solver input must sit fully inside the
  // 390px viewport without horizontal scrolling.
  const box = (await input.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})

// This one test pins `?engine=leaflet`: the WebGL engine is the default now (see
// lib/mapEngineChoice) and renders no `.leaflet-container`. The GL engine's own
// mobile chrome is covered by gl-map.spec.ts; the other tests here never touch
// the map surface, so they stay on the default engine.
test('map page shows FABs that open filter and search sheets', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  // Close (Escape) then open search.
  await page.keyboard.press('Escape')
  await page.getByTestId('map-fab-search').click()
  await expect(page.getByTestId('search-sheet')).toBeVisible()
  await expect(page.getByTestId('marker-search')).toBeVisible()
})
