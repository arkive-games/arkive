import { test, expect } from '@playwright/test'

// Phones move every list-page filter behind the mobile header's filter icon (the
// same gesture as the map's filter FAB), so the chip rows stop eating the top of
// the screen. The chips exist in exactly one place per breakpoint: nothing inline
// here, only inside the sheet.
test.use({ viewport: { width: 390, height: 844 } })

test('items page hides the chip row and opens it from the header filter icon', async ({ page }) => {
  await page.goto('/items')
  await expect(page.getByTestId('item-card').first()).toBeVisible()

  // Not merely hidden — the inline copy is not rendered at all on a phone.
  await expect(page.getByTestId('item-category-filter')).toHaveCount(0)

  const button = page.getByTestId('mobile-filter-button')
  await expect(button).toBeVisible()
  await button.click()

  const sheet = page.getByTestId('mobile-filter-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('item-category-filter')).toBeVisible()

  // Rendered tiles are capped by the incremental reveal, so compare the
  // matched-total label rather than the tile count.
  const readTotal = async () =>
    Number((await page.getByTestId('item-count').innerText()).replace(/\D/g, ''))
  const total = await readTotal()
  const chip = sheet.locator('[data-testid^="item-cat-"]').first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  const filtered = await readTotal()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)

  // With the sheet closed the active filter is still advertised by the dot.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('mobile-filter-active-dot')).toBeVisible()
})

test('passive skills filters live in the sheet and still narrow the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()

  await expect(page.getByTestId('passive-rarity-filter')).toHaveCount(0)
  await expect(page.getByTestId('passive-category-filter')).toHaveCount(0)
  // The search box is not a filter: it stays on the page.
  await expect(page.getByTestId('passive-search')).toBeVisible()
  // No stray dot before anything is selected.
  await expect(page.getByTestId('mobile-filter-active-dot')).toHaveCount(0)

  const total = await rows.count()
  await page.getByTestId('mobile-filter-button').click()
  const sheet = page.getByTestId('mobile-filter-sheet')
  await expect(sheet.getByTestId('passive-rarity-filter')).toBeVisible()
  await expect(sheet.getByTestId('passive-category-filter')).toBeVisible()

  await sheet.getByTestId('category-work').click()
  await page.keyboard.press('Escape')
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('paldeck facets live in the sheet and survive closing it', async ({ page }) => {
  await page.goto('/pals')
  const cards = page.getByTestId('pal-card')
  await expect(cards.first()).toBeVisible()

  // The element/work chip block is absent from the page until the sheet opens.
  await expect(page.getByTestId('pal-element-Fire')).toHaveCount(0)

  await page.getByTestId('mobile-filter-button').click()
  const sheet = page.getByTestId('mobile-filter-sheet')
  await expect(sheet).toBeVisible()
  const readTotal = async () =>
    Number((await page.getByTestId('pal-count').innerText()).replace(/\D/g, ''))
  const total = await readTotal()
  const chip = sheet.getByTestId('pal-element-Fire')
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')

  const filtered = await readTotal()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
  await expect(page.getByTestId('mobile-filter-active-dot')).toBeVisible()

  // Reopening shows the selection — the chips are re-mounted, the state is not
  // (it lives in the page, so the sheet can unmount freely).
  await page.getByTestId('mobile-filter-button').click()
  await expect(sheet.getByTestId('pal-element-Fire')).toHaveAttribute('aria-pressed', 'true')
})
