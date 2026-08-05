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

/**
 * Pick an engraving through the searchable combobox.
 *
 * The picker is a Popover + cmdk list (the same pattern palworld's PalPicker
 * uses), not a <select>, so it cannot be driven with selectOption.
 */
async function pickEngraving(page: Page, slot: number, query?: string) {
  await page.locator(`[role="combobox"][aria-label^="刻印 ${slot}"]`).click()
  if (query) await page.locator('input[placeholder="搜索刻印…"]').fill(query)
  // Row 0 is the clear row when no query narrows the list, so skip past it.
  await page.locator('[cmdk-item]').nth(query ? 0 : slot).click()
}

/** Open a slot's list and read back what it offers. */
async function engravingRows(page: Page, slot: number) {
  await page.locator(`[role="combobox"][aria-label^="刻印 ${slot}"]`).click()
  const rows = await page.locator('[cmdk-item]').allTextContents()
  await page.keyboard.press('Escape')
  return rows
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

test('ark grid shows six slots, three per row', async ({ page }) => {
  await ready(page)
  for (const name of ['秩序之日', '秩序之月', '秩序之星', '混沌之日', '混沌之月', '混沌之星']) {
    await expect(page.getByLabel(`${name} 品质`)).toBeVisible()
    await expect(page.getByLabel(`${name} 核心`)).toBeVisible()
  }
})

test('the slot name lives in the hovercard, not on the card', async ({ page }) => {
  await ready(page)
  const tip = page.locator('[data-slot="hover-card-content"]')
  await page.getByLabel('秩序之日 效果').hover()
  await expect(tip).toContainText('秩序之日')
})

test('chaos slots are shared across classes, order slots are not', async ({ page }) => {
  await ready(page)
  const order = page.getByLabel('秩序之日 核心')
  const chaos = page.getByLabel('混沌之日 核心')

  await page.getByLabel('职业', { exact: true }).selectOption({ label: '圣骑士' })
  const orderA = await order.locator('option').allTextContents()
  const chaosA = await chaos.locator('option').allTextContents()

  await page.getByLabel('职业', { exact: true }).selectOption({ label: '狂战士' })
  expect(await order.locator('option').allTextContents()).not.toEqual(orderA)
  // Chaos cores carry PCClass 0, so they must not change with the class.
  expect(await chaos.locator('option').allTextContents()).toEqual(chaosA)
})

test('the point slider offers only eligible thresholds', async ({ page }) => {
  await ready(page)
  const slider = page.getByLabel('秩序之日 点数')
  await expect(slider).toBeDisabled()

  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')
  await expect(slider).toBeEnabled()
  // Seven stops for six thresholds: stop 0 is unactivated, stops 1..6 select
  // 10/14/17/18/19/20.
  await expect(slider).toHaveAttribute('min', '0')
  await expect(slider).toHaveAttribute('max', '6')

  const card = page.locator('article').filter({ has: page.getByLabel('秩序之日 点数') })
  for (const p of ['10', '14', '17', '18', '19', '20']) {
    await expect(card.getByText(p, { exact: true })).toBeVisible()
  }
})

test('equipping a core moves the score', async ({ page }) => {
  await ready(page)
  const before = await score(page).textContent()

  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')
  await page.getByLabel('秩序之日 点数').fill('6')

  await expect(score(page)).not.toHaveText(before ?? '')
  await expect(page.locator('aside').getByText('方舟核心 1')).toBeVisible()

  // The active threshold shows on the card; the effect text lives in the
  // hovercard, covered by its own test.
  const card = page.locator('article').filter({ has: page.getByLabel('秩序之日 点数') })
  await expect(card.getByText('20P')).toBeVisible()
})

test('support emits two components that are summed', async ({ page }) => {
  await ready(page)
  // The sub-class decides the role, so pick a class that has a support one.
  await page.getByLabel('职业', { exact: true }).selectOption({ label: '圣骑士' })
  await page.getByRole('tab', { name: /祝福光环/ }).click()

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

test('engravings compound, using the client amps', async ({ page }) => {
  await ready(page)
  const rail = page.locator('aside')

  // Both land on 遗物 level 1 by default, which is growth code 10 in
  // BattlePoint Type 10: 怨恨 0.1875, 肾上腺素 0.1625. The fan site instead
  // published 0.18 and 0.152 as "base" — its base is legend level 4 (code 9),
  // a different cell of the same grid.
  await pickEngraving(page, 1, '怨恨')
  await expect(rail.getByText('18.75%')).toBeVisible()

  // Compound rather than sum: 1.1875 * 1.1625 - 1 = 0.38047.
  await pickEngraving(page, 2, '肾上腺素')
  await expect(rail.getByText('38.05%')).toBeVisible()
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

test('the sub-class decides the role', async ({ page }) => {
  await ready(page)
  await page.getByLabel('职业', { exact: true }).selectOption({ label: '圣骑士' })

  // 裁决许可 is the damage spec, 祝福光环 the support one.
  await page.getByRole('tab', { name: /裁决许可/ }).click()
  await expect(page.locator('aside').getByText('恢复战斗力')).toHaveCount(0)

  await page.getByRole('tab', { name: /祝福光环/ }).click()
  await expect(page.locator('aside').getByText('恢复战斗力').first()).toBeVisible()
  await expect(page.locator('aside').getByText('最大生命值')).toBeVisible()
})

test('each class gets its own six cores per slot', async ({ page }) => {
  await ready(page)
  await page.getByLabel('职业', { exact: true }).selectOption({ label: '圣骑士' })
  const sel = page.getByLabel('秩序之日 核心')
  // Six cores plus the leading 未选择 option.
  await expect(sel.locator('option')).toHaveCount(7)
  const paladin = await sel.locator('option').allTextContents()

  await page.getByLabel('职业', { exact: true }).selectOption({ label: '狂战士' })
  await expect(sel.locator('option')).toHaveCount(7)
  const berserker = await sel.locator('option').allTextContents()

  // Order-slot cores are class-specific, so the lists must differ.
  expect(berserker).not.toEqual(paladin)
})

test('the icon hovercard stacks every activated threshold', async ({ page }) => {
  await ready(page)
  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')
  await page.getByLabel('秩序之日 点数').fill('6')

  await page.getByLabel('秩序之日 效果').hover()
  // The shared HoverCard is Radix; its content carries no role, so target the
  // data-slot the ui package sets.
  const tip = page.locator('[data-slot="hover-card-content"]')
  await expect(tip).toBeVisible()
  // Effects stack, so reaching 20P shows all six thresholds, not just the last.
  await expect(tip.locator('li')).toHaveCount(6)
  for (const p of ['10P', '14P', '17P', '18P', '19P', '20P']) {
    await expect(tip.getByText(p)).toBeVisible()
  }
  await expect(tip).not.toContainText('$TABLE')
})

test('the hovercard survives moving the pointer onto it', async ({ page }) => {
  await ready(page)
  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')
  await page.getByLabel('秩序之日 点数').fill('6')

  const tip = page.locator('[data-slot="hover-card-content"]')
  await page.getByLabel('秩序之日 效果').hover()
  await expect(tip).toBeVisible()

  // The whole point of using Radix over a hand-rolled tooltip: the pointer can
  // travel off the small icon and onto the card without it closing, so the text
  // is actually readable and scrollable.
  await tip.hover()
  await expect(tip).toBeVisible()
})

test('the first slider stop is unactivated, not the lowest threshold', async ({ page }) => {
  await ready(page)
  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')

  const slider = page.getByLabel('秩序之日 点数')
  const card = page.locator('article').filter({ has: page.getByLabel('秩序之日 点数') })

  // Seven stops for six thresholds: stop 0 means nothing is activated. Indexing
  // straight into the thresholds put 10P on stop 0 and left the tick labels one
  // position out of step with the thumb.
  await expect(slider).toHaveAttribute('min', '0')
  await expect(slider).toHaveAttribute('max', '6')
  await expect(slider).toHaveValue('0')
  await expect(card.getByText('未激活')).toBeVisible()

  await slider.fill('1')
  await expect(card.getByText('10P')).toBeVisible()
  await slider.fill('6')
  await expect(card.getByText('20P')).toBeVisible()
})

test('effect rows use the game\'s own colours', async ({ page }) => {
  await ready(page)
  // Unselected is now the default, so a core must be chosen before a grade.
  await page.getByLabel('秩序之日 核心').selectOption('0')
  await page.getByLabel('秩序之日 品质').selectOption('3')
  await page.getByLabel('秩序之日 点数').fill('3')

  await page.getByLabel('秩序之日 效果').hover()
  const rows = page.locator('[data-slot="hover-card-content"] li')

  // Every threshold is listed, not just the reached ones.
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(0)).toContainText('[10P]')
  await expect(rows.nth(5)).toContainText('[20P]')

  // Numbers keep the client's green and "命运" its purple, because the pipeline
  // carries the game's <FONT COLOR> spans through rather than re-deriving them.
  const green = rows.nth(0).locator('span[style*="rgb(153, 255, 153)"]')
  await expect(green.first()).toBeVisible()

  // Unreached thresholds are flat grey: no accent spans at all.
  await expect(rows.nth(5).locator('span[style*="rgb("]')).toHaveCount(0)
})

test('a core must be picked before a quality', async ({ page }) => {
  await ready(page)
  await expect(page.getByLabel('秩序之日 品质')).toBeDisabled()
  await page.getByLabel('秩序之日 核心').selectOption('0')
  await expect(page.getByLabel('秩序之日 品质')).toBeEnabled()
})

test('the shared top bar carries the version and stays on screen', async ({ page }) => {
  await ready(page)

  // The version comes from changelog.json entries[0] rather than a literal, so
  // assert the shape: a hard-coded string here would rot at the next bump.
  await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible()

  const bar = page.locator('header').first()
  await expect(bar).toHaveCSS('position', 'sticky')

  // Scrolling past the fold must not take the bar with it.
  await page.getByText('方舟星阵核心').scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: '战斗力计算器' })).toBeVisible()
})

test('the theme toggle cycles dark to auto to light and survives a reload', async ({ page }) => {
  await ready(page)

  const html = page.locator('html')
  // defaultTheme is dark, so that is where an empty storage lands.
  await expect(html).toHaveClass(/dark/)

  // The button is labelled with the *current* theme and advances on click:
  // dark -> auto -> light -> dark.
  await page.getByRole('button', { name: '深色' }).click()
  await expect(page.getByRole('button', { name: '自动' })).toBeVisible()

  await page.getByRole('button', { name: '自动' }).click()
  await expect(page.getByRole('button', { name: '浅色' })).toBeVisible()
  await expect(html).not.toHaveClass(/dark/)

  await page.reload()
  await expect(page.getByRole('button', { name: '浅色' })).toBeVisible()
  await expect(html).not.toHaveClass(/dark/)
})

test('ark passive renders three trees named by the client', async ({ page }) => {
  await ready(page)
  // tip.name.enum_arkpassivegroup_* — the enum behind ArkPassive.Group.
  for (const tree of ['进化', '顿悟', '飞跃']) {
    await expect(page.getByLabel(`${tree} 点数`)).toBeVisible()
  }
})

test('only the dials the client actually scores are editable', async ({ page }) => {
  await ready(page)
  // BattlePoint Type 8 keys off the evolution tier and Type 9 off the leap
  // level. Enlightenment has neither, so offering it both would be a lie.
  await expect(page.getByLabel('进化 阶位')).toBeEnabled()
  await expect(page.getByLabel('进化 等级')).toBeDisabled()
  await expect(page.getByLabel('顿悟 阶位')).toBeDisabled()
  await expect(page.getByLabel('顿悟 等级')).toBeDisabled()
  await expect(page.getByLabel('飞跃 等级')).toBeEnabled()
  await expect(page.getByLabel('飞跃 阶位')).toBeDisabled()
})

test('the medallion lights up with the tier and moves the score', async ({ page }) => {
  await ready(page)
  const card = page.locator('article', { has: page.getByLabel('进化 点数') })

  // Nothing invested: no medallion, just the placeholder.
  await expect(card.locator('img')).toHaveCount(0)

  const before = await score(page).textContent()
  await page.getByLabel('进化 点数').fill('120')
  await page.getByLabel('进化 阶位').selectOption('4')

  // Tier 4 art, from the use_12 sheet.
  await expect(card.locator('img')).toHaveAttribute('src', 'karma/evolution_4.png')
  await expect(score(page)).not.toHaveText(before ?? '')
})

test('the karma hovercard uses the game format strings, not raw templates', async ({
  page,
}) => {
  await ready(page)
  await page.getByLabel('进化 点数').fill('120')
  await page.getByLabel('进化 阶位').selectOption('4')
  await page.getByLabel('进化 业力').hover()

  // sys.arkpassive.ui_title_arkpassive_point is "{0}P" and
  // ui_title_list_item_tier is "{0}阶位" — a placeholder leaking through here
  // means a format string got rendered as a label.
  const tip = page.locator('[data-slot="hover-card-content"]')
  await expect(tip.getByText('120P')).toBeVisible()
  // Scoped to the hovercard: 4阶位 is also an <option> on the tier select,
  // and an option is never "visible" to Playwright.
  await expect(tip.getByText('4阶位')).toBeVisible()
  await expect(page.getByText('{0}')).toHaveCount(0)
})

test('bracelet offers the three groups the client ships', async ({ page }) => {
  await ready(page)
  // sys.bracelet.option_group_01/02/03. option_group_04 (特殊效果) exists but
  // only the legacy pool 910000010 uses it, so it is not a fourth column.
  for (const group of ['基本效果', '战斗特性', '刻印效果']) {
    await expect(page.getByLabel(group)).toBeVisible()
  }
  await expect(page.getByLabel('特殊效果')).toHaveCount(0)
})

test('bracelet lines come from the client, not the fan-site subset', async ({ page }) => {
  await ready(page)
  // The fan site hard-codes 54 dps rows total. The client's engraving group
  // alone offers far more, so a small count here means the old table is back.
  await page.locator('[role="combobox"][aria-label^="刻印效果"]').click()
  const engraving = await page.locator('[cmdk-item]').count()
  expect(engraving).toBeGreaterThan(200)
})

test('picking a scoring bracelet line moves the score', async ({ page }) => {
  await ready(page)
  const before = await score(page).textContent()

  // Scoring lines are the ones whose row carries an amp.
  await page.locator('[role="combobox"][aria-label^="刻印效果"]').click()
  await page.locator('[cmdk-item]').filter({ hasText: '%' }).first().click()

  await expect(score(page)).not.toHaveText(before ?? '')
  // Scoped to the amp list: the coverage notice also names 手镯 now.
  await expect(page.locator('aside li').filter({ hasText: '手镯' })).toHaveCount(1)
})

test('engravings are five columns naming the 43 general ones', async ({ page }) => {
  await ready(page)
  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(`[role="combobox"][aria-label^="刻印 ${i}"]`)).toBeVisible()
    await expect(page.getByLabel(`刻印 ${i} 品质`)).toBeVisible()
    await expect(page.getByLabel(`刻印 ${i} 等级`)).toBeVisible()
    await expect(page.getByLabel(`刻印 ${i} 能力石`)).toBeVisible()
  }
  // The 43 GENERAL engravings, plus the empty option. Class engravings are
  // excluded: the rework made them class identities and the client gives them no
  // amp grid. The old fan-site picker offered 17.
  expect(await engravingRows(page, 1)).toHaveLength(44)
})

