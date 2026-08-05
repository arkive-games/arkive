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
  await expect(page.getByText('120P')).toBeVisible()
  await expect(page.getByText('4阶位').first()).toBeVisible()
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
  const engraving = await page.locator('select[aria-label="刻印效果"] option').count()
  expect(engraving).toBeGreaterThan(200)
})

test('picking a scoring bracelet line moves the score', async ({ page }) => {
  await ready(page)
  const before = await score(page).textContent()

  const select = page.locator('select[aria-label="刻印效果"]')
  // Scoring lines are the ones labelled with their amp.
  const value = await select
    .locator('option')
    .evaluateAll((els) => els.find((e) => e.textContent?.includes('%'))?.getAttribute('value'))
  await select.selectOption(value ?? '')

  await expect(score(page)).not.toHaveText(before ?? '')
  await expect(page.locator('aside').getByText('手镯')).toBeVisible()
})

test('the shared footer is present', async ({ page }) => {
  await ready(page)
  const footer = page.locator('footer')
  await expect(footer).toBeVisible()
  await expect(footer).toContainText('Arkive Games')
})
