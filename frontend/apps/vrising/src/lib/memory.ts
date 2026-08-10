import { memoryFor } from '@gamemap/state-memory'

/**
 * Every V Rising record goes through this. The namespace is bound here, so no
 * part of the app can write into another game's space or into the shared,
 * cross-site `site` namespace -- that one is reachable only via `sharedMemory`.
 */
export const vrisingMemory = memoryFor('vrising')
