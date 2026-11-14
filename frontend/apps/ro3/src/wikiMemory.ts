import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  browserMemory,
  defineMemoryRecord,
  isFiniteNumber,
  memoryPolicy,
  useMemoryState,
} from '@gamemap/state-memory'
import type { MonsterFilter } from './wikiBoards'

import { WikiReadyContext as ReadyContext } from './wikiReadyContext'

export function useWikiReady(ready: boolean) {
  const { section, markReady } = useContext(ReadyContext)
  useLayoutEffect(() => {
    if (ready) markReady(section)
  }, [ready, section, markReady])
}

/** These records contain browsing inputs only, never fetched game datasets. */
export function compatibleWikiValue(value: unknown, example: unknown): boolean {
  if (example === null) return value === null || isFiniteNumber(value)
  if (typeof example === 'number') return isFiniteNumber(value)
  if (typeof example === 'string' || typeof example === 'boolean')
    return typeof value === typeof example
  if (Array.isArray(example))
    return Array.isArray(value) && value.every(isFiniteNumber)
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !example ||
    typeof example !== 'object'
  )
    return false
  const source = value as Record<string, unknown>
  const fields = Object.entries(example)
  return fields.length
    ? fields.every(([key, item]) => compatibleWikiValue(source[key], item))
    : Object.values(source).every(isFiniteNumber)
}

export function useWikiState<T>(
  id: string,
  initial: T,
  validate?: (value: unknown) => value is T,
) {
  const [definition] = useState(() => ({ initial, validate }))
  const record = useMemo(
    () => wikiContextRecord(id, definition.initial, definition.validate),
    [id, definition],
  )
  const [value, update] = useMemoryState(record)
  return [value, update] as const
}

export function wikiContextRecord<T>(
  id: string,
  initial: T,
  validate?: (value: unknown) => value is T,
) {
  return defineMemoryRecord({
    id: id.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    namespace: 'ro3',
    surface: 'wiki',
    ...memoryPolicy.sessionContext('clear-wiki-context'),
    schemaVersion: '1.0.0',
    defaultValue: () => initial,
    validate: (value: unknown): value is T =>
      validate ? validate(value) : compatibleWikiValue(value, initial),
  })
}

export function validMonsterFilter(value: unknown): value is MonsterFilter {
  if (!value || typeof value !== 'object') return false
  const filter = value as Record<string, unknown>
  return (
    ['all', 'normal', 'elite', 'mvp', 'boss'].includes(String(filter.rank)) &&
    (filter.band === null ||
      (Array.isArray(filter.band) &&
        filter.band.length === 2 &&
        filter.band.every(isFiniteNumber))) &&
    ['element', 'race', 'size'].every(
      (key) => filter[key] === null || isFiniteNumber(filter[key]),
    ) &&
    typeof filter.query === 'string'
  )
}

export function useWikiOptional<T extends number | string>(
  id: string,
  kind: 'number' | 'string',
) {
  const record = useMemo(
    () =>
      defineMemoryRecord<T | null>({
        id: id.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        namespace: 'ro3',
        surface: 'wiki',
        ...memoryPolicy.sessionContext('clear-wiki-context'),
        schemaVersion: '1.0.0',
        defaultValue: () => null,
        validate: (value: unknown): value is T | null =>
          value === null ||
          (kind === 'number'
            ? isFiniteNumber(value)
            : typeof value === 'string'),
      }),
    [id, kind],
  )
  const [value, update] = useMemoryState(record)
  const set = useCallback<Dispatch<SetStateAction<T | undefined>>>(
    (action) =>
      update(
        (previous) =>
          (typeof action === 'function'
            ? action(previous ?? undefined)
            : action) ?? null,
      ),
    [update],
  )
  return [value ?? undefined, set] as const
}

const scrollRecord = defineMemoryRecord({
  id: 'scroll',
  namespace: 'ro3',
  surface: 'wiki',
  ...memoryPolicy.sessionContext('clear-wiki-context'),
  schemaVersion: '1.0.0',
  defaultValue: () => 0,
  validate: (value: unknown): value is number =>
    isFiniteNumber(value) && value >= 0,
})

export function useWikiScrollRestoration(section: string) {
  const { ready } = useContext(ReadyContext)
  const binding = useMemo(
    () => ({
      key: section,
      read: () => browserMemory.read(scrollRecord, { partition: section }),
      write: (top: number) => {
        browserMemory.write(scrollRecord, top, { partition: section })
      },
    }),
    [section],
  )
  return section.startsWith('wiki-') ? { ...binding, ready } : undefined
}
