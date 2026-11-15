import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { fillShell } from '../../../scripts/prerender-lib.mjs'

// Build meta first, then run: node apps/meta/e2e/home-first-paint.mjs
// Serve one desktop prerender at every viewport, as the production CDN does.
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const shell = await readFile(path.join(dist, 'index.html'), 'utf8')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
let snapshot
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(snapshot ?? shell)
      return
    }
    const file = path.resolve(dist, `.${decodeURIComponent(pathname)}`)
    if (!file.startsWith(dist)) throw new Error('Invalid asset path')
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser

const readGeometry = () => {
  const hero = document.querySelector('.home-hero')
  const stage = document.querySelector('.home-hero-stage').getBoundingClientRect()
  const slide = document.querySelector('.home-slide[data-d="0"]').getBoundingClientRect()
  const quick = document.querySelector('.home-quick').getBoundingClientRect()
  const image = document.querySelector('.home-slide[data-d="0"] picture img, .home-slide[data-d="0"] > img')
  return {
    stageWidth: stage.width,
    stageHeight: stage.height,
    slideWidth: slide.width,
    slideHeight: slide.height,
    slideLeft: slide.left - stage.left,
    quickOffset: quick.top - stage.top,
    src: image.currentSrc,
    inlineDimensions: ['--w', '--h', '--cw', '--sw'].filter((key) => hero.style.getPropertyValue(key)),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }
}
const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} vs ${expected}`)
const checkViewport = (geometry, { width, height }) => {
  const phone = width <= 760
  const w = phone ? width - 88 : Math.max(560, Math.min(920, width * 0.53, (height - 400) * 3))
  closeTo(geometry.slideWidth, w, 'Banner width')
  closeTo(geometry.slideHeight, w / (phone ? 2 : 3), 'Banner aspect ratio')
  closeTo(geometry.stageWidth, phone ? width : Math.min(width - 32, w / 0.734), 'Stage width')
  closeTo(geometry.stageHeight, geometry.slideHeight, 'Stage reserves the banner height')
  assert.equal(geometry.overflow, false, 'No document-level horizontal overflow')
  assert.match(geometry.src, phone ? /recruit-banner-phone-/ : /recruit-banner-(?!phone)/)
  assert.deepEqual(geometry.inlineDimensions, [], 'The prerender must not freeze viewport dimensions')
}
const compare = (before, after) => {
  for (const key of ['stageWidth', 'stageHeight', 'slideWidth', 'slideHeight', 'slideLeft', 'quickOffset']) {
    closeTo(after[key], before[key], `Stable ${key} across app startup`)
  }
  assert.equal(after.src, before.src, 'The first paint already selects the correct artwork')
}

try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'zh-CN', reducedMotion: 'reduce' })
  // Keep analytics and live APIs out of a local geometry regression.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(origin)
  await page.locator('.home-slide[data-d="0"]').waitFor()
  snapshot = fillShell(shell, {
    title: await page.title(), url: `${origin}/`, lang: 'zh-CN',
    rootHtml: await page.locator('#root').innerHTML(),
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 600 },
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 760, height: 844 },
    { width: 761, height: 844 },
    { width: 844, height: 390 },
  ]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const reload of [false, true]) {
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const holdBundle = async (route) => { await gate; await route.continue() }
      await page.route('**/assets/*.js', holdBundle)
      try {
        // Delay scripts, not styles/images: inspect the actual first-paint DOM.
        if (reload) await page.reload({ waitUntil: 'commit' })
        else await page.goto(origin, { waitUntil: 'commit' })
        await page.locator('#root > [lang] .home-hero-stage').waitFor()
        await page.evaluate(async () => {
          await document.fonts.ready
          const image = document.querySelector('.home-slide[data-d="0"] picture img, .home-slide[data-d="0"] > img')
          await image.decode()
        })
        const before = await page.evaluate(readGeometry)
        checkViewport(before, viewport)
        // Sample every frame so a transient resize cannot hide behind the final size.
        await page.evaluate(() => {
          window.carouselFrames = []
          const sample = () => {
            const stage = document.querySelector('.home-hero-stage')?.getBoundingClientRect()
            const slide = document.querySelector('.home-slide[data-d="0"]')?.getBoundingClientRect()
            if (stage && slide) window.carouselFrames.push([stage.width, stage.height, slide.width, slide.height])
            window.carouselFrame = requestAnimationFrame(sample)
          }
          sample()
        })
        release()
        await page.waitForFunction(() => !document.querySelector('#root > [lang]'))
        await page.waitForTimeout(800) // Longer than the slide's 680ms transition.
        const after = await page.evaluate(readGeometry)
        compare(before, after)
        const frames = await page.evaluate(() => { cancelAnimationFrame(window.carouselFrame); return window.carouselFrames })
        assert.ok(frames.length > 1)
        for (const frame of frames) {
          for (const [index, key] of ['stageWidth', 'stageHeight', 'slideWidth', 'slideHeight'].entries()) closeTo(frame[index], before[key], `Stable ${key} on every frame`)
        }
      } finally {
        release()
        await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {})
        await page.unroute('**/assets/*.js', holdBundle)
      }
    }
    console.log(`Stable first paint and reload: ${viewport.width}x${viewport.height}`)
  }

  // Cross the phone breakpoint in-place, with motion reduced for deterministic bounds.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of [viewports[4], viewports[0], viewports[4]]) {
    await page.setViewportSize(viewport)
    await page.waitForFunction((phone) => {
      const image = document.querySelector('.home-slide[data-d="0"] .home-slide-art > img')
      return image.complete && image.currentSrc.includes('banner-phone-') === phone
    }, viewport.width <= 760)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    checkViewport(await page.evaluate(readGeometry), viewport)
  }
  assert.deepEqual(errors, [], 'No page errors')
  console.log('Passed 18 first-paint/reload cases and 3 responsive resize checks.')
  await context.close()
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
