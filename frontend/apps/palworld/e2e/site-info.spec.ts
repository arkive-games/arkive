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

  test('the version action opens recent text updates with release dates', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sidebar-toggle-right').click()
    await page.getByTestId('site-info-version-trigger').click()
    const dialog = page.getByTestId('site-info-version-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('time').first()).toHaveText(/^\d{4}-\d{2}-\d{2}$/)
    await expect(dialog.locator('a')).toHaveCount(0)
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
