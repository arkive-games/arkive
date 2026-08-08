import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const SITE_VERSION = (JSON.parse(
  readFileSync(new URL('../src/changelog.json', import.meta.url), 'utf8'),
) as { entries: { version: string }[] }).entries[0].version

// Markers render as Leaflet divIcons: a .leaflet-marker-icon div whose innerHTML
// contains an <img> with the icon URL. Tiles come from
// /vrisingres/tiles/Vardoran/Vardoran_XX_YY.webp via the Vite dev middleware.
//
// Every map test here pins `?engine=leaflet`: the WebGL engine is the default
// now (see lib/mapEngineChoice) and draws everything into one canvas, so there
// are no `.leaflet-*` elements to assert on. Engine selection and persistence
// have their own spec (engine.spec.ts).

test('renders Vardoran tiles', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(
    page.locator('img.leaflet-tile[src*="/vrisingres/tiles/Vardoran/"]').first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('tile URLs use the 5x5 grid and never index past it', async ({ page }) => {
  const tiles: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/vrisingres/tiles/Vardoran/')) tiles.push(r.url())
  })
  await page.goto('/?engine=leaflet')
  await expect(
    page.locator('img.leaflet-tile[src*="/vrisingres/tiles/Vardoran/"]').first(),
  ).toBeVisible({ timeout: 15_000 })
  expect(tiles.length).toBeGreaterThan(0)
  for (const url of tiles) {
    const m = /Vardoran_(\d{2})_(\d{2})\.webp/.exec(url)
    expect(m, url).not.toBeNull()
    expect(Number(m![1])).toBeLessThan(5)
    expect(Number(m![2])).toBeLessThan(5)
  }
})

test('region markers render with their game icons', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(
    page.locator('.leaflet-marker-pane .leaflet-marker-icon img[src*="MapIcon_"]').first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('toggling a subtype hides its markers', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  const pins = page.locator('.leaflet-marker-pane .leaflet-marker-icon img[src*="MapIcon_CavePassage"]')
  await expect(pins.first()).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('subtype-toggle-poi').click()
  await expect(pins).toHaveCount(0, { timeout: 10_000 })
})

test('selecting a marker opens a popup naming its region', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  // 372 region markers overlap heavily at the whole-map zoom, so a hit-tested
  // click lands on a stacked sibling — dispatch the click on the element
  // itself, as palworld's completion spec does for its boss pins.
  await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().dispatchEvent('click')
  await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 10_000 })
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
  await page.goto('/?engine=leaflet')
  await expect(
    page.locator('.leaflet-marker-pane .leaflet-marker-icon').first(),
  ).toBeVisible({ timeout: 15_000 })
  expect(dataRequests.length).toBeGreaterThan(0)
  for (const u of dataRequests) expect(u).toMatch(/\?v=[0-9a-f]{12}$/)
})

test('switching language localizes both UI chrome and data labels', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  await expect(page.locator('.leaflet-container')).toBeVisible()
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
  await expect(arkiveLink).toHaveAttribute('href', 'https://tc-imba.com')
  await expect(about.getByText(/本站与 Stunlock Studios 无隶属关系/)).toBeVisible()
  await expect(about.getByText('藏舟游戏攻略网')).toHaveCount(0)
})

test('hovering a roaming boss draws its patrol route in red', async ({ page }) => {
  await page.goto('/?engine=leaflet')
  const roamingBoss = page.locator(
    '.leaflet-marker-icon:has(img[src*="BossPortrait_CHAR_Bandit_Chaosarrow_VBlood"])',
  ).first()
  await expect(roamingBoss).toBeVisible({ timeout: 15_000 })
  await roamingBoss.dispatchEvent('mouseover')

  await expect.poll(async () => page.locator('path.leaflet-interactive').evaluateAll(
    (paths) => paths.filter((path) => path.getAttribute('stroke')?.toLowerCase() === '#e5484d').length,
  )).toBeGreaterThan(0)
})

test('the changelog page renders the current version', async ({ page }) => {
  await page.goto('/changelog')
  await expect(page.getByRole('heading', { name: /Changelog/i })).toBeVisible()
  await expect(page.getByText(SITE_VERSION).first()).toBeVisible()
})