test('at most two engravings can carry an ability stone', async ({ page }) => {
  await ready(page)
  for (let i = 1; i <= 3; i++) await pickEngraving(page, i)
  await expect(page.getByLabel('刻印 3 能力石')).toBeEnabled()

  await page.getByLabel('刻印 1 能力石').selectOption('4')
  await page.getByLabel('刻印 2 能力石').selectOption('3')

  // The third is locked out, but the two that hold a stone stay editable —
  // otherwise a stone could never be cleared.
  await expect(page.getByLabel('刻印 3 能力石')).toBeDisabled()
  await expect(page.getByLabel('刻印 1 能力石')).toBeEnabled()
  await expect(page.getByLabel('刻印 2 能力石')).toBeEnabled()

  // Clearing one frees the third again.
  await page.getByLabel('刻印 2 能力石').selectOption('0')
  await expect(page.getByLabel('刻印 3 能力石')).toBeEnabled()
})

test('a fresh engraving pick lands on 遗物 level 1', async ({ page }) => {
  await ready(page)
  await expect(page.getByLabel('刻印 1 品质')).toBeDisabled()

  await pickEngraving(page, 1)
  const grade = page.getByLabel('刻印 1 品质')
  await expect(grade).toBeEnabled()
  await expect(grade.locator('option:checked')).toHaveText('遗物')
  // The growth code has no level 0, so the level dial starts at 1.
  await expect(page.getByLabel('刻印 1 等级').locator('option:checked')).toHaveText('1级')

  // Clearing the slot drops the grade with it, so an empty slot never keeps one.
  // Clearing through the list's own clear row; the tile trigger has no × now.
  await page.locator('[role="combobox"][aria-label^="刻印 1"]').click()
  await page.locator('[cmdk-item]').first().click()
  await expect(grade.locator('option:checked')).toHaveText('品质')
})

