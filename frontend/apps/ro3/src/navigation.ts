/**
 * Every page this app has, and the address of each.
 *
 * RO3 drives history itself rather than through a router, so the page model,
 * the nav keys the shared top bar and bottom strip speak, and the URL scheme
 * live together here: a link rendered anywhere and the pushState that follows
 * a click can then never disagree about where a page is.
 */

import type { MouseEvent } from 'react'

export type Page = 'overview' | 'wiki' | 'builds' | 'changelog'
export type WikiView = 'skills' | 'talents' | 'cards' | 'pets' | 'monsters' | 'equipment' | 'souls'
export type NavKey = 'overview' | 'builds' | 'changelog' | `wiki-${WikiView}`

export const WIKI_VIEWS: readonly WikiView[] = ['skills', 'talents', 'cards', 'pets', 'monsters', 'equipment', 'souls']

export interface Location {
  page: Page
  view: WikiView
}

function isWikiView(value: string | null): value is WikiView {
  return WIKI_VIEWS.includes(value as WikiView)
}

/**
 * Bare `/` opens the encyclopedia: the tables are the content, and a visitor
 * who typed the address wants them. The home page keeps an address of its own
 * so reloads and shared links land where they were.
 */
const PAGE_PATHS = {
  overview: '/overview',
  builds: '/builds',
  changelog: '/changelog',
} as const

const WIKI_PATHS: Record<WikiView, string> = {
  skills: '/',
  talents: '/talents',
  cards: '/cards',
  pets: '/pets',
  monsters: '/monsters',
  equipment: '/equipment',
  souls: '/souls',
}

/** Only the pathname selects a page; legacy query-based routing is retired. */
export function locationForPath(pathname: string): Location {
  const path = pathname.replace(/\/+$/, '') || '/'
  for (const page of ['overview', 'builds', 'changelog'] as const) {
    if (PAGE_PATHS[page] === path) return { page, view: 'skills' }
  }
  const view = WIKI_VIEWS.find((candidate) => WIKI_PATHS[candidate] === path) ?? 'skills'
  return { page: 'wiki', view }
}

export function readLocation(): Location {
  return locationForPath(window.location.pathname)
}

/**
 * The one address for each page. The default view spells nothing out, so a
 * page never has two URLs -- two links to share for one view, and two rows for
 * it in the traffic report.
 */
export function hrefFor(page: Page, view: WikiView = 'skills'): string {
  return page === 'wiki' ? WIKI_PATHS[view] : PAGE_PATHS[page]
}

export function navKeyFor({ page, view }: Location): NavKey {
  return page === 'wiki' ? `wiki-${view}` : page
}

export function locationForKey(key: string): Location | null {
  if (key === 'overview' || key === 'builds' || key === 'changelog') return { page: key, view: 'skills' }
  if (key === 'wiki') return { page: 'wiki', view: 'skills' }
  const view = key.startsWith('wiki-') ? key.slice(5) : null
  return isWikiView(view) ? { page: 'wiki', view } : null
}

export function hrefForKey(key: string): string {
  const location = locationForKey(key)
  return location ? hrefFor(location.page, location.view) : '/'
}

export interface NavigationProps {
  active: NavKey
  onNavigate: (key: NavKey) => void
}

/**
 * Hand a plain left click to the app's own navigation and let every other click
 * -- middle, ctrl, shift -- through to the browser, so a nav entry opens in a
 * new tab the way any other link does.
 */
export function navigateOnClick(key: NavKey, onNavigate: (key: NavKey) => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(key)
  }
}
