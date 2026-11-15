import { useState } from 'react'
import { useMemory } from '@gamemap/state-memory'
import { gmzzMemory, isFiniteNumber, isRecord } from '../../lib/memory'

/** Only page-owned reading fields enter this session record family. */
export function validContextValue(value: unknown, initial: unknown): boolean {
  if (initial === null) return value === null || isFiniteNumber(value)
  if (typeof initial === 'number') return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
  if (typeof initial === 'string' || typeof initial === 'boolean') return typeof value === typeof initial
  return false
}

export function createContextField<T>(initial: T, validate?: (value: unknown) => value is T) {
  return gmzzMemory.session('encyclopedia/field', {
    default: () => initial,
    validate: (value: unknown): value is T => validate ? validate(value) : validContextValue(value, initial),
    keyedBy: { scope: true },
  })
}

export function useContextState<T>(section: string, field: string, initial: T, validate?: (value: unknown) => value is T) {
  const [record] = useState(() => createContextField(initial, validate))
  return useMemory(record.at({ scope: JSON.stringify([section, field]) }))
}

export const catalogScroll = gmzzMemory.session('encyclopedia/scroll', {
  default: 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0,
})

const catalogView = gmzzMemory.preference('encyclopedia/view', {
  default: 'grid' as 'grid' | 'list',
  validate: (value: unknown): value is 'grid' | 'list' => value === 'grid' || value === 'list',
  keyedBy: { section: true },
})
export const useCatalogView = (section: string) => useMemory(catalogView.at({ section }))

export const EMPTY_PIECE_FILTERS = { cost: 0, bondId: 0, role: '', query: '' }
export type PieceFilters = typeof EMPTY_PIECE_FILTERS
export function isPieceFilters(value: unknown): value is PieceFilters {
  return isRecord(value) && isFiniteNumber(value.cost) && value.cost >= 0 &&
    isFiniteNumber(value.bondId) && value.bondId >= 0 &&
    typeof value.role === 'string' && typeof value.query === 'string'
}
