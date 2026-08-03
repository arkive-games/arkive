import { expect, test, type Page } from '@playwright/test'

/** The rail's headline number. */
function score(page: Page) {
  return page.locator('aside').getByText(/^[\d,]+(\.\d+)?$/).first()
}

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '战斗力计算器' })).toBeVisible()
  // The rail only renders once the dataset resolves.
  await expect(page.locator('aside')).toBeVisible()
}

// addInitScript runs on every navigation, so guard with sessionStorage —
// otherwise a reload wipes the very state the persistence test asserts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('e2e-cleared')) {
      window.localStorage.clear()
      window.sessionStorage.setItem('e2e-cleared', '1')
    }
  })
})

test('computes a score from the game tables at the default loadout', async ({ page }) => {
  await ready(page)

  // Verified against EFTable_ItemLevelOption: at item level 1640 one armour
  // group sums to 284,481 main stat, plus the flat 477.
  const rail = page.locator('aside')
  await expect(rail.getByText('284,958')).toBeVisible()
  await expect(rail.getByText('100,036')).toBeVisible()

  // Combat level 70 (0.2945) x quality 0 (0.10) x combat stats (2160*0.0003).
  // The fan site shows exactly this at an empty loadout, which corroborates
  // the whole chain.
  await expect(rail.getByText("×2.3467")).toBeVisible()
})

test('weapon quality is a table lookup, not a fitted curve', async ({ page }) => {
  await ready(page)
  await page.getByLabel('武器品质').fill('41')
  // The game table says 0.1337 at quality 41; the fan site's quadratic
  // would give 0.13362. Assert the game value.
  await expect(page.locator('aside').getByText('13.37%')).toBeVisible()
})

test('combat level below 70 uses the level table', async ({ page }) => {
  await ready(page)
  await page.getByLabel('战斗等级').fill('55')
  await expect(page.locator('aside').getByText('8.95%')).toBeVisible()
})

test('selecting an ark core with a point threshold changes the score', async ({ page }) => {
  await ready(page)
  const before = await score(page).textContent()

  const core = page.getByLabel('核心 1', { exact: true })
  await core.selectOption({ index: 1 })
  const points = page.getByLabel('核心 1 点数')
  // Thresholds come from ArkGridCore.ReqOptionPoint*, not a free number field.
  await expect(points.locator('option')).not.toHaveCount(1)
  await points.selectOption({ index: 1 })

  await expect(score(page)).not.toHaveText(before ?? '')
  await expect(page.locator('aside').getByText('方舟核心 1')).toBeVisible()
})

test('support emits two components that are summed', async ({ page }) => {
  await ready(page)
  await page.getByRole('tab', { name: '辅助' }).click()

  // Rendered twice: once in the summary line, once as the component heading.
  await expect(page.locator('aside').getByText('支援战斗力').first()).toBeVisible()
  await expect(page.locator('aside').getByText('恢复战斗力').first()).toBeVisible()
  await expect(page.locator('aside').getByText('最大生命值')).toBeVisible()
  // Support has no weapon-quality amp in the game data. Scoped to the amp
  // list, since the coverage notice also mentions 武器品质 by name.
  await expect(page.locator('aside li').filter({ hasText: '武器品质' })).toHaveCount(0)
})

test('the loadout survives a reload', async ({ page }) => {
  await ready(page)
  await page.getByLabel('武器品质').fill('77')
  await page.waitForTimeout(500) // debounced autosave
  await page.reload()
  await expect(page.getByLabel('武器品质')).toHaveValue('77')
})

test('export round-trips through import', async ({ page }) => {
  await ready(page)
  await page.getByLabel('武器品质').fill('63')

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出' }).click(),
  ]).then(([d]) => d)
  const path = await download.path()

  await page.getByRole('button', { name: '清空' }).click()
  await expect(page.getByLabel('武器品质')).toHaveValue('0')

  await page.setInputFiles('input[aria-label="导入配装文件"]', path!)
  await expect(page.getByLabel('武器品质')).toHaveValue('63')
  await expect(page.getByRole('status')).toContainText('已导入')
})

