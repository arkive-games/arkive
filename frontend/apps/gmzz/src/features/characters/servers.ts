import { useEffect, useState } from 'react'

import { dataUrl } from '../../lib/urls'

/** A player server, as the game's own server list names it. */
export type GameServer = { id: number; name: string }

let cached: Promise<GameServer[]> | null = null

/**
 * The player servers (`servers/servers.json`, emitted from `ServerData`).
 * Loaded once per visit; a failure is retried on the next call.
 */
export function loadServers(): Promise<GameServer[]> {
  cached ??= fetch(dataUrl('servers/servers.json'))
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load the server list (${response.status})`)
      return response.json() as Promise<unknown>
    })
    .then((payload) => {
      if (!Array.isArray(payload)) throw new Error('Invalid server list')
      return payload.filter((entry): entry is GameServer =>
        typeof entry?.id === 'number' && typeof entry?.name === 'string')
    })
    .catch((cause) => {
      cached = null
      throw cause
    })
  return cached
}

/** The server list, empty until it loads or if it cannot. */
export function useServers(): GameServer[] {
  const [servers, setServers] = useState<GameServer[]>([])
  useEffect(() => {
    let live = true
    loadServers().then((list) => { if (live) setServers(list) }).catch((cause) => console.error(cause))
    return () => { live = false }
  }, [])
  return servers
}

/**
 * A stored server id as text. An id the list does not have — a server added
 * after this data was exported, or retired since — reads as unknown rather
 * than as a bare number.
 */
export function serverName(servers: GameServer[], id: number | undefined, unknown: string): string | undefined {
  if (id === undefined) return undefined
  return servers.find((server) => server.id === id)?.name ?? (servers.length > 0 ? unknown : undefined)
}
