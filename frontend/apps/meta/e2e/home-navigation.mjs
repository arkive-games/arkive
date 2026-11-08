import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against the meta dev server: node apps/meta/e2e/home-navigation.mjs
const base = process.env.META_TEST_URL ?? 'http://localhost:15172/'
const browser = await chromium.launch({ headless: true })
let checks = 0

try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: touch ? 390 : 1440, height: touch ? 844 : 1000 },
      isMobile: touch,
      hasTouch: touch,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    // Verify the destination without depending on another game server being up.
    await page.route('**/*', (route) => {
      if (route.request().isNavigationRequest() && new URL(route.request().url()).origin !== new URL(base).origin) {
        return route.fulfill({ contentType: 'text/html', body: '<title>Destination</title>' })
      }
      return route.continue()
    })
    const home = async () => {
      await page.goto(base)
      await page.waitForLoadState('networkidle')
      await page.locator('.home-quick a').first().waitFor()
    }
    const navigate = async (href, action) => {
      await Promise.all([page.waitForURL(href), action()])
      assert.equal(page.url(), href)
      checks++
    }
    await home()
    const gameCount = await page.locator('.home-quick a:has(.is-game)').count()
    assert.ok(gameCount > 0)
    for (let index = 0; index < gameCount; index++) {
      await home()
      const tile = page.locator('.home-quick a:has(.is-game)').nth(index)
      const href = await tile.evaluate((element) => element.href)
      await navigate(href, () => touch ? tile.tap() : tile.click())
    }

    if (!touch) {
      await home()
      const tile = page.locator('.home-quick a:has(.is-game)').nth(1)
      const href = await tile.evaluate((element) => element.href)
      const box = await tile.locator('img').boundingBox()
      assert.ok(box)
      // A small movement used to start native image dragging and swallow the click.
      await navigate(href, async () => {
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 7, y + 2, { steps: 4 })
        await page.mouse.up()
      })
    }

    await home()
    const slides = await page.locator('.home-slide').count()
    for (let index = 1; index < slides; index++) {
      for (const slot of [-1, 0, 1]) {
        await home()
        const current = (index - slot + slides) % slides
        await page.locator('.home-hero-dots > button').nth(current).click()
        const slide = page.locator('.home-slide').nth(index)
        assert.equal(await slide.getAttribute('data-d'), String(slot))
        assert.notEqual(await slide.getAttribute('aria-hidden'), 'true')
        const href = await slide.evaluate((element) => element.href)
        assert.ok(href)
        // Click the exposed strip, not the covered center of a side slide.
        const point = await slide.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const y = rect.y + rect.height / 2
          for (let x = Math.max(0, rect.x) + 3; x < Math.min(innerWidth, rect.right); x += 3) {
            if (element.contains(document.elementFromPoint(x, y))) return { x, y }
          }
          return null
        })
        assert.ok(point, 'The slide has a visible click target')
        await navigate(href, () => touch
          ? page.touchscreen.tap(point.x, point.y)
          : page.mouse.click(point.x, point.y))
      }
    }

    await home()
    await page.locator('.home-hero-dots > button').nth(2).click()
    const box = await page.locator('.home-slide[data-d="0"]').boundingBox()
    assert.ok(box)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    if (touch) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 80, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
    } else {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x - 80, y, { steps: 5 })
      await page.mouse.up()
    }
    await page.locator('.home-slide').nth(3).waitFor({ state: 'visible' })
    assert.equal(await page.locator('.home-slide').nth(3).getAttribute('data-d'), '0')
    assert.equal(page.url(), base, 'Swiping changes slides without navigating')
    checks++
    if (!touch) {
      const side = page.locator('a.home-slide[data-d="-1"]')
      const href = await side.evaluate((element) => element.href)
      await side.focus()
      await navigate(href, () => page.keyboard.press('Enter'))
    }
    await context.close()
  }
  console.log(`Passed ${checks} homepage navigation checks (mouse, touch, small movement, keyboard and swipe).`)
} finally {
  await browser.close()
}
