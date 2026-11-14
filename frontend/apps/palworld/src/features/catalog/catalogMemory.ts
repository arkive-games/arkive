import { useMemo, useState } from 'react'
import { browserMemory, defineMemoryRecord, isFiniteNumber, memoryPolicy, useMemoryState } from '@gamemap/state-memory'

type CatalogValue = string | boolean | string[] | null

/** Only explicitly declared browsing fields enter tab storage. */
export function catalogField<T extends CatalogValue>(initial: T, validate?: (value: unknown) => value is T) {
  return defineMemoryRecord({
    id: 'field', namespace: 'palworld', surface: 'catalog-context',
    ...memoryPolicy.sessionContext('clear-catalog-context'),
    schemaVersion: '1.0.0', defaultValue: () => initial,
    validate: (value: unknown): value is T => validate ? validate(value) :
      Array.isArray(initial) ? Array.isArray(value) && value.every(item => typeof item === 'string') :
        initial === null ? value === null || typeof value === 'string' : typeof value === typeof initial,
  })
}

export function useCatalogState<T extends CatalogValue>(section: string, field: string, initial: T, validate?: (value: unknown) => value is T) {
  const [record] = useState(() => catalogField(initial, validate))
  return useMemoryState(record, { partition: `${section}:${field}` })
}

const scrollRecord = defineMemoryRecord({
  id: 'scroll', namespace: 'palworld', surface: 'catalog-context',
  ...memoryPolicy.sessionContext('clear-catalog-context'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0,
})

export interface CatalogBrowsingContext {
  section: string
  ready: boolean
  resultsKey?: string
}

export function useCatalogScroll(context?: CatalogBrowsingContext) {
  const partition = context ? `${context.section}:${context.resultsKey ?? ''}` : ''
  const binding = useMemo(() => ({
    key: partition,
    read: () => browserMemory.read(scrollRecord, { partition }),
    write: (top: number) => { browserMemory.write(scrollRecord, top, { partition }) },
  }), [partition])
  return context ? { ...binding, ready: context.ready } : undefined
}
