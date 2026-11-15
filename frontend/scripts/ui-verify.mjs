import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const output = path.join(root, 'output/playwright/ui-acceptance')
const baseline = path.join(output, 'baseline')
const portal = process.env.UI_REVIEW_URL ?? 'http://127.0.0.1:15172'
const args = process.argv.slice(2)
const update = args.includes('--update-baseline')
const routes = args.includes('--routes')
if (args.some(arg => !['--update-baseline', '--routes'].includes(arg))) throw new Error('Usage: ui-verify.mjs [--update-baseline] [--routes]')
mkdirSync(output, { recursive: true })
if (update) mkdirSync(baseline, { recursive: true })

const report = { session: 'ui-acceptance', recordedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), worktreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()), mode: update ? 'candidate-baseline' : 'compare', browser: '', checks: [], captures: [], errors: [] }
const pendingReferences = new Map()
const browser = await chromium.launch({ channel: process.env.UI_REVIEW_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined) })
report.browser = browser.version()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', colorScheme: 'light', reducedMotion: 'reduce' })
const page = await context.newPage()
page.setDefaultTimeout(20000)

async function check(name, action) {
  try { const details = await action(); report.checks.push({ name, passed: true, details }); console.log(`PASS ${name}`) }
  catch (error) { report.errors.push(`${name}: ${error.message}`); report.checks.push({ name, passed: false }); console.error(`FAIL ${name}: ${error.message}`) }
}

async function noOverflow() {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  assert.ok(dimensions.scrollWidth <= dimensions.width + 1, JSON.stringify(dimensions))
  return dimensions
}

async function capture(name, locator, keepPointer = false) {
  await page.evaluate(() => document.fonts.ready)
  // Put the pointer outside specimens; hover is tested separately.
  if (!keepPointer) await page.mouse.move(0, 0)
  const png = await (locator ?? page).screenshot({ animations: 'disabled', ...(locator ? {} : { fullPage: true }) })
  writeFileSync(path.join(output, `${name}.png`), png)
  const reference = path.join(baseline, `${name}.png`)
  if (update) { pendingReferences.set(reference, png); report.captures.push({ name, state: 'candidate recorded if all checks pass' }); return }
  if (!existsSync(reference)) throw new Error(`Missing baseline ${name}; review the gallery, then explicitly record with --update-baseline`)
  const diff = await page.evaluate(async ({ before, after }) => {
    const image = data => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = `data:image/png;base64,${data}` })
    const [a, b] = await Promise.all([image(before), image(after)])
    if (a.width !== b.width || a.height !== b.height) return { ratio: 1, dimensionsChanged: true }
    const canvas = document.createElement('canvas'); canvas.width = a.width; canvas.height = a.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(a, 0, 0); const old = ctx.getImageData(0, 0, a.width, a.height).data
    ctx.clearRect(0, 0, a.width, a.height); ctx.drawImage(b, 0, 0); const now = ctx.getImageData(0, 0, b.width, b.height)
    let changed = 0
    for (let i = 0; i < old.length; i += 4) {
      if ([0, 1, 2, 3].some(channel => Math.abs(old[i + channel] - now.data[i + channel]) > 16)) {
        changed++; now.data[i] = 255; now.data[i + 1] = 0; now.data[i + 2] = 80; now.data[i + 3] = 255
      }
    }
    ctx.putImageData(now, 0, 0)
    return { ratio: changed / (a.width * a.height), changed, pixels: a.width * a.height, image: changed ? canvas.toDataURL('image/png').split(',')[1] : undefined }
  }, { before: readFileSync(reference).toString('base64'), after: png.toString('base64') })
  if (diff.image) writeFileSync(path.join(output, `${name}-diff.png`), Buffer.from(diff.image, 'base64'))
  const { image: _image, ...summary } = diff
  report.captures.push({ name, ...summary })
  assert.ok(diff.ratio <= 0.001, `${name}: ${(diff.ratio * 100).toFixed(3)}% pixels changed (limit 0.1%); baseline is not overwritten`)
}

