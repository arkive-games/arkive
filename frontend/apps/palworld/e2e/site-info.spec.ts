import { test, expect } from '@playwright/test'

const PHONE = { width: 390, height: 844 }
const QQ_GROUP = '1091411026'

// Deliberately engine-agnostic: the site-info panel is map-engine-independent,
// so these run on whatever `lib/mapEngineChoice` defaults to (currently the
// WebGL engine, which renders no `.leaflet-container` at all). Readiness is
// gated on the sidebar's own toggle rather than a Leaflet DOM node.
test.describe('site info — desktop', () => {
  test('the right sidebar renders, without a feedback group in English', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
    await expect(page.getByTestId('site-info-group-number')).toHaveCount(0)
  })

  test('the panel body renders localized prose, not a raw key', async ({ page }) => {
    await page.goto('/')
    const panel = page.getByTestId('site-info-panel').first()
    await expect(panel).toContainText('About this site')
    await expect(panel).toContainText(
      'Not affiliated with, endorsed by, or sponsored by Pocketpair, Inc.',
    )
    await expect(panel).not.toContainText('[object Object]')
    await expect(panel).not.toContainText('siteInfo.')
  })

  test('switching to zh-CN reveals the feedback group', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await page.getByTestId('lang-menu').click()
    await page.getByTestId('lang-zh-CN').click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
    await expect(page.getByTestId('site-info-group-number')).toHaveText(QQ_GROUP)
  })

  test('the left sidebar toggle is still unique', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(1)
  })

  test('collapsing the right sidebar is remembered across reloads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('site-info-panel')).toHaveCount(1)
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

  test('the panel points at the Arkive portal', async ({ page }) => {
    await page.goto('/pals')
    await page.getByTestId('contact-menu').click()
    const panel = page.getByTestId('site-info-panel').first()
    await expect(panel).toBeVisible()
    // Blurb: assert the ASCII tail, the head carries the CJK brand alias.
    await expect(panel).toContainText('ad-free game guide sites')
    const link = panel.getByTestId('site-info-arkive-link')
    await expect(link).toBeVisible()
    await expect(link).toContainText('Arkive')
    await expect(link).toHaveAttribute('aria-label', 'Arkive home')
    // Not pinned to a literal URL: the target is build-time config
    // (`VITE_HOME_URL`, or a same-origin path in a toy build).
    await expect(link).toHaveAttribute('href', /.+/)
    // Web build only — a toy build spreads no target/rel.
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('the right sidebar is a named landmark reporting its expanded state', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('complementary', { name: 'About' })).toBeVisible()
    const toggle = page.getByTestId('sidebar-toggle-right')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
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