test('engravings with no coefficient say so instead of scoring silently', async ({
  page,
}) => {
  await ready(page)
  // The client ships 95 but the fan-site amp tables cover far fewer, so the
  // picker marks the rest rather than hiding them.
  // 15 of the 43 have no BattlePoint Type 10 grid — defensive and utility
  // engravings genuinely score nothing.
  const rows = await engravingRows(page, 1)
  const marked = rows.filter((r) => r.includes('无战力')).length
  expect(marked).toBeGreaterThan(0)
  expect(marked).toBeLessThan(43)
})

test('engraving quality offers only the growth ladder', async ({ page }) => {
  await ready(page)
  await pickEngraving(page, 1)

  // The amp grid's book axis starts at epic, so 基本 (grade 1) is not on the
  // ladder — offering it would index a cell the client does not define.
  const grades = page.locator('select[aria-label="刻印 1 品质"] option')
  // The first option doubles as the placeholder, so it reads 品质 rather than —.
  await expect(grades).toHaveText(['品质', '英雄', '传说', '遗物'])
  await expect(page.locator('select[aria-label="刻印 1 等级"] option')).toHaveText([
    '1级',
    '2级',
    '3级',
    '4级',
  ])
})

test('engraving amps come from the client and both dials move the score', async ({
  page,
}) => {
  await ready(page)
  // 破釜沉舟 style: pick the first scoring engraving, then move each axis of the
  // growth code independently. BattlePoint Type 10 is a 2D grid, so both must
  // change the total.
  await pickEngraving(page, 1)
  const atLevel1 = await score(page).textContent()

  await page.getByLabel('刻印 1 等级').selectOption('4')
  const atLevel4 = await score(page).textContent()
  expect(atLevel4).not.toBe(atLevel1)

  await page.getByLabel('刻印 1 能力石').selectOption('4')
  await expect(score(page)).not.toHaveText(atLevel4 ?? '')
})

