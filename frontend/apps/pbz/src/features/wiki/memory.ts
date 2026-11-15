import { defineMemoryRecord, isBoolean, isFiniteNumber, isString, isStringArray, memoryPolicy, useMemoryState } from '@gamemap/state-memory'

const queryRecord = defineMemoryRecord({
  id: 'query', namespace: 'pbz', surface: 'wiki-context',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})
const filtersRecord = defineMemoryRecord({
  id: 'filters', namespace: 'pbz', surface: 'wiki-context',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: (): string[] => [], validate: isStringArray,
})
const expandedRecord = defineMemoryRecord({
  id: 'expanded-levels', namespace: 'pbz', surface: 'wiki-context',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => false, validate: isBoolean,
})
const itemPageRecord = defineMemoryRecord({
  id: 'item-page', namespace: 'pbz', surface: 'wiki-context',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 0,
})
export const wikiScrollRecord = defineMemoryRecord({
  id: 'scroll', namespace: 'pbz', surface: 'wiki-context',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0,
})

export const useWikiQuery = (section: string) => useMemoryState(queryRecord, { partition: section })
export const useWikiFilters = (section: string, field: string) => useMemoryState(filtersRecord, { partition: `${section}:${field}` })
export const useExpandedLevels = (kind: string, id: string) => useMemoryState(expandedRecord, { partition: `${kind}:${id}` })
export const useItemPage = (id: string) => useMemoryState(itemPageRecord, { partition: id })
