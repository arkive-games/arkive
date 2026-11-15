import { browserMemory, defineMemoryRecord, memoryPolicy, type MemoryClient } from './core'
import { isString } from './validators'

type Entry = { x?: number; y?: number; zoom?: number; marker?: string | null }
function entries(raw: string | null): Record<string, Entry> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry)))
  } catch { return {} }
}

/** Camera history survives sessions; incidental marker selection belongs to one tab. */
export function createMapViewStore(namespace: string, options: { legacyKeys?: string[]; client?: MemoryClient } = {}) {
  const client = options.client ?? browserMemory
  const camera = defineMemoryRecord({
    id: 'view', namespace, surface: 'map', schemaVersion: '1.0.0',
    ...memoryPolicy.recentActivity('clear-recent-map-view'), defaultValue: () => '', validate: isString,
    legacyKeys: options.legacyKeys, migrateLegacy: (raw: string) => raw,
  })
  const selection = defineMemoryRecord({
    id: 'selected-marker', namespace, surface: 'map-context', schemaVersion: '1.0.0',
    ...memoryPolicy.sessionContext('clear-map-context'), defaultValue: () => '', validate: isString,
  })
  const cameras = (raw: string) => Object.fromEntries(Object.entries(entries(raw)).flatMap(([id, entry]) =>
    [entry.x, entry.y, entry.zoom].every(value => typeof value === 'number' && Number.isFinite(value))
      ? [[id, { x: entry.x, y: entry.y, zoom: entry.zoom }]] : []))
  return {
    get: (): string | null => {
      const result: Record<string, Entry> = cameras(client.read(camera))
      for (const [id, entry] of Object.entries(entries(client.read(selection)))) {
        if (entry.marker === null || typeof entry.marker === 'string') result[id] = { ...result[id], marker: entry.marker }
      }
      return Object.keys(result).length ? JSON.stringify(result) : null
    },
    set: (raw: string): void => {
      const markers = Object.fromEntries(Object.entries(entries(raw)).flatMap(([id, entry]) =>
        entry.marker === null || typeof entry.marker === 'string' ? [[id, { marker: entry.marker }]] : []))
      client.write(camera, JSON.stringify(cameras(raw)))
      client.write(selection, JSON.stringify(markers))
    },
  }
}
