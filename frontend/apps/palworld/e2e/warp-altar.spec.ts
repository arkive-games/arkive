import { test, expect } from '@playwright/test'

// Warp altars are paired two-way teleporters (data: marker.warpTo). Selecting
// one shows a "Connects to <partner>" jump link in the popup and draws a
// dashed line to the partner on the same map; the World Tree entrance/exit
// pair spans maps, so its link switches maps instead of drawing a line.
//
// warpAltar markers mount in emit order (MainWorld-warpAltar-1..21), and no
// other subtype uses the T_icon_compass_Teleport icon, so nth() below indexes
// altars deterministically: first() = #1 (Sky Island, same-map pair),
// nth(20) = #21 (the World Tree entrance).

const ALTAR_ICONS =
  '.leaflet-marker-pane .leaflet-marker-icon img[src*="T_icon_compass_Teleport"]'
const DASHED_LINE = '.leaflet-overlay-pane path[stroke-dasharray]'

test('selected altar shows connects-to link and a dashed line to its partner', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  // warpAltar is not defaultActive — enable it.
  await page.getByTestId('subtype-toggle-warpAltar').click()
  const altars = page.locator(ALTAR_ICONS)
  await expect(altars.first()).toBeVisible({ timeout: 15_000 })

  // Sky Island altars overlap at the default zoom — dispatch the click.
  await altars.first().dispatchEvent('click')

  const link = page.getByTestId('marker-warp-link')
  await expect(link).toBeVisible()
  await expect(link).toContainText('Connects to')
  // Same-map partner: named by subtype + index, not by a map name.
  await expect(link).toContainText('#')

  // The pair line is the only overlay path (palworld draws no region polygons).
  await expect(page.locator(DASHED_LINE)).toHaveCount(1)

  // Following the link selects the partner altar: the popup moves there (its
  // meta coords change) and the line + link remain for the reverse direction.
  const before = await page.getByTestId('marker-popup-card').innerText()
  await link.click()
  await expect(page.getByTestId('marker-warp-link')).toBeVisible()
  await expect(page.locator(DASHED_LINE)).toHaveCount(1)
  const after = await page.getByTestId('marker-popup-card').innerText()
  expect(after).not.toBe(before)

  // Deselecting removes the line.
  await page.locator('.leaflet-container').click({ position: { x: 40, y: 40 } })
  await expect(page.locator(DASHED_LINE)).toHaveCount(0)
})

test('world tree entrance altar links across maps and jumps to the exit', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  await page.getByTestId('subtype-toggle-warpAltar').click()
  const altars = page.locator(ALTAR_ICONS)
  await expect(altars.first()).toBeVisible({ timeout: 15_000 })
  await expect(altars).toHaveCount(21, { timeout: 15_000 })

  // #21 = the World Tree entrance (cross-map pair): the link names the target
  // MAP and no same-map line is drawn.
  await altars.nth(20).dispatchEvent('click')
  const link = page.getByTestId('marker-warp-link')
  await expect(link).toBeVisible()
  await expect(link).toContainText('The World Tree')
  await expect(page.locator(DASHED_LINE)).toHaveCount(0)

  // Following it switches to the World Tree map and selects the exit altar,
  // whose popup links back to the Palpagos Islands entrance.
  await link.click()
  await expect(
    page.locator('img.leaflet-tile[src*="/palres/tiles/WorldTree/"]').first(),
  ).toBeVisible({ timeout: 15_000 })
  const backLink = page.getByTestId('marker-warp-link')
  await expect(backLink).toBeVisible({ timeout: 15_000 })
  await expect(backLink).toContainText('Palpagos Islands')
})
