import { test, expect } from '@playwright/test'

const PHONE = { width: 390, height: 844 }
const QQ_GROUP = '1091411026'

test.describe('site info — desktop', () => {
  test('the right sidebar renders, without a feedback group in English', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel').first()).toBeVisible()
    await expect(page.getByTestId('site-info-group-number')).toHaveCount(0)
  })

  test('switching to zh-CN reveals the feedback group', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.getByTestId('lang-menu').click()
    await page.getByTestId('lang-zh-CN').click()
    await expect(page.getByTestId('site-info-group-number').first()).toHaveText(QQ_GROUP)
  })

  test('the left sidebar toggle is still unique', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(1)
  })

  test('collapsing the right sidebar is remembered across reloads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('site-info-panel').first()).toBeVisible()
    await page.getByTestId('sidebar-toggle-right').click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(0)
  })

  test('the top-bar popover carries the panel on a catalog page', async ({ page }) => {
    await page.goto('/pals')
    await page.getByTestId('contact-menu').click()
    await expect(page.getByTestId('site-info-panel')).toBeVisible()
  })
})

test.describe('site info — phone', () => {
  test.use({ viewport: PHONE })

  test('the More sheet carries the panel and no right sidebar exists', async ({ page }) => {
    await page.goto('/pals')
    await expect(page.getByTestId('sidebar-toggle-right')).toHaveCount(0)
    await page.getByTestId('tab-more').click()
    await expect(page.getByTestId('site-info-panel')).toBeVisible()
  })
})