test('no engraving grade+level pair can resolve to an undefined grid cell', async ({
  page,
}) => {
  await ready(page)
  await pickEngraving(page, 1, '怨恨')

  // The growth code is 20*stone + 1 + 4*(grade-2) + level, but the lattice is
  // NOT full: at stone 0 the client's grid starts at code 5, so 英雄 (grade 2)
  // exists only at level 4 — epic is represented as a COMPLETE four-book set.
  // Offering 英雄 levels 1-3 selected a cell that resolved to nothing and
  // silently scored 0.
  await page.getByLabel('刻印 1 品质').selectOption('2')
  await expect(page.locator('select[aria-label="刻印 1 等级"] option')).toHaveText(['4级'])
  // The level snaps rather than being left on an invalid value.
  await expect(page.getByLabel('刻印 1 等级')).toHaveValue('4')

  // 遗物 defines all four, so the dial reopens.
  await page.getByLabel('刻印 1 品质').selectOption('4')
  await expect(page.locator('select[aria-label="刻印 1 等级"] option')).toHaveText([
    '1级',
    '2级',
    '3级',
    '4级',
  ])

  // And every offered pair actually scores.
  for (const grade of ['2', '3', '4']) {
    await page.getByLabel('刻印 1 品质').selectOption(grade)
    const levels = await page
      .locator('select[aria-label="刻印 1 等级"] option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    for (const level of levels) {
      await page.getByLabel('刻印 1 等级').selectOption(level)
      await expect(page.locator('aside li').filter({ hasText: '刻印效果' })).not.toHaveText(
        /0%$/,
      )
    }
  }
})

