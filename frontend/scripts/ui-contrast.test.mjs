import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SITES } from '../apps/meta/src/sites'

const css = readFileSync(new URL('../packages/map-shell/src/arkive-map-theme.css', import.meta.url), 'utf8').replace(/\r/g, '')
const light = css.match(/^:root \{([\s\S]*?)^\}/m)[1]
const dark = css.match(/^\.dark,\n\.abyss \{([\s\S]*?)^\}/m)[1]
const tokens = source => Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
const color = (value, token) => {
  expect(value, `${token}: expected an opaque hex color`).toMatch(/^#[\da-fA-F]{6}$/)
  return value
}
const luminance = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

describe('shared text and focus contrast', () => {
  for (const [theme, source] of [['light', light], ['dark', dark]]) it(`keeps game cover tints readable in ${theme}`, () => {
    const value = { ...tokens(light), ...tokens(source) }
    for (const site of SITES) {
      const surface = color(site.catalogHover[theme], site.id)
      for (const [token, minimum] of [['--foreground', 4.5], ['--ring', 3], ['--arkive-nav-accent', 3]]) {
        expect(ratio(value[token], surface), `${site.id}: ${token} on ${surface}`).toBeGreaterThanOrEqual(minimum)
      }
    }
  })

  for (const [theme, source] of [['light', light], ['dark', dark]]) it(`meets the scoped text and focus thresholds in ${theme}`, () => {
    const value = { ...tokens(light), ...tokens(source) }
    for (const [fg, bg] of [
      ['--foreground', '--background'], ['--card-foreground', '--card'],
      ['--popover-foreground', '--popover'], ['--secondary-foreground', '--secondary'],
      ['--accent-foreground', '--accent'], ['--muted-foreground', '--background'],
      ['--muted-foreground', '--card'], ['--muted-foreground', '--muted'],
      ['--primary-foreground', '--primary'], ['--destructive-foreground', '--destructive'],
      ['--arkive-nav-active', '--arkive-filter-active'], ['--arkive-nav-on-active', '--arkive-nav-active'],
      ['--arkive-action-on', '--arkive-action'], ['--arkive-warm-text', '--background'],
      ['--arkive-warm-text', '--card'],
    ]) expect(ratio(color(value[fg], fg), color(value[bg], bg)), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(value['--ring'], value['--card']), `${theme}: --ring on --card`).toBeGreaterThanOrEqual(3)
    expect(ratio(value['--ring'], value['--background']), `${theme}: --ring on --background`).toBeGreaterThanOrEqual(3)
    for (const [gradientToken, fgToken] of [
      ['--arkive-warm-action', '--arkive-warm-action-foreground'],
      ['--arkive-warm-search', '--arkive-warm-search-foreground'],
    ]) {
      const gradient = value[gradientToken]
      expect(gradient, `${theme}: missing ${gradientToken}`).toMatch(/^linear-gradient\(/)
      const stops = [...gradient.matchAll(/#[\da-fA-F]{6}\b/g)].map(match => match[0])
      expect(stops.length, `${theme}: ${gradientToken} must contain color stops`).toBeGreaterThanOrEqual(2)
      for (const stop of stops) {
        expect(ratio(color(value[fgToken], fgToken), stop), `${theme}: ${fgToken} on ${gradientToken} (${stop})`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
