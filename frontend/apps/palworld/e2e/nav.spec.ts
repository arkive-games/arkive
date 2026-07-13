import { test, expect } from '@playwright/test'

test('Database dropdown opens and navigates to a catalog route', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('nav-dropdown-database')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const itemsLink = page.getByRole('menuitem', { name: 'Items' })
  await expect(itemsLink).toBeVisible()
  await itemsLink.click()
  await expect(page).toHaveURL(/\/items$/)
})

test('Database trigger shows active styling on a catalog route', async ({ page }) => {
  await page.goto('/buildings')
  await expect(page.getByTestId('nav-dropdown-database')).toHaveClass(/text-primary/)
})

test('Pals dropdown navigates to the Passive Skills page and search filters it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-dropdown-pals').click()
  const passivesLink = page.getByRole('menuitem', { name: 'Passive Skills' })
  await expect(passivesLink).toBeVisible()
  await passivesLink.click()
  await expect(page).toHaveURL(/\/passives$/)

  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  expect(total).toBeGreaterThan(0)

  // Each passive shows a rarity/rank indicator.
  await expect(page.locator('[data-testid="passive-row"] span[title^="Rank"]').first()).toBeVisible()

  // A query that can't match anything empties the list; clearing restores it.
  await page.getByTestId('passive-search').fill('zzzzzzzzzz')
  await expect(rows).toHaveCount(0)
  await page.getByTestId('passive-search').fill('')
  await expect(rows.first()).toBeVisible()
})

test('Passive Skills rarity filter (chips) narrows the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  const chip = page.locator('[data-testid^="rarity-"]').first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('Passive Skills category filter (chips) narrows the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  await page.getByTestId('category-work').click()
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('Passive Skills innate chip keeps only passives some pal carries by default', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  const chip = page.getByTestId('category-innate')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
  // Every remaining card lists at least one pal that innately carries it.
  for (let i = 0; i < filtered; i++) {
    await expect(rows.nth(i).locator('[data-testid="passive-pal"]').first()).toBeVisible()
  }
})

test('Item page category chips filter the grid', async ({ page }) => {
  await page.goto('/items')
  const cards = page.getByTestId('item-card')
  await expect(cards.first()).toBeVisible()
  // Rendered tiles are capped by the incremental reveal, so compare the
  // matched-total label rather than the tile count.
  const readTotal = async () =>
    Number((await page.getByTestId('item-count').innerText()).replace(/\D/g, ''))
  const total = await readTotal()
  const chip = page.locator('[data-testid^="item-cat-"]').first()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  const filtered = await readTotal()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
  expect(await cards.count()).toBeGreaterThan(0)
})

test('Effigies and Key Spheres are listed; illegal dead data stays hidden', async ({ page }) => {
  await page.goto('/items')
  const cards = page.getByTestId('item-card')
  await expect(cards.first()).toBeVisible()
  // The old opt-in "Hidden items" toggle is gone.
  await expect(page.getByTestId('item-show-hidden')).toHaveCount(0)
  const search = page.getByPlaceholder('Search items…')
  // Whitelisted bLegalInGame=false items (effigies, Key Spheres) are shown.
  await search.fill('Effigy')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThanOrEqual(13) // Lifmunk + 12 pal effigies
  await search.fill('Key Sphere')
  await expect(cards.first()).toBeVisible()
  // Non-whitelisted illegal rows (deprecated dupes) never appear — 'Magnum
  // Ammo' exists in the data only as a bLegalInGame=false row.
  await search.fill('Magnum Ammo')
  await expect(cards).toHaveCount(0)
})

test('Building page category chips toggle', async ({ page }) => {
  await page.goto('/buildings')
  const chip = page.locator('[data-testid^="building-cat-"]').first()
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
})