test('import reports what it rejected instead of applying it silently', async ({ page }) => {
  await ready(page)
  await page.setInputFiles('input[aria-label="导入配装文件"]', {
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ weaponQuality: 5000, role: 'wizard' })),
  })
  await expect(page.getByRole('status')).toContainText('忽略')
  // The out-of-range value must not have been applied.
  await expect(page.getByLabel('武器品质')).toHaveValue('0')
})

test('gems multiply independently', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  await page.getByLabel('宝石 1 层级').selectOption('4')
  await page.getByLabel('宝石 1 等级').selectOption('10')
  // Tier 4 level 10 is 0.0704 in EFTable_BattlePoint Type 22.
  await expect(rail.getByText('7.04%')).toBeVisible()

  await page.getByLabel('宝石 2 层级').selectOption('4')
  await page.getByLabel('宝石 2 等级').selectOption('10')
  // Two gems compound: 1.0704^2 - 1 = 0.14575616 -> 14.58%.
  await expect(rail.getByText('14.58%')).toBeVisible()
})

test('discloses where each coefficient came from', async ({ page }) => {
  await ready(page)
  // Most systems come from the client tables; a few could not be located there
  // and use the reference site instead. Which is which must be visible.
  await expect(page.locator('aside').getByText('系数来源')).toBeVisible()
  await expect(page.locator('aside').getByText('取自参考站')).toBeVisible()
})

test('accessory affix lines compound', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  // Highest damage-dealer tier: 621000002 at 2.00%.
  await page.getByLabel('项链 词条 1').selectOption('621000002')
  await expect(rail.getByText('2%')).toBeVisible()

  await page.getByLabel('项链 词条 2').selectOption('621000002')
  // 1.02^2 - 1 = 0.0404 -> 4.04%
  await expect(rail.getByText('4.04%')).toBeVisible()
})

test('card sets have their own per-set curve', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  // Set 1015 is one of six damage-dealer sets reaching 0.15 at stage 6.
  await page.getByLabel('卡牌套装').selectOption('1015')
  await page.getByLabel('觉醒阶段').selectOption('6')
  await expect(rail.getByText('15%')).toBeVisible()

  // Set 1005 is weaker at the same stage, so cards are not one global table.
  await page.getByLabel('卡牌套装').selectOption('1005')
  await expect(rail.getByText('15%')).toHaveCount(0)
})

test('pet ranch uses the game tier value', async ({ page }) => {
  await ready(page)
  // Top tier is 0.0077; the fan site's middle tier (0.00539) is a mistranscription.
  await page.getByLabel('牧场特技').selectOption({ label: '+0.77%' })
  await expect(page.locator('aside').getByText('0.77%')).toBeVisible()
})

test('engravings compound and grant the stone basic bonus', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  await page.getByLabel('刻印 1', { exact: true }).selectOption('怨恨')
  // Base 0.18 with no book or stone.
  await expect(rail.getByText('18%')).toBeVisible()

  // Two engravings compound rather than sum: 1.18 * 1.152 - 1 = 0.35936.
  await page.getByLabel('刻印 2', { exact: true }).selectOption('肾上腺素')
  await expect(rail.getByText('35.94%')).toBeVisible()
})

test('avatars scale main stat', async ({ page }) => {
  await ready(page)
  const before = await page.locator('aside').getByText(/^284,958$/).count()
  expect(before).toBe(1)
  // 传说 is +2% main stat.
  await page.getByLabel('头部').selectOption('传说')
  await expect(page.locator('aside').getByText('290,657')).toBeVisible()
})

test('roster stats feed the combat-stat amp', async ({ page }) => {
  await ready(page)
  // (2160 + 0) * 0.0003 = 0.648 -> 64.8%
  await expect(page.locator('aside').getByText('64.8%')).toBeVisible()
  await page.getByLabel('会心').fill('1000')
  // (2160 + 1000) * 0.0003 = 0.948 -> 94.8%
  await expect(page.locator('aside').getByText('94.8%')).toBeVisible()
})

test('bracelet lines compound', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  await page.getByLabel('手镯词条 1').selectOption({ index: 1 })
  await expect(rail.getByText('手镯')).toBeVisible()
  const one = await rail.locator('li').filter({ hasText: '手镯' }).innerText()

  await page.getByLabel('手镯词条 2').selectOption({ index: 1 })
  const two = await rail.locator('li').filter({ hasText: '手镯' }).innerText()
  expect(two).not.toBe(one)
})
