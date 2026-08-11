import { test, expect } from '@playwright/test'

const PHONE = { width: 390, height: 844 }
const QQ_GROUP = '1091411026'

// Deliberately engine-agnostic: the site-info panel is map-engine-independent,
// so these run on whatever `lib/mapEngineChoice` defaults to (currently the
// WebGL engine, which renders no `.leaflet-container` at all). Readiness is
// gated on the sidebar's own toggle rather than a Leaflet DOM node.
test.describe('site info — desktop', () => {
  test('the right sidebar renders with the shared feedback group in English', async ({ page }) => {
    await page.goto('/')
    const toggle = page.getByTestId('sidebar-toggle-right')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
    await expect(page.getByTestId('site-info-group-number')).toHaveText(QQ_GROUP)
  })

  test('the panel body renders localized prose, not a raw key', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle-right').click()
    const panel = page.getByTestId('site-info-panel').first()
    await expect(panel).toContainText('About this site')
    await expect(panel).toContainText(
      'This site is not affiliated with, authorized, or endorsed by',
    )
    await expect(panel).not.toContainText('[object Object]')
    await expect(panel).not.toContainText('siteInfo.')
  })

  test('switching to zh-CN localizes the always-present feedback group', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await page.getByTestId('lang-menu').click()
    await page.getByTestId('lang-zh-CN').click()
    await page.getByTestId('sidebar-toggle-right').click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
    await expect(page.getByTestId('site-info-group-number')).toHaveText(QQ_GROUP)
  })

  test('the left sidebar toggle is still unique', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(1)
  })

  test('opening the right sidebar is remembered across reloads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('site-info-panel')).toHaveCount(0)
    await page.getByTestId('sidebar-toggle-right').click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
    await page.reload()
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
  })

  test('the desktop top bar omits the About shortcut', async ({ page }) => {
    await page.goto('/pals')
    await expect(page.getByTestId('contact-menu')).toHaveCount(0)
  })

  test('the panel points at the Arkive portal', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle-right').click()
    const panel = page.getByTestId('site-info-panel').first()
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('built and maintained by')
    const link = panel.getByTestId('site-info-arkive-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText('Arkive')
    // Not pinned to a literal URL: the target is build-time config
    // (`VITE_HOME_URL`, or a same-origin path in a toy build).
    await expect(link).toHaveAttribute('href', /.+/)
    // Web build only — a toy build spreads no target/rel.
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The version section is two links now, not a dialog: this game's own history
  // stays in-app at /changelog, and the shared platform history lives under the
  // updates hash on the Arkive home page.
  test('the version section links this game history and the shared platform history', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle-right').click()
    const panel = page.getByTestId('site-info-panel').first()
    await expect(panel).toBeVisible()

    const gameUpdates = panel.getByTestId('site-info-game-updates-link')
    await expect(gameUpdates).toHaveAttribute('href', '/changelog')
    // Shape, not a pinned literal — the version changes on every release.
    await expect(gameUpdates).toHaveText(/^View version \d+\.\d+\.\d+$/)

    // Not pinned to a literal URL for the same reason as the portal link above:
    // the home target is build-time config, so derive it from that link.
    const arkiveHome = await panel.getByTestId('site-info-arkive-link').getAttribute('href')
    expect(arkiveHome).toBeTruthy()
    const platformUpdates = panel.getByTestId('site-info-platform-updates-link')
    await expect(platformUpdates).toHaveAttribute('href', `${arkiveHome}#updates`)
    await expect(platformUpdates).toHaveAttribute('target', '_blank')
  })

  test('the right sidebar is a named landmark reporting its collapsed state', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('complementary', { name: 'About' })).toHaveCount(1)
    const toggle = page.getByTestId('sidebar-toggle-right')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

test.describe('site info — phone', () => {
  test.use({ viewport: PHONE })

  test('the More sheet carries the panel, and a phone map has no right sidebar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('tab-more')).toBeVisible() // page really rendered
    await expect(page.getByTestId('sidebar-toggle-right')).toHaveCount(0) // now meaningful
    await page.getByTestId('tab-more').click()
    await expect(page.getByTestId('site-info-panel')).toBeVisible()
  })
})
