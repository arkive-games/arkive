export type MemoryStateClass =
  | "shareable_route"
  | "session_context"
  | "device_preference"
  | "task_draft"
  | "durable_progress"

export type MemoryStorageKind = "device" | "session"
export type MemoryViewport = "desktop" | "mobile"

export interface StorageLike {
  readonly length?: number
  key?: (index: number) => string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface MemoryRecord<T> {
  id: string
  namespace: string
  surface: string
  stateClass: MemoryStateClass
  schemaVersion: string
  defaultValue: () => T
  validate: (value: unknown) => value is T
  retentionMs?: number
  storage?: MemoryStorageKind
  viewportScoped?: boolean
  accountScoped?: boolean
  maxBytes?: number
  legacyKeys?: readonly string[]
  migrateLegacy?: (raw: string, key: string) => unknown
}

export interface MemoryScope {
  accountId?: string | null
  viewport?: MemoryViewport
  partition?: string
}

export interface MemoryEnvironment {
  deviceStorage?: StorageLike | null
  sessionStorage?: StorageLike | null
  now?: () => number
  addStorageListener?: (listener: (key: string | null) => void) => () => void
}

interface MemoryEnvelope {
  schemaVersion: string
  writtenAt: number
  expiresAt?: number
  value: unknown
}

const KEY_PART = /^[a-z0-9][a-z0-9-]*$/
const DEFAULT_MAX_BYTES = 100_000

function assertKeyPart(label: string, value: string) {
  if (!KEY_PART.test(value)) {
    throw new Error(`${label} must contain only lowercase letters, digits, and hyphens`)
  }
}

export function defineMemoryRecord<T>(record: MemoryRecord<T>): MemoryRecord<T> {
  assertKeyPart("namespace", record.namespace)
  assertKeyPart("surface", record.surface)
  assertKeyPart("id", record.id)
  if (!/^\d+\.\d+\.\d+$/.test(record.schemaVersion)) {
    throw new Error("schemaVersion must use semantic versioning")
  }
  if (record.retentionMs !== undefined && record.retentionMs <= 0) {
    throw new Error("retentionMs must be positive")
  }
  return Object.freeze({ ...record })
}

export function getMemoryKey<T>(record: MemoryRecord<T>, scope: MemoryScope = {}): string {
  let key = `arkive.memory.v${record.schemaVersion}.${record.namespace}.${record.surface}.${record.id}`
  if (record.accountScoped) {
    key += `.account.${encodeURIComponent(scope.accountId ?? "anonymous")}`
  }
  if (record.viewportScoped) {
    key += `.viewport.${scope.viewport ?? "desktop"}`
  }
  if (scope.partition) {
    key += `.partition.${encodeURIComponent(scope.partition)}`
  }
  return key
}

function storageKind<T>(record: MemoryRecord<T>): MemoryStorageKind {
  if (record.storage) return record.storage
  return record.stateClass === "session_context" || record.stateClass === "shareable_route"
    ? "session"
    : "device"
}

function browserEnvironment(): MemoryEnvironment {
  if (typeof window === "undefined") {
    try { return { deviceStorage: globalThis.localStorage } } catch { return {} }
  }
  let deviceStorage: StorageLike | null = null
  let sessionStorage: StorageLike | null = null
  try { deviceStorage = window.localStorage } catch { /* restricted storage */ }
  try { sessionStorage = window.sessionStorage } catch { /* restricted storage */ }
  return {
    deviceStorage,
    sessionStorage,
    addStorageListener(listener) {
      const handleStorage = (event: StorageEvent) => listener(event.key)
      window.addEventListener("storage", handleStorage)
      return () => window.removeEventListener("storage", handleStorage)
    },
  }
}

function isEnvelope(value: unknown): value is MemoryEnvelope {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<MemoryEnvelope>
  return typeof candidate.schemaVersion === "string" && typeof candidate.writtenAt === "number"
}

export class MemoryClient {
  private readonly environment?: MemoryEnvironment
  private readonly localListeners = new Map<string, Set<() => void>>()

  constructor(environment?: MemoryEnvironment) {
    this.environment = environment
  }

