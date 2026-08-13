import { expect, test } from '@playwright/test'
import { openMap } from './glMap'

const PHONE = { width: 390, height: 844 }

test.describe('mobile experience', () => {
  test.use({ viewport: PHONE })

  test('map controls form one clear stack above navigation', async ({ page }) => {
    await openMap(page)

    const barTop = (await page.getByTestId('bottom-tab-bar').boundingBox())!.y
    const zoom = (await page.locator('.gmgl-zoom-pill').boundingBox())!
    const search = (await page.getByTestId('map-fab-search').boundingBox())!
    const filter = (await page.getByTestId('map-fab-filter').boundingBox())!

    expect(zoom.y + zoom.height).toBeLessThanOrEqual(search.y)
    expect(search.y + search.height).toBeLessThanOrEqual(filter.y)
    expect(filter.y + filter.height).toBeLessThanOrEqual(barTop)
  })

  test('search and filters use sheets that clear the bottom navigation', async ({ page }) => {
    await openMap(page)

    await page.getByTestId('map-fab-search').click()
    const searchSheet = page.getByTestId('search-sheet')
    await expect(searchSheet).toBeVisible()
    const emptyBox = (await searchSheet.boundingBox())!
    expect(emptyBox.height).toBeLessThan(240)
    const barTop = (await page.getByTestId('bottom-tab-bar').boundingBox())!.y
    expect(emptyBox.y + emptyBox.height).toBeLessThanOrEqual(barTop)

    await page.keyboard.press('Escape')
    await page.getByTestId('map-fab-filter').click()
    const filterSheet = page.getByTestId('filter-sheet')
    await expect(filterSheet).toBeVisible()
    await expect(filterSheet.getByText(/filter/i).first()).toBeVisible()
  })

  test('content pages use the mobile identity header without horizontal overflow', async ({ page }) => {
    await page.goto('/vblood')
    await expect(page.getByTestId('arkive-mobile-header')).toBeVisible()
    await expect(page.getByTestId('bottom-tab-bar')).toBeVisible()
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(widths.scroll).toBe(widths.client)
  })

  test('mobile sheets do not survive the landscape breakpoint', async ({ page }) => {
    await openMap(page)
    await page.getByTestId('map-fab-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.getByTestId('filter-sheet')).toHaveCount(0)
  })
})
