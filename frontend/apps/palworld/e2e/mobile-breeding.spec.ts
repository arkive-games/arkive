import { test, expect } from '@playwright/test'

// Phone layout of the breeding calculator: both the selection row and every
// recipe read as `A + B = C` in square tiles (the building / technology tile
// language) instead of the desktop chip rows.

test.use({ viewport: { width: 390, height: 844 } })

test('the three pickers are square tiles on one line, separated by + and =', async ({ page }) => {
  await page.goto('/breeding')

  const a = page.getByTestId('breeding-pick-a')
  const b = page.getByTestId('breeding-pick-b')
  const c = page.getByTestId('breeding-pick-c')
  await expect(a).toBeVisible()
  await expect(b).toBeVisible()
  await expect(c).toBeVisible()

  const boxes = await Promise.all([a.boundingBox(), b.boundingBox(), c.boundingBox()])
  const [ba, bb, bc] = boxes.map((box) => box!)
  // One line: same top edge, left to right, inside the viewport.
  expect(Math.abs(ba.y - bb.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(ba.y - bc.y)).toBeLessThanOrEqual(1)
  expect(ba.x).toBeLessThan(bb.x)
  expect(bb.x).toBeLessThan(bc.x)
  expect(bc.x + bc.width).toBeLessThanOrEqual(390)
  // Square (aspect-square must survive the text rows inside).
  for (const box of [ba, bb, bc]) expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2)

  // The separators spell out the recipe the selection builds.
  const seps = page.getByTestId('breeding-picker-row').getByTestId('breeding-tile-sep')
  await expect(seps).toHaveText(['+', '='])

  // Unset pickers read as "any Pal", not as broken cards.
  await expect(a).toContainText('Any Pal')
  await expect(a).toContainText('Parent A')
  await expect(c).toContainText('Child')
})

test('tapping a picker tile opens the Pal list and the pick lands in the URL', async ({ page }) => {
  await page.goto('/breeding')

  await page.getByTestId('breeding-pick-a').click()
  const search = page.getByPlaceholder('Search Pals…')
  await expect(search).toBeVisible()
  await search.fill('Lamball')
  await page.getByRole('option').filter({ hasText: 'Lamball' }).first().click()

  // The query is the source of truth for the selection.
  await expect(page).toHaveURL(/a=SheepBall/)
  const a = page.getByTestId('breeding-pick-a')
  await expect(a).toContainText('Lamball')
  // Metadata rides along on the tile (breeding power, shown from 360px up).
  await expect(a).toContainText('3050')
})

test('a recipe card is three tiles in one line with + and = between them', async ({ page }) => {
  await page.goto('/breeding')

  const card = page.getByTestId('breeding-recipe').first()
  await expect(card).toBeVisible()
  const tiles = card.getByTestId('breeding-tile')
  await expect(tiles).toHaveCount(3)
  await expect(card.getByTestId('breeding-tile-sep')).toHaveText(['+', '='])

  const boxes = await tiles.all()
  const measured = await Promise.all(boxes.map((tile) => tile.boundingBox()))
  const [ta, tb, tc] = measured.map((box) => box!)
  expect(Math.abs(ta.y - tb.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(ta.y - tc.y)).toBeLessThanOrEqual(1)
  expect(tc.x + tc.width).toBeLessThanOrEqual(390)

  // Every tile still links to its Pal, and the card keeps its own actions.
  await expect(tiles.first()).toHaveAttribute('href', /\/pals\//)
  await expect(card.getByRole('button', { name: 'How to breed the parents' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Favorite' })).toBeVisible()
})

test('the card actions sit beside the squares, star above tree, on no extra row', async ({ page }) => {
  await page.goto('/breeding')

  const card = page.getByTestId('breeding-recipe').first()
  const fav = card.getByTestId('breeding-fav')
  const expand = card.getByTestId('breeding-expand')
  const lastTile = card.getByTestId('breeding-tile').last()

  const [bf, be, bt] = await Promise.all([fav.boundingBox(), expand.boundingBox(), lastTile.boundingBox()])
  // Right of the last square, not under it.
  expect(bf!.x).toBeGreaterThan(bt!.x + bt!.width - 2)
  expect(be!.x).toBeGreaterThan(bt!.x + bt!.width - 2)
  // Stacked vertically, favourite on top.
  expect(bf!.y).toBeLessThan(be!.y)
  // Both stay level with the squares — an extra row would push them below.
  expect(bf!.y).toBeGreaterThanOrEqual(bt!.y - 2)
  expect(be!.y + be!.height).toBeLessThanOrEqual(bt!.y + bt!.height + 2)
})

test('drilling in keeps three tiles and swaps the tree button for a closing ×', async ({ page }) => {
  await page.goto('/breeding')

  await page.getByTestId('breeding-recipe').first().getByTestId('breeding-expand').click()
  await expect(page).toHaveURL(/tree=/)

  // The pinned card heading the drill-down closes it instead of expanding.
  const pinned = page.getByTestId('breeding-recipe').first()
  await expect(pinned.getByTestId('breeding-collapse')).toBeVisible()
  await expect(pinned.getByTestId('breeding-expand')).toHaveCount(0)

  // Cards inside a "how to breed X" section keep all three squares, so they are
  // the same size as everything above them (they used to drop the result).
  const nested = page.getByTestId('breeding-recipe').nth(1)
  await expect(nested.getByTestId('breeding-tile')).toHaveCount(3)
  await expect(nested.getByTestId('breeding-tile-sep')).toHaveText(['+', '='])

  await pinned.getByTestId('breeding-collapse').click()
  await expect(page).not.toHaveURL(/tree=/)
})

test('multi-generation puts the generation budget in the middle square', async ({ page }) => {
  await page.goto('/breeding')
  await page.getByRole('button', { name: 'Multi-generation' }).click()

  const row = page.getByTestId('breeding-picker-row')
  // Still a three-tile formula: A + <budget> = C.
  await expect(row.getByTestId('breeding-tile-sep')).toHaveText(['+', '='])
  await expect(row.getByTestId('breeding-pick-b')).toHaveCount(0)
  const genTile = page.getByTestId('breeding-pick-gen')
  await expect(genTile).toBeVisible()
  await expect(genTile).toContainText('2')

  const [ba, bg, bc] = await Promise.all([
    row.getByTestId('breeding-pick-a').boundingBox(),
    genTile.boundingBox(),
    row.getByTestId('breeding-pick-c').boundingBox(),
  ])
  expect(Math.abs(ba!.y - bg!.y)).toBeLessThanOrEqual(1)
  expect(ba!.x).toBeLessThan(bg!.x)
  expect(bg!.x).toBeLessThan(bc!.x)

  await genTile.click()
  await page.getByTestId('breeding-gen-4').click()
  await expect(page).toHaveURL(/gen=4/)
  await expect(genTile).toContainText('4')
})

// The narrowest phone still in use (320px): the three squares plus the two
// separators must fit without a horizontal scrollbar.
test('nothing overflows horizontally at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/breeding')
  await expect(page.getByTestId('breeding-recipe').first()).toBeVisible()

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
})
