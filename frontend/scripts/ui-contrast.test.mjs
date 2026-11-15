import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../packages/map-shell/src/arkive-map-theme.css', import.meta.url), 'utf8').replace(/\r/g, '')
const light = css.match(/^:root \{([\s\S]*?)^\}/m)[1]
const dark = css.match(/^\.dark,\n\.abyss \{([\s\S]*?)^\}/m)[1]
const tokens = source => Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6})\s*;/g)].map(match => [match[1], match[2]]))
const luminance = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

describe('shared text and focus contrast', () => {
  for (const [theme, source] of [['light', light], ['dark', dark]]) it(`meets the scoped text and focus thresholds in ${theme}`, () => {
    const value = { ...tokens(light), ...tokens(source) }
    for (const [fg, bg] of [
      ['--foreground', '--background'], ['--card-foreground', '--card'],
      ['--muted-foreground', '--card'], ['--primary-foreground', '--primary'],
      ['--destructive-foreground', '--destructive'], ['--arkive-nav-active', '--arkive-filter-active'],
    ]) expect(ratio(value[fg], value[bg]), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(value['--ring'], value['--card'])).toBeGreaterThanOrEqual(3)
    const search = light.match(/--arkive-warm-search:\s*([^;]+);/)[1]
    for (const [stop] of search.matchAll(/#[\da-fA-F]{6}/g)) expect(ratio(value['--arkive-warm-search-foreground'], stop)).toBeGreaterThanOrEqual(4.5)
  })
})
