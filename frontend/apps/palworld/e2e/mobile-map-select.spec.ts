import { test, expect, type Page } from '@playwright/test'

// Regression: on phones the map picker lives inside the filter bottom-sheet
// (App.tsx `if (isMobile)` -> <SheetHeader>{mapSelect}</SheetHeader>), and both
// the sheet and the Radix Select listbox portal to <body> as siblings.
// The old Select content layer sat below the Sheet layer, and Radix copies the
// content's computed z-index onto its fixed positioning wrapper, so the
// listbox opened *behind* the sheet. Radix's dialog overlay
// additionally carries an inline `pointer-events: auto` (it has to, because the
// modal sets `pointer-events: none` on <body>), so it swallowed every
// tap aimed at an option too: the picker was invisible AND unclickable, i.e.
// "map selection can not be used" on mobile. ShellMapSelect now uses the named
// nested-overlay layer.
//
// Tiles are GPU textures, not DOM, so "the map really swapped" is asserted on the
// NETWORK — the tile fetch for the new map — as in smoke.spec.ts.

test.use({ viewport: { width: 390, height: 844 } })

/** Collect every request whose URL contains `needle`, from now on. */
function watchRequests(page: Page, needle: string): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    if (r.url().includes(needle)) seen.push(r.url())
  })
  return seen
}

const OVERLAY = '[data-slot="sheet-overlay"]'
const LISTBOX = '[data-slot="select-content"]'

test('mobile map picker switches the map from inside the filter sheet', async ({ page }) => {
  const mainWorld = watchRequests(page, '/palres/tiles/MainWorld/')
  const worldTree = watchRequests(page, '/palres/tiles/WorldTree/')
  await page.goto('/')
  await expect(page.getByTestId('gl-map-canvas')).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => mainWorld.length, { timeout: 15_000 }).toBeGreaterThan(0)

  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()

  const trigger = page.getByTestId('map-select')
  await expect(trigger).toBeVisible()
  await trigger.click()

  const option = page.getByTestId('map-option-WorldTree')
  await expect(option).toBeVisible()

  // The bug this guards: Playwright's own actionability check catches an
  // occluded option (it used to time out with the sheet overlay intercepting
  // the pointer event), but assert the hit test explicitly so a regression
  // reports *why* rather than just "click timed out".
  const hitSlot = await page.evaluate(() => {
    const opt = document.querySelector('[data-testid="map-option-WorldTree"]')
    if (!opt) return 'missing'
    const r = opt.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (!hit) return 'none'
    return hit.closest('[data-testid="map-option-WorldTree"]')
      ? 'option'
      : `covered-by:${hit.getAttribute('data-slot') ?? hit.tagName}`
  })
  expect(hitSlot).toBe('option')

  await option.click()

  // Close the sheet the way a user would and confirm the map really swapped —
  // the tile URL is locale-independent, unlike the trigger's label.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('filter-sheet')).toHaveCount(0)
  await expect.poll(() => worldTree.length, { timeout: 15_000 }).toBeGreaterThan(0)
})

test('the map listbox stacks above the filter sheet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('gl-map-canvas')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('map-fab-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  await page.getByTestId('map-select').click()
  await expect(page.getByTestId('map-option-WorldTree')).toBeVisible()

  // Both the listbox and the wrapper Radix positions it with must clear the
  // sheet layer; Radix reads the wrapper's z-index off the content's computed
  // style, so the two are expected to match.
  const z = await page.evaluate(
    ([listbox, overlay]) => {
      const content = document.querySelector(listbox)
      const ov = document.querySelector(overlay)
      const sheet = document.querySelector('[data-testid="filter-sheet"]')
      const num = (el: Element | null) =>
        el ? Number.parseInt(getComputedStyle(el).zIndex, 10) : Number.NaN
      return {
        content: num(content),
        wrapper: num(content?.parentElement ?? null),
        overlay: num(ov),
        sheet: num(sheet),
      }
    },
    [LISTBOX, OVERLAY] as const,
  )

  expect(z.overlay).toBeGreaterThan(0)
  expect(z.content).toBeGreaterThan(z.overlay)
  expect(z.wrapper).toBeGreaterThan(z.overlay)
  expect(z.content).toBeGreaterThan(z.sheet)
})
