import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { arkiveFavicons } from '../vite/arkive-favicons.ts'

describe('browser icons', () => {
  it.each(['/', './'])('ships both local icons with the %s base', (base) => {
    const plugin = arkiveFavicons()
    plugin.configResolved({ base })
    const files = new Map()
    plugin.generateBundle.call({ emitFile: ({ fileName, source }) => files.set(fileName, source) })
    const links = plugin.transformIndexHtml().map(({ attrs }) => attrs)
    expect(links.map(({ rel, href, media }) => [rel, href, media])).toEqual([
      ['icon', base + 'arkive-a-light.svg', undefined],
      ['icon', base + 'arkive-a-dark.svg', '(prefers-color-scheme: dark)'],
    ])
    const wordmark = readFileSync(new URL('../packages/map-shell/src/assets/arkive-logo.svg', import.meta.url), 'utf8')
    for (const [i, { href }] of links.entries()) {
      const svg = files.get(href.slice(base.length))
      expect(svg).toContain(i ? 'rx="9" fill="#000"' : 'rx="9" fill="#fff"')
      expect(svg).toContain(i ? 'fill="#fff" d=' : 'fill="#000" d=')
      const outline = svg.match(/<path [^>]* d="([^"]+)"/)[1]
      expect(wordmark).toContain(outline)
    }
  })
})
