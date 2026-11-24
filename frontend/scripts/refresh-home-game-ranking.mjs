import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Consume existing daily exports. No analytics credentials, raw URLs or PV
// counts belong in the frontend bundle.
const [directory, through] = process.argv.slice(2)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
if (!directory || !/^\d{4}-\d\d-\d\d$/.test(through ?? '') || through >= today) {
  throw new Error('Provide the daily report directory and a completed Beijing date (YYYY-MM-DD).')
}
const end = Date.parse(through + 'T00:00:00Z')
if (!Number.isFinite(end) || new Date(end).toISOString().slice(0, 10) !== through) throw new Error('Invalid date.')
const config = new URL('../apps/meta/src/homeGameShelf.json', import.meta.url)
const shelf = JSON.parse(readFileSync(config, 'utf8'))
if (through < shelf.popularity.through) throw new Error('Refusing to replace a newer snapshot.')
const totals = new Map()
for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
  const day = new Date(end - daysAgo * 86_400_000).toISOString().slice(0, 10)
  const report = JSON.parse(readFileSync(join(directory, day + '.visit-toppage-a.json'), 'utf8').trimStart())
  const data = report.body?.data?.[0]?.result
  if (data?.timeSpan?.[0] !== day.replaceAll('-', '/') || data.offset !== 0 ||
      data.fields?.[0] !== 'visit_page_title' || data.fields[1] !== 'pv_count') {
    throw new Error('Unexpected page report for ' + day)
  }
  const [pages, metrics] = data.items
  if (!Array.isArray(pages) || !Array.isArray(metrics) || pages.length !== metrics.length ||
      pages.length < Math.min(data.total, 10) || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error('Incomplete page report for ' + day)
  }
  for (const [index, row] of pages.slice(0, 10).entries()) {
    const url = new URL(row[0].name)
    const id = url.hostname === 'arkive.games' && url.hash.split('?')[0] === '#glimmith/tutorial'
      ? 'glimmith' : /^([a-z0-9-]+)\.arkive\.games$/i.exec(url.hostname)?.[1]
    const pv = metrics[index]?.[0]
    if (!Number.isSafeInteger(pv) || pv < 0) throw new Error('Invalid pageviews for ' + day)
    if (shelf.slots.includes(id)) totals.set(id, (totals.get(id) ?? 0) + pv)
  }
}
const ranked = shelf.slots.filter(id => totals.has(id)).sort((a, b) => totals.get(b) - totals.get(a))
shelf.popularity = { through, ranked }
writeFileSync(config, JSON.stringify(shelf, null, 2) + '\n')
console.log('Homepage popularity sample through %s: %s', through, ranked.join(', ') || 'no selected games observed')
