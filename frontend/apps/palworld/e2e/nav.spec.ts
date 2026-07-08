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

test('Passive Skills rarity filter narrows the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  await page.getByTestId('passive-rarity-filter').click()
  await page.locator('[data-testid^="rarity-"]').first().click()
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('Passive Skills category filter narrows the list', async ({ page }) => {
  await page.goto('/passives')
  const rows = page.getByTestId('passive-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()
  await page.getByTestId('passive-category-filter').click()
  await page.getByTestId('category-work').click()
  const filtered = await rows.count()
  expect(filtered).toBeGreaterThan(0)
  expect(filtered).toBeLessThan(total)
})

test('Passive cards link the pals that carry the passive', async ({ page }) => {
  await page.goto('/passives')
  const palLink = page.locator('[data-testid="passive-pal"]').first()
  await expect(palLink).toBeVisible()
  await expect(palLink).toHaveAttribute('href', /\/pals\//)
})

test('Passive title bar uses the faceted rarity background', async ({ page }) => {
  await page.goto('/passives')
  const bar = page.locator('[data-testid="passive-row"] > div').first()
  await expect(bar).toBeVisible()
  const info = await bar.evaluate((el) => {
    const s = getComputedStyle(el)
    return { img: s.backgroundImage, blend: s.backgroundBlendMode, bg: s.backgroundColor }
  })
  expect(info.img).toContain('skill_base_02')
  expect(info.blend).toContain('multiply')
  expect(info.bg).not.toBe('rgba(0, 0, 0, 0)')
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

test('Passive descriptions render coloured value tags', async ({ page }) => {
  await page.goto('/passives')
  await expect(page.locator('[data-testid="passive-row"]').first()).toBeVisible()
  const coloured = page.locator(
    '[data-testid="passive-row"] p span[class*="5591BD"], [data-testid="passive-row"] p span[class*="B4493E"]',
  )
  expect(await coloured.count()).toBeGreaterThan(0)
})
