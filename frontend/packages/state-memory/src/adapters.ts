export interface UrlMemoryEnvironment {
  getUrl: () => URL
  replaceUrl: (url: URL) => void
}

export interface HistoryMemoryEnvironment {
  getState: () => unknown
  replaceState: (state: unknown) => void
}

export interface AccountMemoryAdapter {
  read: (key: string) => Promise<unknown | null>
  write: (key: string, value: unknown) => Promise<void>
  clear: (key: string) => Promise<void>
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
): T | null {
  if (!environment) return null
  try {
    const state = environment.getState()
    if (!state || typeof state !== 'object') return null
    const memory = (state as { arkiveMemory?: unknown }).arkiveMemory
    if (!memory || typeof memory !== 'object') return null
    const value = (memory as Record<string, unknown>)[key]
    return validate(value) ? value : null
  } catch {
    return null
  }
}

export function writeHistoryMemory(
  environment: HistoryMemoryEnvironment | null,
  key: string,
  value: unknown,
): void {
  if (!environment) return
  try {
    const current = environment.getState()
    const state = current && typeof current === 'object' ? current as Record<string, unknown> : {}
    const currentMemory = state.arkiveMemory && typeof state.arkiveMemory === 'object'
      ? state.arkiveMemory as Record<string, unknown>
      : {}
    environment.replaceState({
      ...state,
      arkiveMemory: { ...currentMemory, [key]: value },
    })
  } catch {
    // History memory is optional and never blocks navigation.
  }
}

export const noOpAccountMemoryAdapter: AccountMemoryAdapter = {
  read: async () => null,
  write: async () => undefined,
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
