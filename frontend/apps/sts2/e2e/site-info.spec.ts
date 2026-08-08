import { test, expect } from '@playwright/test'

const QQ_GROUP = '1091411026'

test('every page exposes the shared About dialog', async ({ page }) => {
  await page.goto('/cards')
  await page.getByTestId('site-info-open').click()
  const panel = page.getByTestId('site-info-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('About this site')
  await expect(panel.getByText('Mega Crit').first()).toBeVisible()
  await expect(page.getByTestId('site-info-group-number')).toHaveText(QQ_GROUP)
})

test('version updates show release dates and text without repository links', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('site-info-open').click()
  await page.getByTestId('site-info-version-trigger').click()
  const dialog = page.getByTestId('site-info-version-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('time').first()).toHaveText(/^\d{4}-\d{2}-\d{2}$/)
  await expect(dialog.locator('li').first()).not.toBeEmpty()
  await expect(dialog.locator('a')).toHaveCount(0)
})

test('Chinese About copy uses the unified heading and linked Arkive name', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('lang-menu').click()
  await page.getByTestId('lang-zh-CN').click()
  await page.getByTestId('site-info-open').click()
  const panel = page.getByTestId('site-info-panel')
  await expect(panel).toContainText('\u5173\u4e8e\u672c\u7ad9')
  await expect(panel.getByRole('link', { name: '\u85cf\u821f\u653b\u7565\u7f51' })).toHaveAttribute('href', /.+/)
})
