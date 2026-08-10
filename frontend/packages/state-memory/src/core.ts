import { SHARED_MAXIMUM_BYTES, browserCookieStorage } from "./cookieStorage"

export type MemoryStateClass =
  | "shareable_route"
  | "session_context"
  | "user_preference"
  | "task_draft"
  | "recent_activity"
  | "durable_progress"
  | "transient_ui"

/**
 * `site` is the only scope that crosses ORIGINS. The Arkive games are separate
 * origins (aion2.tc-imba.com, palworld.tc-imba.com, ...), and Web Storage is
 * per-origin, so a record that must look the same on every site cannot live in
 * `device` -- it needs the cookie transport. Before this existed, `namespace:
 * "site"` named that intent without delivering it: the interface language was
 * declared site-wide and silently did not follow the reader between games.
 */
export type MemoryCanonicalScope = "url" | "history" | "tab" | "device" | "account" | "site"
export type MemoryStorageKind = "device" | "session" | "shared"
export type MemoryViewport = "desktop" | "mobile"
export type MemoryMigration<T> = "discard" | ((value: unknown, fromVersion: string) => T | unknown)

export type MemoryRetention =
  | { readonly kind: "indefinite" }
  | { readonly kind: "expires"; readonly milliseconds: number }

export const INDEFINITE_RETENTION = Object.freeze({ kind: "indefinite" } as const)
export const SESSION_RETENTION = Object.freeze({
  kind: "expires",
  milliseconds: 24 * 60 * 60 * 1_000,
} as const)
export const LOCAL_DRAFT_RETENTION = Object.freeze({
  kind: "expires",
  milliseconds: 30 * 24 * 60 * 60 * 1_000,
} as const)
export const RECENT_ACTIVITY_RETENTION = LOCAL_DRAFT_RETENTION

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
  canonicalScope: MemoryCanonicalScope
  defaultValue: () => T
  validate: (value: unknown) => value is T
  retention: MemoryRetention
  clearAction: string
  migrate: MemoryMigration<T>
  fallbackScope?: Extract<MemoryCanonicalScope, "tab" | "device">
  partition?: {
    account?: boolean
    viewport?: boolean
  }
  dataVersion?: string
  merge?: string
  signInAdoption?: "keep_anonymous" | "confirm_merge" | "automatic_union"
  maximumBytes?: number
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
  /** Cross-origin transport for `site`-scoped records; cookie-backed in a browser. */
  sharedStorage?: StorageLike | null
  now?: () => number
  addStorageListener?: (listener: (key: string | null) => void) => () => void
}

interface MemoryEnvelope {
  schemaVersion: string
  stateClass?: MemoryStateClass
  writtenAt: number
  expiresAt?: number
  revision?: string
  dataVersion?: string
  value: unknown
}

const KEY_PART = /^[a-z0-9][a-z0-9-]*$/
const MEMORY_PREFIX = "arkive.memory."
const DEFAULT_MAXIMUM_BYTES = 100_000
/**
 * Progress gets a far larger per-record budget than preferences do, because it
 * grows with how much of a game the player has finished and losing it is the
 * worst thing this package can do. Palworld's MainWorld completion list is
 * 199,694 bytes at 100%, so the old shared 100 KB ceiling stopped saving at
 * roughly half the map -- silently, since `write` only returns `false`. The
 * namespace budget below still bounds the total.
 */
const DURABLE_PROGRESS_MAXIMUM_BYTES = 1_000_000
const DEFAULT_NAMESPACE_BYTES = 3_000_000
const registry = new Map<string, MemoryRecord<unknown>>()

function policy(
  stateClass: Exclude<MemoryStateClass, "shareable_route" | "transient_ui">,
  canonicalScope: Extract<MemoryCanonicalScope, "tab" | "device">,
  retention: MemoryRetention,
  clearAction: string,
) {
  return {
    stateClass,
    canonicalScope,
    retention,
    clearAction,
    migrate: "discard" as const,
  }
}

export const memoryPolicy = Object.freeze({
  sessionContext: (clearAction: string) =>
    policy("session_context", "tab", SESSION_RETENTION, clearAction),
  userPreference: (clearAction: string) =>
    policy("user_preference", "device", INDEFINITE_RETENTION, clearAction),
  taskDraft: (clearAction: string) =>
    policy("task_draft", "device", LOCAL_DRAFT_RETENTION, clearAction),
  recentActivity: (clearAction: string) =>
    policy("recent_activity", "device", RECENT_ACTIVITY_RETENTION, clearAction),
  durableProgress: (clearAction: string) =>
    policy("durable_progress", "device", INDEFINITE_RETENTION, clearAction),
  /**
   * A preference every Arkive site must agree on -- language, theme. Stored in a
   * cookie on the parent domain, because Web Storage cannot cross the games'
   * separate origins. Small by construction; the cap is the cookie limit.
   */
  sharedPreference: (clearAction: string) => ({
    ...policy("user_preference", "device", INDEFINITE_RETENTION, clearAction),
    canonicalScope: "site" as const,
    maximumBytes: SHARED_MAXIMUM_BYTES,
  }),
})