test('Multi-line tooltip text fills the tooltip width', async ({ page }) => {
  await page.goto('/passives')
  await page.getByTestId('category-mutation').hover()
  const tip = page.locator('[data-slot="tooltip-content"]')
  await expect(tip).toBeVisible()
  // The mutation tip wraps to several lines under max-w-xs; greedy wrapping
  // must fill the available width instead of leaving a gap on the right
  // (text-balance shortens lines without shrinking the box).
  const { inner, maxLine, lines } = await tip.evaluate((el) => {
    const textNode = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
    const range = document.createRange()
    range.selectNodeContents(textNode!)
    const rects = [...range.getClientRects()]
    const cs = getComputedStyle(el)
    return {
      inner: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      maxLine: Math.max(...rects.map((r) => r.width)),
      lines: rects.length,
    }
  })
  expect(lines).toBeGreaterThan(1)
  expect(maxLine).toBeGreaterThan(inner - 40)
})

test('Passive cards link the pals that carry the passive', async ({ page }) => {
  await page.goto('/passives')
  const palLink = page.locator('[data-testid="passive-pal"]').first()
  await expect(palLink).toBeVisible()
  await expect(palLink).toHaveAttribute('href', /\/pals\//)
})

test('Passive title bar uses the faceted rarity figure or flat bar', async ({ page }) => {
  await page.goto('/passives')
  await expect(page.locator('[data-testid="passive-row"] > div:first-child').first()).toBeVisible()
  const bars = await page.locator('[data-testid="passive-row"] > div:first-child').evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el)
      return { img: s.backgroundImage, bg: s.backgroundColor }
    }),
  )
  // Blue/gold rarities show the pre-coloured faceted webp figure (no CSS blend).
  const figures = bars.filter((b) => b.img.includes('skill_base_02'))
  expect(figures.length).toBeGreaterThan(0)
  expect(figures.every((b) => b.img.includes('.webp'))).toBe(true)
  // Normal / detrimental rarities use the flat dark bar (#1F2428).
  const flat = bars.filter((b) => b.img === 'none')
  expect(flat.every((b) => b.bg === 'rgb(31, 36, 40)')).toBe(true)
})

test('Passive rarity renders tinted arrow icons', async ({ page }) => {
  await page.goto('/passives')
  const badge = page.locator('[data-testid="passive-row"] span[title^="Rank"]').first()
  await expect(badge).toBeVisible()
  const info = await badge.evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, mask: s.maskImage || (s as unknown as { webkitMaskImage: string }).webkitMaskImage }
  })
  expect(info.mask).toContain('passive-rank')
  expect(info.bg).not.toBe('rgba(0, 0, 0, 0)')
})

test('Passive arrow count is abs(rank), independent of the colour tier', async ({ page }) => {
  await page.goto('/passives')
  await page.getByTestId('passive-search').fill('Musclehead')
  // Musclehead is Rank 2 in-game: two gold chevrons (arrow_02), not the tier icon.
  const up = page.locator('[data-testid="passive-row"] span[title="Rank 2"]').first()
  await expect(up).toBeVisible()
  expect(await up.evaluate((el) => getComputedStyle(el).maskImage)).toContain('arrow_02')
  await page.getByTestId('passive-search').fill('Slacker')
  // Slacker is Rank -3: three red chevrons pointing down (arrow_03 flipped).
  const down = page.locator('[data-testid="passive-row"] span[title="Rank -3"]').first()
  await expect(down).toBeVisible()
  expect(await down.evaluate((el) => getComputedStyle(el).maskImage)).toContain('arrow_03')
  expect(await down.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none')
})

test('Passive descriptions render coloured value tags', async ({ page }) => {
  await page.goto('/passives')
  await expect(page.locator('[data-testid="passive-row"]').first()).toBeVisible()
  const coloured = page.locator(
    '[data-testid="passive-row"] p span[class*="5591BD"], [data-testid="passive-row"] p span[class*="B4493E"]',
  )
  expect(await coloured.count()).toBeGreaterThan(0)
})
