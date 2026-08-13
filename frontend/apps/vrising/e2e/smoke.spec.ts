import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import {
  clickMarker,
  expectPixelsChanged,
  hoverMarker,
  isolatedMarkerByIcon,
  openMap,
} from './glMap'

const SITE_VERSION = (JSON.parse(
  readFileSync(new URL('../src/changelog.json', import.meta.url), 'utf8'),
) as { entries: { version: string }[] }).entries[0].version

// Markers, tiles, region polygons and patrol routes are all drawn INTO one
// canvas, so none of them is in the DOM. Two techniques replace the element
// assertions: watching the NETWORK for the images the engine uploads as textures,
// and comparing the RENDERED PIXELS before and after an interaction. Markers are
// clicked and hovered at their projected screen point - see glMap.ts.
//
// Tile-grid coverage lives in engine.spec.ts, which asserts the 5x5 bounds.

test('marker icons are fetched for the pin atlas', async ({ page }) => {
  const icons: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('MapIcon_')) icons.push(r.url())
  })
  await openMap(page)
  await expect.poll(() => icons.length, { timeout: 15_000 }).toBeGreaterThan(0)
})

test('toggling a subtype changes what the map draws', async ({ page }) => {
  const canvas = await openMap(page)
  // Give the first full paint time to land before sampling it.
  await page.waitForTimeout(1500)
  const before = await canvas.screenshot()
  await page.getByTestId('subtype-toggle-poi').click()
  await expectPixelsChanged(canvas, before)
})

test('selecting a marker opens a popup naming its region', async ({ page }) => {
  await openMap(page)
  // 372 region markers overlap at the whole-map zoom, so pick the one with the
  // most clearance and click it zoomed in, where nothing else is under it.
  const marker = await isolatedMarkerByIcon(page, 'MapIcon_')
  await clickMarker(page, marker)
  await expect(page.getByTestId('marker-detail-drawer')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('marker-region')).toBeVisible()
})

test('data fetches carry the artifact-version cache-buster', async ({ page }) => {
  // version.json (stamped by tools) is fetched first; every other data URL must
  // then carry ?v=<version> so long-cached files bust on data deploys.
  const dataRequests: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/data/') && url.pathname !== '/data/version.json') {
      dataRequests.push(url.pathname + url.search)
    }
  })
  await openMap(page)
  await expect.poll(() => dataRequests.length, { timeout: 15_000 }).toBeGreaterThan(0)
  for (const u of dataRequests) expect(u).toMatch(/\?v=[0-9a-f]{12}$/)
})

test('switching language localizes both UI chrome and data labels', async ({ page }) => {
  await openMap(page)
  await page.getByTestId('lang-menu').click()
  await page.getByTestId('lang-zh-CN').click()
  // App UI string (i18n resources) and a data-locale taxonomy label (types.json).
  await expect(page.getByRole('heading', { name: '夜族崛起互动地图' })).toBeVisible()
  await expect(page.getByText('兴趣点').first()).toBeVisible({ timeout: 10_000 })
})

test('About panel shows the linked Arkive attribution and Stunlock disclaimer', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('lang-menu').click()
  await page.getByTestId('lang-zh-CN').click()
  await page.getByTestId('sidebar-toggle-right').click()

  const about = page.getByRole('complementary', { name: '关于' })
  const arkiveLink = about.getByRole('link', { name: '藏舟攻略网' })
  await expect(arkiveLink).toHaveAttribute('href', 'http://localhost:15172')
  await expect(about.getByText('Stunlock Studios').first()).toBeVisible()
  await expect(about.getByText('藏舟游戏攻略网')).toHaveCount(0)
})

// The version section is two links now, not a dialog: this game's own history
// stays in-app at /changelog, and the shared platform history lives under the
// updates hash on the Arkive home page.
test('About panel links this game history and the shared platform history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sidebar-toggle-right').click()
  const about = page.getByRole('complementary', { name: 'About' })

  const gameUpdates = about.getByTestId('site-info-game-updates-link')
  await expect(gameUpdates).toBeVisible()
  await expect(gameUpdates).toHaveAttribute('href', '/changelog')
  await expect(gameUpdates).toContainText(SITE_VERSION)

  // Derive the platform link from the attribution link rather than restating
  // the deploy target, which differs between dev, production and toy builds.
  const arkiveHome = await about.getByTestId('site-info-arkive-link').getAttribute('href')
  expect(arkiveHome).toBeTruthy()
  const platformUpdates = about.getByTestId('site-info-platform-updates-link')
  await expect(platformUpdates).toHaveAttribute('href', `${arkiveHome}#updates`)
  await expect(platformUpdates).toHaveAttribute('target', '_blank')
})

// The route is a set of overlay lines drawn into the canvas, so its colour is no
// longer inspectable - what is observable is that hovering the boss changes the
// rendered output, which it can only do by drawing the route.
test('hovering a roaming boss draws its patrol route', async ({ page }) => {
  const canvas = await openMap(page)
  const boss = await isolatedMarkerByIcon(
    page,
    'BossPortrait_CHAR_Bandit_Chaosarrow_VBlood',
  )
  // Park the camera on the boss first, so the baseline shot already contains its
  // pin and the only later difference is the route.
  await hoverMarker(page, boss)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1000)
  const before = await canvas.screenshot()

  await hoverMarker(page, boss)
  await expectPixelsChanged(canvas, before)
})

test('the changelog page renders the current version', async ({ page }) => {
  await page.goto('/changelog')
  await expect(page.getByRole('heading', { name: /Changelog/i })).toBeVisible()
  await expect(page.getByText(SITE_VERSION).first()).toBeVisible()
})
