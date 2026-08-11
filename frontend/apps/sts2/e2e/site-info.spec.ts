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

// The version section is two links now, not a dialog: this game's own history
// stays in-app at /changelog, and the shared platform history lives under the
// updates hash on the Arkive home page.
test('version updates link this game history and the shared platform history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('site-info-open').click()
  const panel = page.getByTestId('site-info-panel')
  await expect(panel).toBeVisible()

  const gameUpdates = panel.getByTestId('site-info-game-updates-link')
  await expect(gameUpdates).toHaveAttribute('href', '/changelog')
  // Shape, not a pinned literal — the version changes on every release.
  await expect(gameUpdates).toHaveText(/^View version \d+\.\d+\.\d+$/)

  // Derive the platform link from the attribution link rather than restating
  // the deploy target, which differs between dev, production and toy builds.
  const arkiveHome = await panel.getByTestId('site-info-arkive-link').getAttribute('href')
  expect(arkiveHome).toBeTruthy()
  const platformUpdates = panel.getByTestId('site-info-platform-updates-link')
  await expect(platformUpdates).toHaveAttribute('href', `${arkiveHome}#updates`)
  await expect(platformUpdates).toHaveAttribute('target', '_blank')
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
