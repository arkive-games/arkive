import { memoryFor } from '@gamemap/state-memory'

/**
 * Every Lord of Mysteries record goes through this. The namespace is bound
 * here, so no part of the app can write into another game's space or into the
 * shared, cross-site `site` namespace — that one is reachable only via
 * `sharedMemory`.
 */
export const gmzzMemory = memoryFor('gmzz')

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A finite number or null — the shape of every optional id the calculators hold. */
export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}
