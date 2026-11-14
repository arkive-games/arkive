import { defineMemoryRecord, isFiniteNumber, memoryFor, memoryPolicy } from '@gamemap/state-memory'

/**
 * Every V Rising record goes through this. The namespace is bound here, so no
 * part of the app can write into another game's space or into the shared,
 * cross-site `site` namespace -- that one is reachable only via `sharedMemory`.
 */
export const vrisingMemory = memoryFor('vrising')

export const catalogScrollRecord = defineMemoryRecord({
  id: 'scroll', namespace: 'vrising', surface: 'catalog-context',
  ...memoryPolicy.sessionContext('clear-catalog-context'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0,
})
