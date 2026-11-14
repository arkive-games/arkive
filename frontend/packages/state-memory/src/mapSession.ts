import { useMemo } from 'react'
import { browserMemory, defineMemoryRecord, getMemoryKey, memoryPolicy } from './core'
import { useMemoryState } from './react'
import { isBoolean, isFiniteNumber, isString, isStringArray } from './validators'

/** Browsing context is map-scoped and never shares completion/progress keys. */
export function createMapSessionRecords(namespace: string, legacy?: {
  categories?: () => string[]
  visibility?: () => string[] | null
}) {
  const common = { namespace, surface: 'map-context', schemaVersion: '1.0.0', ...memoryPolicy.sessionContext('clear-map-context') }
  return {
    lastMap: defineMemoryRecord({ id: 'last-map', namespace, surface: 'map', schemaVersion: '1.0.0', ...memoryPolicy.recentActivity('clear-recent-map-view'), defaultValue: () => '', validate: isString }),
    query: defineMemoryRecord({ ...common, id: 'query', defaultValue: () => '', validate: isString }),
    sidebarCollapsed: defineMemoryRecord({ ...common, id: 'sidebar-collapsed', defaultValue: () => false, validate: isBoolean }),
    sidebarScroll: defineMemoryRecord({ ...common, id: 'sidebar-scroll', defaultValue: () => 0, validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0 }),
    categories: defineMemoryRecord({ ...common, id: 'collapsed-categories', defaultValue: () => legacy?.categories?.() ?? [], validate: isStringArray }),
    visibility: defineMemoryRecord({ ...common, id: 'visible-subtypes', defaultValue: () => legacy?.visibility?.() ?? null, validate: (value: unknown): value is string[] | null => value === null || isStringArray(value) }),
  }
}

export function useMapSession(records: ReturnType<typeof createMapSessionRecords>, mapId: string) {
  const scope = useMemo(() => ({ partition: mapId }), [mapId])
  const [collapsed, setCollapsed] = useMemoryState(records.sidebarCollapsed, scope)
  const [categories, setCategories] = useMemoryState(records.categories, scope)
  const searchMemory = useMemo(() => ({
    key: getMemoryKey(records.query, scope),
    get: () => browserMemory.read(records.query, scope),
    set: (query: string) => { browserMemory.write(records.query, query, scope) },
  }), [records, scope])
  const scrollMemory = useMemo(() => ({
    key: getMemoryKey(records.sidebarScroll, scope),
    ready: !collapsed,
    read: () => browserMemory.read(records.sidebarScroll, scope),
    write: (top: number) => { browserMemory.write(records.sidebarScroll, top, scope) },
  }), [records, scope, collapsed])
  return { collapsed, setCollapsed, categories, setCategories, searchMemory, scrollMemory }
}
