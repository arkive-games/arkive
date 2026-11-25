// Run against CI's builds, never against a developer's servers or the live sites.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer, preview } from 'vite'

const apps = fileURLToPath(new URL('../apps/', import.meta.url))
const catalog = await createServer({
  root: path.join(apps, 'meta'), configFile: false, logLevel: 'error', server: { middlewareMode: true },
})
let entries
try {
  const { SITES } = await catalog.ssrLoadModule('/src/sites.ts')
  const { default: i18n } = await catalog.ssrLoadModule('/src/i18n.ts')
  entries = SITES.filter(site => !site.comingSoon).map(site => {
    assert.ok(site.url, `${site.id}: missing registered entry URL`)
    const url = new URL(site.url, 'http://portal.invalid')
    const expected = i18n.t(site.nameKey, { lng: 'zh-CN' })
    assert.ok(expected && expected !== site.nameKey, `${site.id}: missing catalog name`)
    return { id: site.id, app: url.origin === 'http://portal.invalid' ? 'meta' : site.id,
      route: url.pathname + url.search + url.hash, expected }
  })
} finally {
  await catalog.close()
}

// Permit the map shell to mount without private data repositories. Do not
// substitute the navigation component, its locale catalog, or game artwork.
const map = { id: 'sample', name: 'Sample', type: 'world', isVisible: true,
  tileWidth: 256, tileHeight: 256, tilesCountX: 1, tilesCountY: 1 }
function fixture(url) {
  if (url.includes('/locales/')) return {}
  if (url.endsWith('/maps.json')) return { maps: [map] }
  if (url.endsWith('/types.json')) return { categories: [] }
  if (url.includes('/markers/')) return { markers: [] }
  if (url.includes('/regions/')) return { regions: [] }
  if (url.endsWith('/map-display.json')) return { maps: [], markers: {}, regions: {} }
  if (url.includes('/props-ground-')) return { props: [] }
  return {}
}

const browser = await chromium.launch()
try {
  for (const { id, app, route, expected } of entries) {
    const server = await preview({ root: path.join(apps, app), configFile: false, logLevel: 'error',
      preview: { host: '127.0.0.1', port: 0, open: false } })
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
    try {
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== origin) return route.abort()
        if (url.pathname.startsWith('/data/')) return route.fulfill({ json: fixture(url.pathname) })
        return route.continue()
      })
      const url = new URL(route, origin)
      url.searchParams.set('lng', 'zh-CN')
      await page.goto(url.href, { waitUntil: 'domcontentloaded' })
      const chip = page.locator('header.arkive-map-topbar [data-testid="game-chip"]')
      await chip.waitFor({ state: 'visible', timeout: 10000 })
      const name = await chip.innerText()
      assert.equal(name.replace(/\s/g, ''), expected.replace(/\s/g, ''), 'localized game name')
      const icon = chip.locator('img')
      assert.equal(await icon.count(), 1, 'game chip must have one icon')
      assert.ok(await icon.isVisible(), 'game icon is hidden')
      await icon.evaluate(img => img.decode())
      assert.ok(await icon.evaluate(img => img.naturalWidth > 0), 'game icon is empty')
      console.log(`game-navigation: ${id} OK`)
    } catch (cause) {
      throw new Error(`game-navigation: ${id} at ${route}: ${cause.message}`, { cause })
    } finally {
      await page.close()
      await server.close()
    }
  }
} finally {
  await browser.close()
}
