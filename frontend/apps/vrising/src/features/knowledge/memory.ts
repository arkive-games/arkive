import { browserMemory, defineMemoryRecord, isBoolean, isFiniteNumber, isString, isStringArray, memoryPolicy, type MemoryClient } from '@gamemap/state-memory'

export type PageKind = 'database' | 'systems'
export type SectionKey = 'items' | 'weapons' | 'armor' | 'recipes' | 'spells' | 'passives' | 'buildings' | 'research'

export const createSectionRecord = (defaultSection: SectionKey) => defineMemoryRecord({
  id: 'section', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-section'),
  schemaVersion: '1.0.0', defaultValue: () => defaultSection,
  validate: (value: unknown): value is SectionKey => typeof value === 'string' &&
    ['items', 'weapons', 'armor', 'recipes', 'spells', 'passives', 'buildings', 'research'].includes(value),
})

// Read-only migration seeds: preserve the existing page-level session values.
export const legacyQueryRecord = defineMemoryRecord({
  id: 'query', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-search'),
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
})
export const legacyRevealRecord = defineMemoryRecord({
  id: 'reveal-depth', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-reveal'),
  schemaVersion: '1.0.0', defaultValue: () => 48,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 48,
})

export const knowledgeQueryScope = (kind: PageKind, section: SectionKey) => JSON.stringify([kind, section])
export const knowledgeResultsScope = (kind: PageKind, section: SectionKey, query: string) => JSON.stringify([kind, section, query])

const migratedRecord = defineMemoryRecord({
  id: 'section-context-migrated', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-context'),
  schemaVersion: '1.0.0', defaultValue: () => false, validate: isBoolean,
})

export const createKnowledgeQueryRecord = (kind: PageKind, section: SectionKey, initialSection: SectionKey) => defineMemoryRecord({
  id: 'section-query', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-search'),
  schemaVersion: '1.0.0', validate: isString,
  defaultValue: () => section === initialSection && !browserMemory.read(migratedRecord, { partition: kind })
    ? browserMemory.read(legacyQueryRecord, { partition: kind }) : '',
})

export const createKnowledgeRevealRecord = (kind: PageKind, section: SectionKey, query: string, initialSection: SectionKey) => defineMemoryRecord({
  id: 'result-reveal-depth', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-reveal'),
  schemaVersion: '1.0.0',
  defaultValue: () => section === initialSection && !browserMemory.read(migratedRecord, { partition: kind }) && query === browserMemory.read(legacyQueryRecord, { partition: kind })
    ? browserMemory.read(legacyRevealRecord, { partition: kind }) : 48,
  validate: (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 48,
})

/** Adopt the old page-level context only once, into its original subsection. */
export function migrateKnowledgeContext(kind: PageKind, section: SectionKey, client: MemoryClient = browserMemory) {
  if (client.read(migratedRecord, { partition: kind })) return
  const legacyQuery = client.read(legacyQueryRecord, { partition: kind })
  const queryRecord = createKnowledgeQueryRecord(kind, section, section)
  const queryScope = { partition: knowledgeQueryScope(kind, section) }
  const query = client.read<string | null>({ ...queryRecord, defaultValue: () => null }, queryScope) ?? legacyQuery
  const revealRecord = createKnowledgeRevealRecord(kind, section, query, section)
  const revealScope = { partition: knowledgeResultsScope(kind, section, query) }
  const count = client.read<number | null>({ ...revealRecord, defaultValue: () => null }, revealScope)
    ?? (query === legacyQuery ? client.read(legacyRevealRecord, { partition: kind }) : 48)
  const querySaved = client.write(queryRecord, query, queryScope)
  const revealSaved = client.write(revealRecord, count, revealScope)
  if (querySaved && revealSaved) client.write(migratedRecord, true, { partition: kind })
}

export const expandedRecords = defineMemoryRecord({
  id: 'expanded-records', namespace: 'vrising', surface: 'knowledge',
  ...memoryPolicy.sessionContext('clear-knowledge-disclosure'),
  schemaVersion: '1.0.0', defaultValue: (): string[] => [],
  validate: (value: unknown): value is string[] => isStringArray(value, 1000),
})
