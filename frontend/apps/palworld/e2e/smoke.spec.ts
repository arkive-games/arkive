import { test, expect, type Page } from '@playwright/test'

// The engine draws tiles and markers into ONE canvas, so neither is in the DOM:
// tiles are uploaded as GPU textures and marker icons are composed into a bitmap
// atlas. What stays observable is the NETWORK — the app still fetches
// /palres/tiles/<MapId>/<MapId>_XX_YY.webp and the marker icon images — so the
// "is the right map drawn" assertions here watch requests instead of elements.
// Clicking a marker and reading what it opens lives in map.spec.ts, which drives
// the canvas through the engine's window handle.

/** Open the map and wait until the canvas is up. */
async function openMap(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('gl-map-canvas')).toBeVisible({ timeout: 20_000 })
}

/** Collect every request whose URL contains `needle`, from now on. */
function watchRequests(page: Page, needle: string): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    if (r.url().includes(needle)) seen.push(r.url())
  })
  return seen
}

test('renders MainWorld tiles', async ({ page }) => {
  const tiles = watchRequests(page, '/palres/tiles/MainWorld/')
  await openMap(page)
  await expect.poll(() => tiles.length, { timeout: 15_000 }).toBeGreaterThan(0)
})

test('fast-travel markers are present', async ({ page }) => {
  // The fast-travel subtype is `defaultActive`, so its icon must be fetched for
  // the pin atlas as soon as the map draws.
  const icons = watchRequests(page, 'T_icon_compass_FTtower')
  await openMap(page)
  await expect.poll(() => icons.length, { timeout: 15_000 }).toBeGreaterThan(0)
})

test('switching language to ko-KR localizes UI and data labels', async ({ page }) => {
  await openMap(page)
  await page.getByTestId('lang-menu').click()
  await page.getByTestId('lang-ko-KR').click()
  // App UI string (i18n resources) + data-locale taxonomy label (types.json).
  await expect(page.getByRole('heading', { name: '팰월드 지도' })).toBeVisible()
  await expect(page.getByText('팰 출현 지점').first()).toBeVisible({ timeout: 10_000 })
})

test('data fetches carry the artifact-version cache-buster', async ({ page }) => {
  // version.json (stamped by tools) is fetched first; every other data URL
  // must then carry ?v=<version> so long-cached files bust on data deploys.
  const dataRequests: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/data/') && url.pathname !== '/data/version.json') {
      dataRequests.push(url.pathname + url.search)
    }
  })
  const icons = watchRequests(page, 'T_icon_compass_FTtower')
  await openMap(page)
  // Wait until the map has really drawn markers, so the marker/taxonomy fetches
  // are certain to have happened.
  await expect.poll(() => icons.length, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(dataRequests.length).toBeGreaterThan(0)
  for (const u of dataRequests) expect(u).toMatch(/\?v=[0-9a-f]{12}$/)
})

test('map switch swaps tile URLs', async ({ page }) => {
  const mainWorld = watchRequests(page, '/palres/tiles/MainWorld/')
  const worldTree = watchRequests(page, '/palres/tiles/WorldTree/')
  await openMap(page)
  await expect.poll(() => mainWorld.length, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(worldTree).toHaveLength(0)

  await page.getByTestId('map-select').click()
  await page.getByTestId('map-option-WorldTree').click()
  await expect.poll(() => worldTree.length, { timeout: 15_000 }).toBeGreaterThan(0)
})