test('the engraving picker searches and shows icons', async ({ page }) => {
  await ready(page)
  await page.locator('[role="combobox"][aria-label^="刻印 1"]').click()

  // Typing narrows to one row, and the list carries the game's icon per row.
  await page.locator('input[placeholder="搜索刻印…"]').fill('怨恨')
  await expect(page.locator('[cmdk-item]')).toHaveCount(1)
  await expect(page.locator('[cmdk-item] img')).toHaveAttribute('src', 'engravings/grudge.png')

  // The slug is indexed too, so the list is reachable without switching IME.
  await page.locator('input[placeholder="搜索刻印…"]').fill('grudge')
  await expect(page.locator('[cmdk-item]')).toHaveCount(1)

  await page.locator('[cmdk-item]').first().click()
  await expect(page.locator('[role="combobox"][aria-label^="刻印 1"]')).toContainText('怨恨')
})

test('the effect text scales with level and stone', async ({ page }) => {
  await ready(page)
  await pickEngraving(page, 1, '怨恨')

  const tip = page.locator('[data-slot="hover-card-content"]')
  const read = async () => {
    await page.locator('[role="combobox"][aria-label^="刻印 1"]').hover()
    await expect(tip).toBeVisible()
    const text = await tip.innerText()
    await page.mouse.move(2, 2)
    return text
  }

  // The ladder ACCUMULATES: a 遗物 engraving sits on a maxed legend channel, as
  // the client's own Comment2 records every relic state as 영웅 4 / 전설 4 / 유물 N.
  // 怨恨 base 15, legend[4] 3, relic[level] 0.75..3, stone[4] 6.
  //
  // These numbers are cross-checked against the amps, which are a different
  // table: legend L4 = 0.18 at code 9, relic L1 = 0.1875 at code 10, relic L4 =
  // 0.21 at code 13. An earlier version of this test asserted 15.75 / 18.00 /
  // 24.00 — it had the omission of legend[4] written down as the expectation,
  // and so locked the bug in.
  expect(await read()).toContain('18.75%') // 遗物 1级, stone 0

  await page.getByLabel('刻印 1 等级').selectOption('4')
  expect(await read()).toContain('21.00%') // 遗物 4级 — matches amp 0.21

  await page.getByLabel('刻印 1 能力石').selectOption('4')
  expect(await read()).toContain('27.00%') // + stone[4] 6

  // And the tooltip must not contradict the card corner, which reads the amp
  // from a different table entirely.
  await page.getByLabel('刻印 1 能力石').selectOption('0')
  await page.getByLabel('刻印 1 等级').selectOption('4')
  const card = page.locator('article').filter({ hasText: '刻印 1' }).first()
  await expect(card).toContainText('+21.00%')
})