  read<T>(record: MemoryRecord<T>, scope: MemoryScope = {}): T {
    const storage = this.getStorage(record)
    if (!storage) return record.defaultValue()
    const key = getMemoryKey(record, scope)
    try {
      const raw = storage.getItem(key)
      if (raw !== null) {
        if (raw.length > (record.maxBytes ?? DEFAULT_MAX_BYTES)) {
          storage.removeItem(key)
          return record.defaultValue()
        }
        const envelope: unknown = JSON.parse(raw)
        if (!isEnvelope(envelope) || envelope.schemaVersion !== record.schemaVersion) {
          storage.removeItem(key)
          return record.defaultValue()
        }
        const now = this.currentEnvironment().now?.() ?? Date.now()
        if (envelope.expiresAt !== undefined && envelope.expiresAt <= now) {
          storage.removeItem(key)
          return record.defaultValue()
        }
        if (!record.validate(envelope.value)) {
          storage.removeItem(key)
          return record.defaultValue()
        }
        return envelope.value
      }
      return this.readLegacy(record, scope, storage)
    } catch {
      return record.defaultValue()
    }
  }

  write<T>(record: MemoryRecord<T>, value: T, scope: MemoryScope = {}): boolean {
    if (!record.validate(value)) return false
    const storage = this.getStorage(record)
    if (!storage) return false
    const now = this.currentEnvironment().now?.() ?? Date.now()
    const envelope: MemoryEnvelope = {
      schemaVersion: record.schemaVersion,
      writtenAt: now,
      value,
      ...(record.retentionMs ? { expiresAt: now + record.retentionMs } : {}),
    }
    try {
      const raw = JSON.stringify(envelope)
      if (raw.length > (record.maxBytes ?? DEFAULT_MAX_BYTES)) return false
      const key = getMemoryKey(record, scope)
      storage.setItem(key, raw)
      this.emit(key)
      return true
    } catch {
      return false
    }
  }

  clear<T>(record: MemoryRecord<T>, scope: MemoryScope = {}): void {
    const storage = this.getStorage(record)
    if (!storage) return
    const key = getMemoryKey(record, scope)
    try {
      storage.removeItem(key)
      this.emit(key)
    } catch {
      // Restricted storage degrades to in-memory component state.
    }
  }

  clearAccount(accountId: string): void {
    const storage = this.currentEnvironment().deviceStorage
    if (!storage?.key || typeof storage.length !== "number") return
    const accountSegment = `.account.${encodeURIComponent(accountId)}`
    try {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key?.(index) ?? null)
        .filter((key): key is string =>
          typeof key === "string" && key.startsWith("arkive.memory.") && key.includes(accountSegment))
      for (const key of keys) {
        storage.removeItem(key)
        this.emit(key)
      }
    } catch {
      // Account cleanup is best-effort when storage becomes unavailable.
    }
  }

  subscribe<T>(record: MemoryRecord<T>, scope: MemoryScope, listener: () => void): () => void {
    const key = getMemoryKey(record, scope)
    const listeners = this.localListeners.get(key) ?? new Set<() => void>()
    listeners.add(listener)
    this.localListeners.set(key, listeners)
    const removeStorageListener = this.currentEnvironment().addStorageListener?.((changedKey) => {
      if (changedKey === key || changedKey === null) listener()
    })
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.localListeners.delete(key)
      removeStorageListener?.()
    }
  }

  private getStorage<T>(record: MemoryRecord<T>): StorageLike | null {
    return storageKind(record) === "session"
      ? this.currentEnvironment().sessionStorage ?? null
      : this.currentEnvironment().deviceStorage ?? null
  }

  private currentEnvironment(): MemoryEnvironment {
    return this.environment ?? browserEnvironment()
  }

  private readLegacy<T>(record: MemoryRecord<T>, scope: MemoryScope, storage: StorageLike): T {
    if (!record.legacyKeys || !record.migrateLegacy) return record.defaultValue()
    for (const legacyKey of record.legacyKeys) {
      try {
        const raw = storage.getItem(legacyKey)
        if (raw === null || raw.length > (record.maxBytes ?? DEFAULT_MAX_BYTES)) continue
        const migrated = record.migrateLegacy(raw, legacyKey)
        if (!record.validate(migrated)) continue
        if (this.write(record, migrated, scope)) storage.removeItem(legacyKey)
        return migrated
      } catch {
        // Try the next compatible legacy key.
      }
    }
    return record.defaultValue()
  }

  private emit(key: string) {
    this.localListeners.get(key)?.forEach((listener) => listener())
  }
}

export const browserMemory = new MemoryClient()
