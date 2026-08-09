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
  await page.getByTestId('tab-/technology').click()
  await expect(page).toHaveURL(/\/technology$/)
})

test('More sheet opens and navigates to a secondary route', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-sheet')).toBeVisible()
  await page.getByTestId('more-/buildings').click()
  await expect(page).toHaveURL(/\/buildings$/)
})

// Every page the desktop nav offers must be reachable from the phone: the More
// grid is the only door to the pages that lost their bottom-tab slot.
test('More sheet exposes every secondary page', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  for (const key of [
    '/pals',
    '/buildings',
    '/merchants',
    '/dungeons',
    '/quests',
    '/passives',
    '/active-skills',
    '/partner-skills',
    '/stat-simulator',
    '/research',
    '/basecamp',
    '/raids',
    '/fishing',
  ]) {
    await expect(page.getByTestId(`more-${key}`)).toHaveAttribute('href', new RegExp(`${key}$`))
  }
})

test('the More tab highlights while a secondary page is open', async ({ page }) => {
  await page.goto('/fishing')
  // `text-primary` is what `itemCls` gives the active slot.
  await expect(page.getByTestId('tab-more')).toHaveClass(/text-primary/)
  await expect(page.getByTestId('tab-/items')).not.toHaveClass(/text-primary/)
})

test('the language picker is a sub-page of the same sheet', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  // Main body: one row, not a wall of language pills.
  await expect(page.getByTestId('more-lang-zh-CN')).toHaveCount(0)
  await page.getByTestId('more-lang-open').click()
  // Still the same sheet — no second modal on top of it.
  await expect(page.getByTestId('more-sheet')).toHaveCount(1)
  await expect(page.getByTestId('more-/pals')).toHaveCount(0)
  await page.getByTestId('more-lang-back').click()
  await expect(page.getByTestId('more-/pals')).toBeVisible()

  await page.getByTestId('more-lang-open').click()
  await page.getByTestId('more-lang-zh-CN').click()
  // Picking a language applies it and drops back to the main body.
  await expect(page.getByTestId('more-/pals')).toBeVisible()
  await expect(page.getByTestId('more-lang-open')).toContainText('简体中文')

  // Reopening always starts on the main body, never on the sub-page.
  await page.keyboard.press('Escape')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-lang-open')).toBeVisible()
})

test('theme is a segmented control with the active tab pressed', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-theme-auto')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('more-theme-dark').click()
  await expect(page.getByTestId('more-theme-dark')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('more-theme-auto')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('the More sheet omits duplicate brand and renderer controls', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-more').click()
  await expect(page.getByTestId('more-brand')).toHaveCount(0)
  await expect(page.locator('[data-testid^="more-engine-"]')).toHaveCount(0)
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

test('map controls form one ordered stack above navigation', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  const barTop = (await page.getByTestId('bottom-tab-bar').boundingBox())!.y
  const zoom = (await page.locator('.gm-zoom-pill').boundingBox())!
  const search = (await page.getByTestId('map-fab-search').boundingBox())!
  const filter = (await page.getByTestId('map-fab-filter').boundingBox())!

  expect(zoom.y + zoom.height).toBeLessThanOrEqual(search.y)
  expect(search.y + search.height).toBeLessThanOrEqual(filter.y)
  expect(filter.y + filter.height).toBeLessThanOrEqual(barTop)
})

test('map sheets clear navigation and the filter action exposes changed state', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  const barTop = (await page.getByTestId('bottom-tab-bar').boundingBox())!.y
  const filterAction = page.getByTestId('map-fab-filter')

  await expect(filterAction).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('map-fab-search').click()
  const searchSheet = page.getByTestId('search-sheet')
  await expect(searchSheet).toBeVisible()
  const searchBox = (await searchSheet.boundingBox())!
  expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(barTop)

  await page.keyboard.press('Escape')
  await filterAction.click()
  const filterSheet = page.getByTestId('filter-sheet')
  await expect(filterSheet).toBeVisible()
  const filterBox = (await filterSheet.boundingBox())!
  expect(filterBox.y + filterBox.height).toBeLessThanOrEqual(barTop)
  await filterSheet.getByTestId('map-hide-all').click()
  await page.keyboard.press('Escape')

  await expect(filterAction).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('map-filter-active-indicator')).toBeVisible()
})

test('mobile overview uses adaptive marker density', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  const markers = page.locator('.leaflet-marker-icon')
  await expect.poll(() => markers.count(), { timeout: 15_000 }).toBeGreaterThan(0)
  expect(await markers.count()).toBeLessThan(100)
})

test('an open map sheet does not survive the landscape breakpoint', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0)
})