try {
  const environmentFile = path.join(baseline, 'environment.json')
  if (!update && existsSync(environmentFile)) {
    const environment = JSON.parse(readFileSync(environmentFile, 'utf8'))
    assert.equal(report.browser, environment.browser, 'Baseline browser differs; explicitly review a new local reference')
    assert.equal(process.platform, environment.platform, 'Baseline platform differs; explicitly review a new local reference')
  }
  await page.goto(`${portal}/ui-review.html`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-review-ready]').waitFor()
  await check('shared control geometry and disabled actions', async () => {
    const geometry = await page.locator('[data-review=searches] .catalog-search').evaluateAll(forms => forms.map(form => {
      const style = getComputedStyle(form); const rect = form.getBoundingClientRect()
      const button = form.querySelector('button[type=submit]'); const bounds = button.getBoundingClientRect()
      return { height: rect.height, radius: parseFloat(style.borderRadius), innerHeight: bounds.height, disabled: button.disabled }
    }))
    assert.equal(geometry.length, 3)
    assert.ok(geometry.every(item => Math.abs(item.height - geometry[0].height) < 1 && item.radius >= item.height / 2))
    assert.equal(geometry[2].disabled, true)
    return geometry
  })
  await check('filter state changes retain geometry', async () => {
    const filter = page.getByTestId('review-filter'); const before = await filter.boundingBox()
    await filter.click(); assert.equal(await filter.getAttribute('aria-pressed'), 'false')
    const after = await filter.boundingBox(); assert.equal(before.height, after.height); assert.equal(before.width, after.width)
    await filter.click()
  })
  await check('search submit and clear preserve focus', async () => {
    const input = page.getByTestId('review-filled-search')
    await input.fill('search-state'); await input.press('Enter'); assert.equal(await input.inputValue(), 'search-state')
    await input.locator('..').getByRole('button', { name: /清空/ }).click()
    assert.equal(await input.inputValue(), '')
    assert.equal(await input.evaluate(el => el === document.activeElement), true)
    await input.fill('帕鲁球')
  })
  await check('directory collapses to icon links without resetting selection', async () => {
    const rail = page.getByTestId('encyclopedia-rail')
    const waitForWidth = rem => page.waitForFunction(({ rem }) => {
      const rail = document.querySelector('[data-testid=encyclopedia-rail]')
      return rail && Math.abs(rail.getBoundingClientRect().width - rem * parseFloat(getComputedStyle(document.documentElement).fontSize)) < 1
    }, { rem })
    await waitForWidth(11.5)
    const expanded = await rail.boundingBox()
    await rail.getByRole('button', { name: /收起/ }).click()
    await page.locator('[data-encyclopedia-workspace][data-collapsed=true]').waitFor()
    // React's state attribute can settle before the next layout frame.
    await waitForWidth(4)
    const collapsed = await rail.boundingBox()
    const scale = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
    assert.ok(Math.abs(expanded.width - 11.5 * scale) < 1)
    assert.ok(Math.abs(collapsed.width - 4 * scale) < 1)
    assert.equal(await rail.getByRole('button', { name: '道具', exact: true }).getAttribute('aria-current'), 'page')
    await rail.getByRole('button', { name: /展开/ }).click()
    await page.locator('[data-encyclopedia-workspace][data-collapsed=false]').waitFor()
    await waitForWidth(11.5)
    return { expanded: expanded.width, collapsed: collapsed.width }
  })
  await check('dialog focus stays inside and returns to its trigger', async () => {
    const trigger = page.getByTestId('review-dialog-trigger'); await trigger.click()
    const dialog = page.getByRole('dialog'); await dialog.waitFor()
    await capture('dialog', dialog)
    await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-testid=review-dialog-trigger]'))
  })
  await check('button hover retains its silhouette', async () => {
    const button = page.getByTestId('review-action')
    const before = await button.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, radius: getComputedStyle(el).borderRadius }))
    await button.hover()
    assert.deepEqual(await button.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, radius: getComputedStyle(el).borderRadius })), before)
    await capture('action-hover', page.locator('[data-review=actions]'), true)
  })
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    await check(`gallery ${width} ${theme}`, async () => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.getByTestId(`review-${theme}`).click()
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
      await noOverflow()
      await capture(`gallery-${width}-${theme}`)
      const disabled = page.locator('[aria-disabled=true]')
      assert.equal(await disabled.locator('button[type=submit]').isDisabled(), true)
    })
  }
  await check('keyboard focus and reduced motion', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByTestId('review-light').click()
    const input = page.locator('[data-review=searches] input').first(); await input.focus()
    assert.ok(await input.locator('..').evaluate(el => getComputedStyle(el).outlineStyle !== 'none'))
    const duration = await input.locator('..').locator('button[type=submit]').evaluate(el => getComputedStyle(el).transitionDuration)
    assert.ok(duration.split(',').every(value => parseFloat(value) <= 0.0001), duration)
    await capture('search-focus', page.locator('[data-review=searches]'))
  })
  if (routes) {
    for (const hash of ['games', 'tools']) await check(`portal ${hash} filter/search/empty footer`, async () => {
      await page.goto(`${portal}/#${hash}`, { waitUntil: 'domcontentloaded' })
      const search = page.locator('.catalog-search input'); await search.waitFor()
      await search.fill('zz-no-matching-record-928374')
      await page.locator('.catalog-empty').waitFor()
      const query = await search.inputValue(); assert.ok(query.includes('928374'))
      await page.locator('footer').scrollIntoViewIfNeeded(); await noOverflow()
      assert.equal(await page.locator('footer button, footer a').filter({ hasText: /关于藏舟|联系我们|更新日志|网站设置/ }).count(), 4)
      const geometry = await page.locator('.catalog-controls').evaluate(el => ({ search: el.querySelector('.catalog-search').getBoundingClientRect().height, filter: el.querySelector('.catalog-categories').getBoundingClientRect().height }))
      assert.ok(Math.abs(geometry.search - geometry.filter) < 1)
      await search.fill(''); await page.locator('.catalog-game-card, .tools-card').first().waitFor()
      return geometry
    })
    for (const hash of ['', 'games', 'tools']) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) await check(`portal reference ${hash || 'home'} ${width} ${theme}`, async () => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.goto(`${portal}/${hash ? `#${hash}` : ''}`, { waitUntil: 'domcontentloaded' })
      await page.locator(hash === 'games' ? '.catalog-game-card' : hash === 'tools' ? '.tools-card' : '[data-testid=home-footer]').first().waitFor()
      await page.evaluate(() => { document.querySelectorAll('img').forEach(img => img.loading = 'eager') })
      await page.waitForFunction(() => [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 }).every(img => img.complete && img.naturalWidth > 0))
      await page.evaluate(() => document.fonts.ready)
      await noOverflow()
      await page.screenshot({ path: path.join(output, `portal-${hash || 'home'}-${width}-${theme}.png`), animations: 'disabled' })
    })
    for (const [game, port] of [['aion2', 15173], ['palworld', 15174]]) for (const width of [1440, 390]) await check(`map reference ${game} ${width}`, async () => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('gl-map-canvas').waitFor({ timeout: 45000 })
      await page.waitForFunction(() => Boolean(window.__glMap), null, { timeout: 45000 })
      await noOverflow()
      assert.equal(await page.locator('footer[data-slot=site-footer]').count(), 0)
      if (width === 1440) {
        const toggle = page.getByTestId('sidebar-toggle')
        const before = await toggle.getAttribute('aria-label')
        await toggle.click(); await page.waitForFunction(label => document.querySelector('[data-testid=sidebar-toggle]')?.getAttribute('aria-label') !== label, before)
        await toggle.click()
        const input = page.getByTestId('marker-search')
        await input.fill('search-state'); await input.fill('')
      }
      // Map pixels depend on current remote game artifacts. Retain references,
      // but do not silently promote them to deterministic component baselines.
      await page.waitForLoadState('networkidle', { timeout: 15000 })
      await page.screenshot({ path: path.join(output, `map-${game}-${width}.png`), animations: 'disabled' })
    })
  }
} catch (error) { report.errors.push(error.message) }
finally {
  await context.close(); await browser.close()
  if (update && report.errors.length === 0) {
    for (const [file, png] of pendingReferences) writeFileSync(file, png)
    writeFileSync(path.join(baseline, 'environment.json'), JSON.stringify({ browser: report.browser, platform: process.platform, worktreeDirty: report.worktreeDirty, recordedAt: report.recordedAt, commit: report.commit, status: 'Candidate reference; human approval is separate.' }, null, 2) + '\n')
  }
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(`ui-verify: ${report.checks.filter(check => check.passed).length}/${report.checks.length} checks passed; report: ${output}/report.json`)
if (report.errors.length) process.exitCode = 1
