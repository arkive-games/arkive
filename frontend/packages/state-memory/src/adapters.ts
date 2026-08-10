export interface UrlMemoryEnvironment {
  getUrl: () => URL
  replaceUrl: (url: URL) => void
}

export interface HistoryMemoryEnvironment {
  getState: () => unknown
  replaceState: (state: unknown) => void
}

export interface AccountMemoryAdapter {
  read: (key: string) => Promise<AccountMemorySnapshot | null>
  write: (key: string, value: unknown, expectedRevision: string | null) => Promise<AccountMemorySnapshot>
  clear: (key: string, expectedRevision: string | null) => Promise<void>
}

export interface AccountMemorySnapshot {
  value: unknown
  /** Opaque revision issued by the account service. Device clocks are never authoritative. */
  revision: string
}

export interface HistoryMemoryOptions<T> {
  schemaVersion: string
  stateClass: 'session_context' | 'shareable_route'
  retentionMs: number
  now?: () => number
  dataVersion?: string
  migrate?: 'discard' | ((value: unknown, fromVersion: string) => T | unknown)
}

interface HistoryMemoryEnvelope {
  schemaVersion: string
  stateClass: 'session_context' | 'shareable_route'
  writtenAt: number
  expiresAt: number
  dataVersion?: string
  value: unknown
}

function removeHistoryMemory(environment: HistoryMemoryEnvironment, key: string): void {
  try {
    const current = environment.getState()
    if (!current || typeof current !== 'object') return
    const state = current as Record<string, unknown>
    if (!state.arkiveMemory || typeof state.arkiveMemory !== 'object') return
    const memory = { ...(state.arkiveMemory as Record<string, unknown>) }
    delete memory[key]
    const next = { ...state }
    if (Object.keys(memory).length > 0) next.arkiveMemory = memory
    else delete next.arkiveMemory
    environment.replaceState(next)
  } catch {
    // Invalid history state is ignored when the browser rejects replacement.
  }
}

export interface MemoryValueSource<T> {
  read: () => T | null | undefined | Promise<T | null | undefined>
}

export function createBrowserUrlMemoryEnvironment(): UrlMemoryEnvironment | null {
  if (typeof window === 'undefined') return null
  return {
    getUrl: () => new URL(window.location.href),
    replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
  }
}

export function readUrlMemory<T>(
  environment: UrlMemoryEnvironment | null,
  key: string,
  parse: (raw: string) => unknown,
  validate: (value: unknown) => value is T,
): T | null {
  if (!environment) return null
  try {
    const raw = environment.getUrl().searchParams.get(key)
    if (raw === null) return null
    const value = parse(raw)
    return validate(value) ? value : null
  } catch {
    return null
  }
}

export function writeUrlMemory(
  environment: UrlMemoryEnvironment | null,
  key: string,
  value: string | null,
): void {
  if (!environment) return
  try {
    const url = environment.getUrl()
    if (value === null || value === '') url.searchParams.delete(key)
    else url.searchParams.set(key, value)
    environment.replaceUrl(url)
  } catch {
    // Invalid or restricted URL state leaves the current route untouched.
  }
}

export function createBrowserHistoryMemoryEnvironment(): HistoryMemoryEnvironment | null {
  if (typeof window === 'undefined') return null
  return {
    getState: () => window.history.state as unknown,
    replaceState: (state) => window.history.replaceState(state, '', window.location.href),
  }
}

export function readHistoryMemory<T>(
  environment: HistoryMemoryEnvironment | null,
  key: string,
  validate: (value: unknown) => value is T,
  options: HistoryMemoryOptions<T>,
): T | null {
  if (!environment) return null
  try {
    const state = environment.getState()
    if (!state || typeof state !== 'object') return null
    const memory = (state as { arkiveMemory?: unknown }).arkiveMemory
    if (!memory || typeof memory !== 'object') return null
    const candidate = (memory as Record<string, unknown>)[key]
    if (!candidate || typeof candidate !== 'object') {
      removeHistoryMemory(environment, key)
      return null
    }
    const envelope = candidate as Partial<HistoryMemoryEnvelope>
    const now = options.now?.() ?? Date.now()
    if (typeof envelope.schemaVersion !== 'string'
      || typeof envelope.writtenAt !== 'number'
      || typeof envelope.expiresAt !== 'number'
      || envelope.expiresAt <= now
      || envelope.stateClass !== options.stateClass
      || (options.dataVersion && envelope.dataVersion !== options.dataVersion)) {
      removeHistoryMemory(environment, key)
      return null
    }
    if (envelope.schemaVersion === options.schemaVersion) {
      if (validate(envelope.value)) return envelope.value
      removeHistoryMemory(environment, key)
      return null
    }
    if (!options.migrate || options.migrate === 'discard') {
      removeHistoryMemory(environment, key)
      return null
    }
    const migrated = options.migrate(envelope.value, envelope.schemaVersion)
    if (!validate(migrated)) {
      removeHistoryMemory(environment, key)
      return null
    }
    writeHistoryMemory(environment, key, migrated, options)
    return migrated
  } catch {
    return null
  }
}

export function writeHistoryMemory(
  environment: HistoryMemoryEnvironment | null,
  key: string,
  value: unknown,
  options: HistoryMemoryOptions<unknown>,
): void {
  if (!environment) return
  try {
    if (!Number.isFinite(options.retentionMs) || options.retentionMs <= 0) return
    const current = environment.getState()
    const state = current && typeof current === 'object' ? current as Record<string, unknown> : {}
    const currentMemory = state.arkiveMemory && typeof state.arkiveMemory === 'object'
      ? state.arkiveMemory as Record<string, unknown>
      : {}
    const writtenAt = options.now?.() ?? Date.now()
    environment.replaceState({
      ...state,
      arkiveMemory: {
        ...currentMemory,
        [key]: {
          schemaVersion: options.schemaVersion,
          stateClass: options.stateClass,
          writtenAt,
          expiresAt: writtenAt + options.retentionMs,
          ...(options.dataVersion ? { dataVersion: options.dataVersion } : {}),
          value,
        } satisfies HistoryMemoryEnvelope,
      },
    })
  } catch {
    // History memory is optional and never blocks navigation.
  }
}

export const noOpAccountMemoryAdapter: AccountMemoryAdapter = {
  read: async () => null,
  write: async () => { throw new Error('Account memory is unavailable') },
  clear: async () => undefined,
}

export async function restoreMemoryValue<T>(options: {
  url?: MemoryValueSource<T>
  history?: MemoryValueSource<T>
  account?: MemoryValueSource<T>
  device?: MemoryValueSource<T>
  validate: (value: unknown) => value is T
  defaultValue: () => T
}): Promise<T> {
  const sources = [options.url, options.history, options.account, options.device]
  for (const source of sources) {
    if (!source) continue
    try {
      const value = await source.read()
      if (options.validate(value)) return value
    } catch {
      // Lower-precedence sources may still restore a valid value.
    }
  }
  return options.defaultValue()
}
