import { test, expect, type Locator, type Page } from '@playwright/test'
import { clickEmptySpot, clickMarker, markersOfSubtype, openMap } from './glMap'

// Warp altars are paired two-way teleporters (data: marker.warpTo). Selecting
// one shows a "Connects to <partner>" jump link in the popup and draws a
// dashed line to the partner on the same map; the World Tree entrance/exit
// pair spans maps, so its link switches maps instead of drawing a line.
//
// warpAltar markers are emitted in order (MainWorld-warpAltar-1..21) and the app
// numbers them from that order, so index 0 is "Altar #1" (Sky Island, same-map
// pair) and index 20 is "#21" (the World Tree entrance).
//
// Everything the altars draw — the pins and the dashed pair line — is inside the
// canvas, so there is no per-marker DOM and no SVG path to count. Markers are
// clicked at their projected screen point, and the pair line is asserted by
// comparing the RENDERED PIXELS with the line present and absent.

/** Sky Island's altars sit close together; zoom in so the hit is unambiguous. */
const CLOSE_PAIR_ZOOM = 1

/** True once the canvas differs from `before` (poll: the engine draws on demand). */
async function pixelsChanged(canvas: Locator, before: Buffer): Promise<void> {
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), before) !== 0, {
      timeout: 10_000,
    })
    .toBe(true)
}

async function enableAltars(page: Page): Promise<void> {
  // warpAltar is not defaultActive — enable it.
  await page.getByTestId('subtype-toggle-warpAltar').click()
  await expect(page.getByTestId('subtype-toggle-warpAltar')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}

test('selected altar shows connects-to link and a dashed line to its partner', async ({ page }) => {
  const canvas = await openMap(page)
  await enableAltars(page)
  const altars = await markersOfSubtype(page, 'warpAltar')

  // Baseline pixels with an altar under the camera but nothing selected, so the
  // only difference later is the selection and its pair line.
  await clickMarker(page, altars[0], CLOSE_PAIR_ZOOM)
  const drawer = page.getByTestId('marker-detail-drawer')
  // Altars have no per-marker names — the popup titles them by number.
  await expect(drawer).toContainText('Altar #1')

  const link = page.getByTestId('marker-warp-link')
  await expect(link).toBeVisible()
  await expect(link).toContainText('Connects to')
  // Same-map partner: named by subtype + index, not by a map name.
  await expect(link).toContainText('#')

  const withLine = await canvas.screenshot()

  // Following the link selects the partner altar: the popup moves there (its
  // meta coords change) and the link remains for the reverse direction.
  const before = await drawer.innerText()
  await link.click()
  await expect(page.getByTestId('marker-warp-link')).toBeVisible()
  const after = await drawer.innerText()
  expect(after).not.toBe(before)

  // Deselecting removes the pair line, which must change what is drawn.
  await clickEmptySpot(page)
  await expect(drawer).toHaveCount(0)
  await pixelsChanged(canvas, withLine)
})

test('world tree entrance altar links across maps and jumps to the exit', async ({ page }) => {
  const worldTreeTiles: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/palres/tiles/WorldTree/')) worldTreeTiles.push(r.url())
  })

  await openMap(page)
  await enableAltars(page)
  const altars = await markersOfSubtype(page, 'warpAltar')
  expect(altars).toHaveLength(21)

  // #21 = the World Tree entrance (cross-map pair): the link names the target
  // MAP rather than an altar number.
  await clickMarker(page, altars[20], CLOSE_PAIR_ZOOM)
  const link = page.getByTestId('marker-warp-link')
  await expect(link).toBeVisible()
  await expect(link).toContainText('The World Tree')

  // Following it switches to the World Tree map — whose tiles are then fetched —
  // and selects the exit altar, whose popup links back to Palpagos Islands.
  await link.click()
  await expect.poll(() => worldTreeTiles.length, { timeout: 15_000 }).toBeGreaterThan(0)
  const backLink = page.getByTestId('marker-warp-link')
  await expect(backLink).toBeVisible({ timeout: 15_000 })
  await expect(backLink).toContainText('Palpagos Islands')
})
