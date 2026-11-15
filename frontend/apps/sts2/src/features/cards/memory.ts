import { browserMemory, defineMemoryRecord, isString, memoryPolicy, parseJson, type MemoryClient } from '@gamemap/state-memory'
import { EMPTY_FILTER, type CardFilter } from './useFilteredCards'

export function isCardFilter(value: unknown): value is CardFilter {
  if (!value || typeof value !== 'object') return false
  const filter = value as Partial<CardFilter>
  return typeof filter.query === 'string'
    && [filter.pools, filter.types, filter.rarities].every((items) =>
      Array.isArray(items) && items.every((item) => typeof item === 'string'))
    && Array.isArray(filter.costs) && filter.costs.every((item) => typeof item === 'number' && Number.isFinite(item))
}

// Read the former device preference once as a seed; browsing no longer writes it.
export const legacyFilterRecord = defineMemoryRecord({
  id: 'filters', namespace: 'sts2', surface: 'cards-catalog',
  ...memoryPolicy.userPreference('clear-card-filters'),
  schemaVersion: '1.0.0', defaultValue: () => ({ ...EMPTY_FILTER }), validate: isCardFilter,
  legacyKeys: ['sts2.cards.filter'],
  migrateLegacy: (raw: string) => ({ ...EMPTY_FILTER, ...(parseJson(raw) as Partial<CardFilter>), query: '' }),
})

export function createCardFacetsRecord(client: MemoryClient = browserMemory) {
  return defineMemoryRecord({
    id: 'facets', namespace: 'sts2', surface: 'cards-context',
    ...memoryPolicy.sessionContext('clear-card-filters'),
    schemaVersion: '1.0.0',
    defaultValue: () => ({ ...client.read(legacyFilterRecord), query: '' }),
    validate: isCardFilter,
  })
}

export const cardFacetsRecord = createCardFacetsRecord()
export const cardQueryRecord = defineMemoryRecord({
  id: 'query', namespace: 'sts2', surface: 'cards-catalog',
  ...memoryPolicy.sessionContext('clear-card-search'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})

export const referenceScrollRecord = defineMemoryRecord({
  id: 'scroll', namespace: 'sts2', surface: 'reference-context',
  ...memoryPolicy.sessionContext('clear-reference-position'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0,
})
