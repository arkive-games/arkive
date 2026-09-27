// @vitest-environment jsdom
import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import edgeone from '../edgeone.json'
import { hrefFor, hrefForKey, locationForKey, locationForPath, navigateOnClick, navKeyFor, readLocation, type NavKey } from './navigation'

const routes: Array<[NavKey, string]> = [
  ['wiki-skills', '/'], ['overview', '/overview'], ['builds', '/builds'],
  ['wiki-talents', '/talents'], ['wiki-cards', '/cards'], ['wiki-pets', '/pets'],
  ['wiki-monsters', '/monsters'], ['wiki-equipment', '/equipment'], ['wiki-souls', '/souls'],
  ['changelog', '/changelog'],
]

describe('RO3 clean page paths', () => {
  it.each(routes)('round trips %s at %s', (key, path) => {
    const location = locationForKey(key)!
    expect(hrefFor(location.page, location.view)).toBe(path)
    expect(hrefForKey(key)).toBe(path)
    expect(locationForPath(path)).toEqual(location)
    expect(navKeyFor(locationForPath(path))).toBe(key)
    expect(locationForPath(`${path}/`)).toEqual(location)
  })

  it.each(routes)('uses the pathname despite query parameters for %s', (key, path) => {
    window.history.replaceState({}, '', `${path}?view=builds&wiki=souls#section`)
    expect(navKeyFor(readLocation())).toBe(key)
  })

  it('does not retain query routing or match arbitrary changelog suffixes', () => {
    window.history.replaceState({}, '', '/?view=builds&wiki=cards')
    expect(readLocation()).toEqual({ page: 'wiki', view: 'skills' })
    for (const path of ['/missing', '/nested/changelog', '/cards-other']) {
      expect(locationForPath(path)).toEqual({ page: 'wiki', view: 'skills' })
    }
    expect(locationForKey('wiki')).toEqual({ page: 'wiki', view: 'skills' })
    expect(locationForKey('wiki-invalid')).toBeNull()
    expect(locationForKey('invalid')).toBeNull()
  })

  it('covers every non-root path and query-bearing request in EdgeOne', () => {
    const expected = routes.flatMap(([, path]) => path === '/' ? [] : [path, `${path}*`])
    expect(edgeone.rewrites.map((rule) => rule.source).sort()).toEqual(expected.sort())
    expect(edgeone.rewrites.every((rule) => rule.destination === '/index.html')).toBe(true)
    expect(edgeone.rewrites.some((rule) => rule.source === '/*')).toBe(false)
  })
})

describe('native anchor behavior', () => {
  const event = (patch: Partial<MouseEvent<HTMLAnchorElement>> = {}) => ({
    button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(), ...patch,
  }) as unknown as MouseEvent<HTMLAnchorElement>

  it('intercepts a plain left click for local history navigation', () => {
    const navigate = vi.fn()
    const click = event()
    navigateOnClick('wiki-cards', navigate)(click)
    expect(click.preventDefault).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('wiki-cards')
  })

  it.each([{ button: 1 }, { button: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])('leaves modified clicks to the browser: %j', (patch) => {
    const navigate = vi.fn()
    const click = event(patch)
    navigateOnClick('wiki-cards', navigate)(click)
    expect(click.preventDefault).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
