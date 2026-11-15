import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useContentScrollRestoration } from '@gamemap/map-shell'
import { browserMemory, createBrowserHistoryMemoryEnvironment, defineMemoryRecord, isBoolean, isFiniteNumber, isString, memoryPolicy, useMemoryState, type MemoryClient } from '@gamemap/state-memory'

export const railCollapsedRecord = defineMemoryRecord({
  id: 'rail-collapsed', namespace: 'aion2', surface: 'encyclopedia',
  ...memoryPolicy.sessionContext('reset-encyclopedia-navigation'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})

export const hubGroupRecord = defineMemoryRecord({
  id: 'hub-group', namespace: 'aion2', surface: 'wiki-catalog',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})

export function resolveWikiGroup<T extends { slug: string }>(groups: readonly T[], explicit: string, remembered: string) {
  return groups.find(group => group.slug === explicit) ?? groups.find(group => group.slug === remembered) ?? groups[0]
}

export type HubFaction = 'all' | 'light' | 'dark' | 'both'
export const hubFactionRecord = defineMemoryRecord({
  id: 'hub-faction', namespace: 'aion2', surface: 'wiki-catalog',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: (): HubFaction => 'all',
  validate: (value: unknown): value is HubFaction => typeof value === 'string' && ['all', 'light', 'dark', 'both'].includes(value),
})

const entityQueryRecord = defineMemoryRecord({
  id: 'entity-query', namespace: 'aion2', surface: 'wiki-catalog',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})

export function useEntityQuery(scope: string) {
  return useMemoryState(entityQueryRecord, { partition: scope })
}

const scrollRecord = defineMemoryRecord({
  id: 'scroll', namespace: 'aion2', surface: 'wiki-catalog',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: (): number | null => null,
  validate: (value: unknown): value is number | null => value === null || (isFiniteNumber(value) && value >= 0),
})

/** A new anchor link wins; Back/reload resumes that history entry's own position. */
export function wikiScrollBinding(scope: string, entryKey: string, anchor = '', anchorTop: () => number | null = () => null, client: MemoryClient = browserMemory) {
  const partition = anchor ? `entry:${entryKey}:${scope}:${anchor}` : scope
  return {
    key: partition,
    read: () => client.read(scrollRecord, { partition }) ?? (anchor ? anchorTop() : null) ?? 0,
    write: (top: number) => { client.write(scrollRecord, top, { partition }) },
  }
}

/** Apps bind the existing content scroller; the shared hook owns restoration. */
export function useWikiScroll(scope: string, ready: boolean, resultsKey = '', explicitAnchor = '', routePath = '/wiki') {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { state, pathname } = useLocation()
  const currentRoute = pathname.replace(/\/$/, '') === routePath
  const nextEntryKey = state.__TSR_key ?? state.key ?? String(state.__TSR_index)
  const [entryKey, setEntryKey] = useState(nextEntryKey)
  if (currentRoute && entryKey !== nextEntryKey) setEntryKey(nextEntryKey)
  const canRestore = ready && currentRoute
  useLayoutEffect(() => {
    // A direct document entry may only have an in-memory router key. Preserve
    // it in history so Back/reload identifies the same visit. Do not stamp a
    // pending destination's state onto the still-visible previous URL.
    if (!canRestore || pathname !== window.location.pathname) return
    const history = createBrowserHistoryMemoryEnvironment()
    const current = history?.getState() as Record<string, unknown> | null
    if (history && !current?.__TSR_key && !current?.key) {
      try {
        history.replaceState({ ...current, ...state })
      } catch {
        // Restricted history must not block browsing.
      }
    }
  }, [canRestore, pathname, state])
  useLayoutEffect(() => {
    scrollRef.current = rootRef.current?.closest<HTMLDivElement>('[data-content-scroll]') ?? null
  }, [scope, canRestore, explicitAnchor])
  const read = useCallback(() => wikiScrollBinding(`${scope}:${resultsKey}`, entryKey, explicitAnchor, () => {
    const target = document.getElementById(explicitAnchor)
    const scroller = scrollRef.current
    return target && scroller && rootRef.current?.contains(target)
      ? Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
      : null
  }).read(), [scope, resultsKey, entryKey, explicitAnchor])
  const write = useCallback((top: number) => {
    wikiScrollBinding(`${scope}:${resultsKey}`, entryKey, explicitAnchor).write(top)
  }, [scope, resultsKey, entryKey, explicitAnchor])
  useContentScrollRestoration(scrollRef, { key: `${scope}:${resultsKey}:${entryKey}:${explicitAnchor}`, read, write, ready: canRestore })
  return rootRef
}