function assertKeyPart(label: string, value: string) {
  if (!KEY_PART.test(value)) {
    throw new Error(`${label} must contain only lowercase letters, digits, and hyphens`)
  }
}

function recordIdentity(record: Pick<MemoryRecord<unknown>, "namespace" | "surface" | "id">): string {
  return `${record.namespace}.${record.surface}.${record.id}`
}

export function defineMemoryRecord<T>(record: MemoryRecord<T>): MemoryRecord<T> {
  assertKeyPart("namespace", record.namespace)
  assertKeyPart("surface", record.surface)
  assertKeyPart("id", record.id)
  assertKeyPart("clearAction", record.clearAction)
  if (!/^\d+\.\d+\.\d+$/.test(record.schemaVersion)) {
    throw new Error("schemaVersion must use semantic versioning")
  }
  if (record.stateClass === "transient_ui") {
    throw new Error("transient_ui must not be registered as a memory record")
  }
  if (record.retention.kind === "expires" && record.retention.milliseconds <= 0) {
    throw new Error("expiring retention must use a positive duration")
  }
  if (
    ["session_context", "task_draft", "recent_activity"].includes(record.stateClass)
    && record.retention.kind !== "expires"
  ) {
    throw new Error(`${record.stateClass} must declare expiring retention`)
  }
  if ((record.canonicalScope === "account" || record.partition?.account) && !record.signInAdoption) {
    throw new Error("account-capable records must declare signInAdoption")
  }
  if (record.signInAdoption === "automatic_union" && record.merge !== "union") {
    throw new Error("automatic_union adoption requires the union merge strategy")
  }
  if (record.maximumBytes !== undefined && record.maximumBytes <= 0) {
    throw new Error("maximumBytes must be positive")
  }
  if (record.canonicalScope === "site" && (record.maximumBytes ?? Infinity) > SHARED_MAXIMUM_BYTES) {
    throw new Error(
      `site-scoped records travel in a cookie and must cap maximumBytes at ${SHARED_MAXIMUM_BYTES}`,
    )
  }
  const frozen = Object.freeze({ ...record })
  registry.set(recordIdentity(frozen as MemoryRecord<unknown>), frozen as MemoryRecord<unknown>)
  return frozen
}

export function getMemoryRegistry(): readonly MemoryRecord<unknown>[] {
  return [...registry.values()]
}

