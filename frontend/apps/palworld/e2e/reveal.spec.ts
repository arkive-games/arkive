import { test, expect } from '@playwright/test'

// Incremental reveal ("auto-scroll pagination") on the catalog list pages.
// The full dataset is client-side; the reveal caps how many tiles are mounted
// (160 initially, +160 per step — useIncrementalList.ts). Clicking the Show
// more button scrolls it into view first, which can also trip the scroll
// sentinel — one interaction may reveal more than a single chunk, so the
// assertions below are growth-based rather than exact-count.

test('items grid mounts capped and Show more reveals more', async ({ page }) => {
  await page.goto('/items')
  const cards = page.getByTestId('item-card')
  await expect(cards.first()).toBeVisible()
  await expect(cards).toHaveCount(160)
  await page.getByTestId('item-show-more').click()
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(320)
})

test('scrolling to the bottom auto-reveals more items', async ({ page }) => {
  await page.goto('/items')
  const cards = page.getByTestId('item-card')
  await expect(cards).toHaveCount(160)
  // Wheel over the content column (not the fixed top nav); the sentinel
  // entering the 800px pre-reveal margin bumps the count without clicking.
  await page.mouse.move(640, 400)
  await expect(async () => {
    await page.mouse.wheel(0, 4000)
    expect(await cards.count()).toBeGreaterThan(160)
  }).toPass({ timeout: 15_000 })
})

test('filtering to a small category removes the Show more control', async ({ page }) => {
  await page.goto('/items')
  await expect(page.getByTestId('item-show-more')).toBeVisible()
  // Glider is a small category (~5 items), well under one chunk.
  await page.getByTestId('item-cat-Glider').click()
  await expect(page.getByTestId('item-show-more')).toHaveCount(0)
  const cards = page.getByTestId('item-card')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThan(160)
  // Clearing the filter resets the reveal to the initial capped chunk.
  await page.getByTestId('item-cat-Glider').click()
  await expect(cards).toHaveCount(160)
})

test('reveal depth survives list → detail → back', async ({ page }) => {
  await page.goto('/items')
  const cards = page.getByTestId('item-card')
  await expect(cards).toHaveCount(160)
  await page.getByTestId('item-show-more').click()
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(320)
  // Let any chained sentinel reveals settle before capturing the depth.
  await expect
    .poll(async () => {
      const before = await cards.count()
      await page.waitForTimeout(300)
      return (await cards.count()) === before
    })
    .toBe(true)
  const depth = await cards.count()
  await cards.first().click()
  await expect(page).toHaveURL(/\/items\/.+/)
  await page.goBack()
  // sessionStorage restores the reveal depth so scroll restoration can land
  // (restored scroll may trip the sentinel again, so >= not ==).
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(depth)
})

test('buildings grid reveals incrementally too', async ({ page }) => {
  await page.goto('/buildings')
  const tiles = page.getByTestId('building-card')
  await expect(tiles.first()).toBeVisible()
  await expect(tiles).toHaveCount(160)
  await page.getByTestId('building-show-more').click()
  await expect.poll(() => tiles.count()).toBeGreaterThanOrEqual(320)
})
