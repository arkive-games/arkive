import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('publishes seven complete reports, attributing only selected games, and preserves the snapshot on error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arkive-ranking-'))
  try {
    const src = join(dir, 'apps/meta/src')
    const scripts = join(dir, 'scripts')
    mkdirSync(src, { recursive: true })
    mkdirSync(scripts)
    const script = join(scripts, 'refresh-home-game-ranking.mjs')
    copyFileSync(new URL('./refresh-home-game-ranking.mjs', import.meta.url), script)
    const file = join(src, 'homeGameShelf.json')
    const slots = ['glimmith', 'palworld', 'aion2', 'gmzz']
    writeFileSync(file, JSON.stringify({ slots, popularity: { through: '2020-01-01', ranked: [] } }))
    for (let n = 1; n <= 7; n++) {
      const day = '2020-01-0' + n
      const urls = ['https://arkive.games/#forum', 'https://oss.arkive.games/', 'https://aion2.arkive.games/',
        'https://palworld.arkive.games/pals', 'https://arkive.games/#glimmith/tutorial']
      const result = { timeSpan: [day.replaceAll('-', '/')], offset: 0, total: 5,
        fields: ['visit_page_title', 'pv_count'], items: [urls.map(name => [{ name }]), [[80], [40], [8], [4], [4]]] }
      writeFileSync(join(dir, day + '.visit-toppage-a.json'), '\ufeff' + JSON.stringify({ body: { data: [{ result }] } }))
    }
    const run = () => execFileSync(process.execPath, [script, dir, '2020-01-07'], { stdio: 'pipe' })
    run()
    const saved = readFileSync(file, 'utf8')
    expect(JSON.parse(saved)).toEqual({ slots, popularity: { through: '2020-01-07', ranked: ['aion2', 'glimmith', 'palworld'] } })
    rmSync(join(dir, '2020-01-04.visit-toppage-a.json'))
    expect(run).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(saved)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