export function encodeMemorySegment(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function appendScope<T>(key: string, record: MemoryRecord<T>, scope: MemoryScope, legacy: boolean): string {
  const encode = legacy ? encodeURIComponent : encodeMemorySegment
  if (record.partition?.account) {
    key += `.account.${encode(scope.accountId ?? "anonymous")}`
  }
  if (record.partition?.viewport) {
    key += `.viewport.${scope.viewport ?? "desktop"}`
  }
  if (scope.partition) {
    key += `.partition.${encode(scope.partition)}`
  }
  return key
}

export function getMemoryKey<T>(record: MemoryRecord<T>, scope: MemoryScope = {}): string {
  return appendScope(
    `${MEMORY_PREFIX}${record.namespace}.${record.surface}.${record.id}`,
    record,
    scope,
    false,
  )
}

function getVersionedMemoryKey<T>(record: MemoryRecord<T>, scope: MemoryScope): string {
  return appendScope(
    `${MEMORY_PREFIX}v${record.schemaVersion}.${record.namespace}.${record.surface}.${record.id}`,
    record,
    scope,
    true,
  )
}

function getVersionedMemoryKeySuffix<T>(record: MemoryRecord<T>, scope: MemoryScope): string {
  return appendScope(`.${record.namespace}.${record.surface}.${record.id}`, record, scope, true)
}

function isMemoryNamespaceKey(key: string, namespace?: string): boolean {
  if (!key.startsWith(MEMORY_PREFIX)) return false
  if (!namespace) return true
  if (key.startsWith(`${MEMORY_PREFIX}${namespace}.`)) return true
  return new RegExp(`^${MEMORY_PREFIX.replaceAll(".", "\\.")}v\\d+\\.\\d+\\.\\d+\\.${namespace}\\.`).test(key)
}

function keyBelongsToRecord(key: string, record: MemoryRecord<unknown>): boolean {
  const stablePrefix = `${MEMORY_PREFIX}${record.namespace}.${record.surface}.${record.id}`
  if (key === stablePrefix || key.startsWith(`${stablePrefix}.`)) return true
  const versioned = new RegExp(
    `^${MEMORY_PREFIX.replaceAll(".", "\\.")}v\\d+\\.\\d+\\.\\d+\\.${record.namespace}\\.${record.surface}\\.${record.id}(?:\\.|$)`,
  )
  return versioned.test(key)
}

function storageKind<T>(record: MemoryRecord<T>): MemoryStorageKind | null {
  const scope = record.canonicalScope === "account" ? record.fallbackScope : record.canonicalScope
  if (scope === "tab") return "session"
  if (scope === "device") return "device"
  if (scope === "site") return "shared"
  return null
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
    sharedStorage: browserCookieStorage(),
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
  return typeof candidate.schemaVersion === "string"
    && typeof candidate.writtenAt === "number"
    && Number.isFinite(candidate.writtenAt)
    && "value" in candidate
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * A refused write is the failure mode that loses data while looking fine: React
 * state has already updated, so the UI shows the change and only a reload reveals
 * it never persisted. Callers routinely ignore the boolean, so say so out loud.
 */
function reportWriteRefused<T>(record: MemoryRecord<T>, reason: string): void {
  console.warn(
    `[state-memory] refused to persist ${recordIdentity(record)} (${record.stateClass}): ${reason}`,
  )
}

function maximumBytesFor<T>(record: MemoryRecord<T>): number {
  if (record.maximumBytes !== undefined) return record.maximumBytes
  return record.stateClass === "durable_progress"
    ? DURABLE_PROGRESS_MAXIMUM_BYTES
    : DEFAULT_MAXIMUM_BYTES
}

/**
 * Whether `segment` appears in `key` as a whole segment rather than a prefix of
 * a longer one. Scope segments are appended in order (`.account.x`, then
 * `.viewport.y`, then `.partition.z`), so a real match ends at a `.` or at the
 * end of the key. A plain `includes` let `.account.1` match `.account.10`.
 */
function keyHasSegment(key: string, segment: string): boolean {
  for (let from = 0; ; from = from + 1) {
    const at = key.indexOf(segment, from)
    if (at < 0) return false
    const after = at + segment.length
    if (after === key.length || key[after] === ".") return true
    from = at
  }
}

/**
 * The state class a stored key belongs to: the envelope's own value when it has
 * one, else the class of whichever registered record owns the key. Returns
 * undefined when neither can say, in which case callers must assume the data is
 * precious rather than disposable.
 */
function storedStateClass(key: string, raw: string | null): MemoryStateClass | undefined {
  if (raw !== null) {
    try {
      const envelope: unknown = JSON.parse(raw)
      if (isEnvelope(envelope) && envelope.stateClass) return envelope.stateClass
    } catch {
      // Fall through to the typed registry for older or unparseable envelopes.
    }
  }
  return getMemoryRegistry().find((record) => keyBelongsToRecord(key, record))?.stateClass
}

function storageKeys(storage: StorageLike): string[] {
  if (!storage.key || typeof storage.length !== "number") return []
  return Array.from({ length: storage.length }, (_, index) => storage.key?.(index) ?? null)
    .filter((key): key is string => typeof key === "string")
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
      if (raw !== null) return this.restoreEnvelope(record, scope, storage, key, raw)
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
      stateClass: record.stateClass,
      writtenAt: now,
      value,
      ...(record.retention.kind === "expires"
        ? { expiresAt: now + record.retention.milliseconds }
        : {}),
      ...(record.dataVersion ? { dataVersion: record.dataVersion } : {}),
    }
    try {
      const raw = JSON.stringify(envelope)
      if (byteLength(raw) > maximumBytesFor(record)) {
        // Loud, because the return value is easy to drop and the symptom otherwise
        // is a UI that shows saved state which disappears on the next reload.
        reportWriteRefused(record, `${byteLength(raw)} bytes exceeds ${maximumBytesFor(record)}`)
        return false
      }
      const key = getMemoryKey(record, scope)
      if (!this.withinNamespaceBudget(storage, record.namespace, key, raw)) {
        reportWriteRefused(record, `namespace "${record.namespace}" is over its byte budget`)
        return false
      }
      storage.setItem(key, raw)
      this.emit(key)
      return true
    } catch (error) {
      // Quota exceeded, or storage revoked mid-session.
      reportWriteRefused(record, error instanceof Error ? error.message : "storage threw")
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

  /**
   * Forget an account's *disposable* state -- session context, preferences,
   * drafts. It deliberately keeps `durable_progress`.
   *
   * The call site is a sign-out (or any change of signed-in id), and the previous
   * behaviour deleted every key carrying the account segment regardless of class.
   * Because a successful migration also removes the legacy key, that made signing
   * out destroy the only copy of the user's bookmarks, likes, follows, favourite
   * games and published posts. Progress is not "account cleanup"; a deliberate
   * wipe has `clearStateClass("durable_progress")`.
   */
  clearAccount(accountId: string): void {
    const current = this.currentEnvironment()
    const segments = [
      `.account.${encodeMemorySegment(accountId)}`,
      `.account.${encodeURIComponent(accountId)}`,
    ]
    const predicate = (key: string, raw: string | null) => {
      if (!segments.some((segment) => keyHasSegment(key, segment))) return false
      const stateClass = storedStateClass(key, raw)
      // An unknown class is treated as precious and kept: deleting data we cannot
      // classify is exactly how the sign-out bug destroyed progress.
      if (stateClass === undefined) return false
      return stateClass !== "durable_progress"
    }
    this.clearStorageKeys(current.deviceStorage, predicate)
    this.clearStorageKeys(current.sessionStorage, predicate)
    this.clearStorageKeys(current.sharedStorage, predicate)
  }

  clearStateClass(stateClass: MemoryStateClass, namespace?: string): void {
    const predicate = (key: string, raw: string | null) => {
      if (!isMemoryNamespaceKey(key, namespace)) return false
      try {
        if (raw !== null) {
          const envelope: unknown = JSON.parse(raw)
          if (isEnvelope(envelope) && envelope.stateClass === stateClass) return true
        }
      } catch {
        // Fall through to the typed registry for older envelopes.
      }
      return getMemoryRegistry().some((record) => (
        record.stateClass === stateClass
        && (!namespace || record.namespace === namespace)
        && keyBelongsToRecord(key, record)
      ))
    }
    const current = this.currentEnvironment()
    this.clearStorageKeys(current.deviceStorage, predicate)
    this.clearStorageKeys(current.sessionStorage, predicate)
    this.clearStorageKeys(current.sharedStorage, predicate)
  }

  clearDevice(namespace?: string): void {
    this.clearStorageKeys(
      this.currentEnvironment().deviceStorage,
      (key) => isMemoryNamespaceKey(key, namespace),
    )
  }

  clearAll(namespace?: string): void {
    const predicate = (key: string) => isMemoryNamespaceKey(key, namespace)
    const current = this.currentEnvironment()
    this.clearStorageKeys(current.deviceStorage, predicate)
    this.clearStorageKeys(current.sessionStorage, predicate)
    this.clearStorageKeys(current.sharedStorage, predicate)
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
    const kind = storageKind(record)
    if (kind === "session") return this.currentEnvironment().sessionStorage ?? null
    if (kind === "device") return this.currentEnvironment().deviceStorage ?? null
    if (kind === "shared") return this.currentEnvironment().sharedStorage ?? null
    return null
  }

  private currentEnvironment(): MemoryEnvironment {
    return this.environment ?? browserEnvironment()
  }

  private restoreEnvelope<T>(
    record: MemoryRecord<T>,
    scope: MemoryScope,
    storage: StorageLike,
    key: string,
    raw: string,
  ): T {
    // Neither of these deletes. A read has no business destroying data: lowering
    // a cap, or tightening a validator, in some later deploy would then erase
    // every already-stored value that no longer fits instead of just ignoring it.
    // The bytes stay put so a fixed build (or a rollback) can still read them.
    if (byteLength(raw) > maximumBytesFor(record)) {
      return record.defaultValue()
    }
    const envelope: unknown = JSON.parse(raw)
    if (!isEnvelope(envelope)) {
      return record.defaultValue()
    }
    const now = this.currentEnvironment().now?.() ?? Date.now()
    if (record.retention.kind === "expires" && typeof envelope.expiresAt !== "number") {
      storage.removeItem(key)
      return record.defaultValue()
    }
    if (envelope.expiresAt !== undefined && envelope.expiresAt <= now) {
      storage.removeItem(key)
      return record.defaultValue()
    }
    if (record.dataVersion && envelope.dataVersion !== record.dataVersion) {
      storage.removeItem(key)
      return record.defaultValue()
    }
    if (envelope.stateClass && envelope.stateClass !== record.stateClass) {
      storage.removeItem(key)
      return record.defaultValue()
    }
    if (envelope.schemaVersion !== record.schemaVersion) {
      if (record.migrate === "discard") {
        storage.removeItem(key)
        return record.defaultValue()
      }
      const migrated = record.migrate(envelope.value, envelope.schemaVersion)
      if (!record.validate(migrated)) {
        storage.removeItem(key)
        return record.defaultValue()
      }
      if (this.write(record, migrated, scope)) return migrated
      return record.defaultValue()
    }
    if (!record.validate(envelope.value)) {
      storage.removeItem(key)
      return record.defaultValue()
    }
    return envelope.value
  }

  private readLegacy<T>(record: MemoryRecord<T>, scope: MemoryScope, storage: StorageLike): T {
    const current = this.currentEnvironment()
    const sources = [storage, current.deviceStorage, current.sessionStorage, current.sharedStorage]
      .filter((candidate): candidate is StorageLike => Boolean(candidate))
      .filter((candidate, index, all) => all.indexOf(candidate) === index)

    for (const source of sources) {
      if (source !== storage) {
        const canonicalKey = getMemoryKey(record, scope)
        try {
          const raw = source.getItem(canonicalKey)
          if (raw !== null) {
            const value = this.restoreEnvelope(record, scope, source, canonicalKey, raw)
            if (record.validate(value) && this.write(record, value, scope)) source.removeItem(canonicalKey)
            return value
          }
        } catch {
          // Continue to versioned and explicitly declared legacy formats.
        }
      }

      const versionedKeys = new Set([getVersionedMemoryKey(record, scope)])
      const suffix = getVersionedMemoryKeySuffix(record, scope)
      for (const key of storageKeys(source)) {
        if (/^arkive\.memory\.v\d+\.\d+\.\d+\./.test(key) && key.endsWith(suffix)) {
          versionedKeys.add(key)
        }
      }
      for (const versionedKey of versionedKeys) {
        try {
          const raw = source.getItem(versionedKey)
          if (raw === null) continue
          const value = this.restoreEnvelope(record, scope, source, versionedKey, raw)
          if (record.validate(value) && this.write(record, value, scope)) source.removeItem(versionedKey)
          return value
        } catch {
          // Try another known version or explicitly declared legacy format.
        }
      }

      if (!record.legacyKeys || !record.migrateLegacy) continue
      for (const legacyKey of record.legacyKeys) {
        try {
          const raw = source.getItem(legacyKey)
          // Size is NOT a reason to skip a legacy value. Skipping it abandoned the
          // user's existing progress unread -- aion2's World_L_A list is 126,454
          // bytes in the old format -- and left the legacy key orphaned. Migrate
          // it regardless; the migrated form is often smaller, and if the write
          // still fails the value is at least returned for this session.
          if (raw === null) continue
          const migrated = record.migrateLegacy(raw, legacyKey)
          if (!record.validate(migrated)) continue
          if (this.write(record, migrated, scope)) source.removeItem(legacyKey)
          return migrated
        } catch {
          // Try the next compatible legacy key or storage.
        }
      }
    }
    return record.defaultValue()
  }

  private withinNamespaceBudget(
    storage: StorageLike,
    namespace: string,
    replacingKey: string,
    nextRaw: string,
  ): boolean {
    if (!storage.key || typeof storage.length !== "number") return true
    let bytes = byteLength(nextRaw)
    for (const key of storageKeys(storage)) {
      if (!isMemoryNamespaceKey(key, namespace) || key === replacingKey) continue
      const raw = storage.getItem(key)
      if (raw !== null) bytes += byteLength(raw)
      if (bytes > DEFAULT_NAMESPACE_BYTES) return false
    }
    return bytes <= DEFAULT_NAMESPACE_BYTES
  }

  private clearStorageKeys(
    storage: StorageLike | null | undefined,
    predicate: (key: string, raw: string | null) => boolean,
  ): void {
    if (!storage) return
    try {
      const keys = storageKeys(storage)
      for (const key of keys) {
        const raw = storage.getItem(key)
        if (!predicate(key, raw)) continue
        storage.removeItem(key)
        this.emit(key)
      }
    } catch {
      // Clear actions stay best-effort when storage becomes unavailable.
    }
  }

  private emit(key: string) {
    this.localListeners.get(key)?.forEach((listener) => listener())
  }
}

export const browserMemory = new MemoryClient()