test('the shared footer is present', async ({ page }) => {
  await ready(page)
  const footer = page.locator('footer')
  await expect(footer).toBeVisible()
  await expect(footer).toContainText('Arkive Games')
})

test('the gear selectors show the game\'s own item names, not bare ids', async ({ page }) => {
  await ready(page)
  const armour = page.locator('[role="combobox"][aria-label^="防具套装"]')
  const weapon = page.locator('[role="combobox"][aria-label^="武器"]')

  // Default loadout: 狂战士 at item level 1640. The relic stat template carries
  // two named series, so the set label shows both; the weapon is that class's
  // own greatsword.
  await expect(armour).toContainText('宿命决断')
  await expect(armour).toContainText('疯狂决断')
  await expect(armour).not.toHaveText(/^1015901/)
  await expect(weapon).toContainText('宿命决断大剑')

  // Grade and the stat-template id stay under each control, so a build is still
  // identifiable exactly.
  await expect(page.getByText('遗物 · 1015901')).toBeVisible()
  await expect(page.getByText('遗物 · 10159000 · 100,036')).toBeVisible()
})

test('gear names follow the class, and so does the armour line', async ({ page }) => {
  await ready(page)
  const armour = page.locator('[role="combobox"][aria-label^="防具套装"]')
  const weapon = page.locator('[role="combobox"][aria-label^="武器"]')

  // A class only ever sees the armour of its own main stat: 狂战士 (Str) gets
  // the ...01 line, 吟游诗人 (Int) the ...03 one, with the same numbers.
  await expect(page.getByText('遗物 · 1015901')).toBeVisible()
  await page.getByLabel('职业', { exact: true }).selectOption({ label: '吟游诗人' })
  await expect(page.getByText('遗物 · 1015903')).toBeVisible()
  await expect(armour).toContainText('宿命决断')
  // The weapon name changes with the class even though the template does not.
  await expect(weapon).toContainText('宿命决断丽雅的竖琴')
  await expect(page.getByText('遗物 · 10159000 · 100,036')).toBeVisible()
})

test('the searchable gear lists can be filtered and picked by name', async ({ page }) => {
  await ready(page)
  const weapon = page.locator('[role="combobox"][aria-label^="武器"]')
  await weapon.click()
  await page.locator('input[placeholder="搜索武器…"]').fill('命运业火')
  const rows = await page.locator('[cmdk-item]').allTextContents()
  expect(rows).toHaveLength(1)
  await page.locator('[cmdk-item]').first().click()
  await expect(weapon).toContainText('命运业火大剑')
  await expect(page.getByText('古代 · 11159000 · 100,036')).toBeVisible()
})
