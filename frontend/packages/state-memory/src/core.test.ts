import { describe, expect, it, vi } from "vitest"
import {
  MemoryClient,
  defineMemoryRecord,
  getMemoryKey,
  memoryPolicy,
  type StorageLike,
} from "./core"

class TestStorage implements StorageLike {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const preference = defineMemoryRecord({
  id: "view-mode",
  namespace: "test-game",
  surface: "catalog",
  ...memoryPolicy.userPreference("reset-view-mode"),
  schemaVersion: "1.0.0",
  defaultValue: () => "grid" as "grid" | "list",
  validate: (value: unknown): value is "grid" | "list" => value === "grid" || value === "list",
})

describe("MemoryClient", () => {
  it("round-trips a validated record using the canonical key", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage, now: () => 100 })

    expect(client.write(preference, "list")).toBe(true)
    expect(client.read(preference)).toBe("list")
    expect([...storage.values.keys()]).toEqual([
      "arkive.memory.test-game.catalog.view-mode",
    ])
  })

  it("discards malformed, invalid, expired, and oversized values", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage, now: () => 1_000 })
    const key = getMemoryKey(preference)

    storage.setItem(key, "{bad")
    expect(client.read(preference)).toBe("grid")
    storage.setItem(key, JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 0, value: "cards" }))
    expect(client.read(preference)).toBe("grid")
    storage.setItem(key, JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 0, expiresAt: 1, value: "list" }))
    expect(client.read(preference)).toBe("grid")
    const expiring = defineMemoryRecord({
      ...preference,
      id: "expiring-value",
      ...memoryPolicy.sessionContext("clear-expiring-value"),
    })
    const expiringKey = getMemoryKey(expiring)
    storage.setItem(expiringKey, JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 0, value: "list" }))
    expect(new MemoryClient({ sessionStorage: storage }).read(expiring)).toBe("grid")
    expect(storage.getItem(expiringKey)).toBeNull()
    // Oversized reads fall back to the default but must NOT delete: a read that
    // destroys data means lowering a cap in a later deploy erases every stored
    // value that no longer fits, rather than leaving it for a fixed build.
    const oversized = "x".repeat(100_001)
    storage.setItem(key, oversized)
    expect(client.read(preference)).toBe("grid")
    expect(storage.getItem(key)).toBe(oversized)
  })

  it("keeps an unreadable value instead of deleting it", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage, now: () => 1_000 })
    const key = getMemoryKey(preference)

    // Not an envelope: could be a hand-written value, a format from a build we
    // have not shipped yet, or corruption. None of those justify erasing it.
    storage.setItem(key, JSON.stringify({ nope: true }))
    expect(client.read(preference)).toBe("grid")
    expect(storage.getItem(key)).not.toBeNull()
  })

  it("gives durable progress a far larger budget than a preference", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage })
    const progress = defineMemoryRecord({
      id: "completed", namespace: "test-game", surface: "map",
      ...memoryPolicy.durableProgress("clear-map-progress"),
      schemaVersion: "1.0.0",
      defaultValue: () => [] as string[],
      validate: (value: unknown): value is string[] => Array.isArray(value),
    })

    // Palworld's MainWorld completion list is ~199,694 bytes at 100%, which the
    // shared 100 KB preference ceiling refused -- silently, at about half the map.
    const ids = Array.from({ length: 8_404 }, (_, index) => `marker-${index}-aaaaaaaaaaaaaaaa`)
    expect(JSON.stringify(ids).length).toBeGreaterThan(100_000)
    expect(client.write(progress, ids)).toBe(true)
    expect(client.read(progress)).toHaveLength(8_404)
  })

  it("migrates a compatible legacy record once", () => {
    const storage = new TestStorage()
    storage.setItem("old-view-mode", "list")
    const record = defineMemoryRecord({
      ...preference,
      legacyKeys: ["old-view-mode"],
      migrateLegacy: (raw: string) => raw,
    })
    const client = new MemoryClient({ deviceStorage: storage })

    expect(client.read(record)).toBe("list")
    expect(storage.getItem("old-view-mode")).toBeNull()
    expect(storage.getItem(getMemoryKey(record))).not.toBeNull()
  })

  it("copies a reclassified session record without destroying the durable original", () => {
    // This deliberately REVERSES an earlier expectation ("moves ... out of device
    // storage"). Deleting the device copy is only a "move" if the destination is
    // equally durable, and sessionStorage is not: the value dies with the tab, so
    // the durable original was the only copy the user still had.
    //
    // That is not hypothetical -- it is what shipped. aion2's per-map visible
    // subtypes and regions, palworld's visibleSubtypes / pals filter / pal-detail
    // sections, sts2's card filter and V Rising's visibleSubtypes were all
    // localStorage-backed and were reclassified to sessionContext, so one visit
    // migrated them into sessionStorage and erased the durable copy. Those records
    // are now durable again; this keeps the storage layer from being able to do it.
    const device = new TestStorage()
    const session = new TestStorage()
    device.setItem("old-filter", JSON.stringify(["bosses"]))
    const record = defineMemoryRecord({
      id: "filters", namespace: "scope-move", surface: "catalog",
      ...memoryPolicy.sessionContext("clear-filters"),
      schemaVersion: "1.0.0", defaultValue: () => [] as string[],
      validate: (value: unknown): value is string[] => Array.isArray(value)
        && value.every((item) => typeof item === "string"),
      legacyKeys: ["old-filter"], migrateLegacy: (raw) => JSON.parse(raw) as unknown,
    })
    const client = new MemoryClient({ deviceStorage: device, sessionStorage: session })

    expect(client.read(record)).toEqual(["bosses"])
    expect(session.getItem(getMemoryKey(record))).not.toBeNull()
    // Kept, so closing the tab does not lose it.
    expect(device.getItem("old-filter")).not.toBeNull()
    // And it is still there for a fresh session.
    const afterTabClose = new MemoryClient({ deviceStorage: device, sessionStorage: new TestStorage() })
    expect(afterTabClose.read(record)).toEqual(["bosses"])
  })

  it("still consumes a legacy key that lives in the record's own storage", () => {
    // The guard is about crossing tiers, not about never cleaning up.
    const storage = new TestStorage()
    storage.setItem("old-view-mode", "list")
    const record = defineMemoryRecord({
      ...preference,
      id: "same-tier-cleanup",
      legacyKeys: ["old-view-mode"],
      migrateLegacy: (raw: string) => raw,
    })
    const client = new MemoryClient({ deviceStorage: storage })

    expect(client.read(record)).toBe("list")
    expect(storage.getItem("old-view-mode")).toBeNull()
  })

  it("migrates the previous versioned canonical key in place", () => {
    const storage = new TestStorage()
    storage.setItem(
      "arkive.memory.v1.0.0.test-game.catalog.view-mode",
      JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 10, value: "list" }),
    )
    const client = new MemoryClient({ deviceStorage: storage })

    expect(client.read(preference)).toBe("list")
    expect(storage.getItem("arkive.memory.v1.0.0.test-game.catalog.view-mode")).toBeNull()
    expect(storage.getItem(getMemoryKey(preference))).not.toBeNull()
  })

  it("finds an older versioned key after the record schema changes", () => {
    const storage = new TestStorage()
    storage.setItem(
      "arkive.memory.v1.0.0.test-game.catalog.schema-move",
      JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 10, value: "list" }),
    )
    const record = defineMemoryRecord({
      ...preference,
      id: "schema-move",
      schemaVersion: "2.0.0",
      migrate: (value: unknown) => value,
    })
    const client = new MemoryClient({ deviceStorage: storage })

    expect(client.read(record)).toBe("list")
    expect(storage.getItem("arkive.memory.v1.0.0.test-game.catalog.schema-move")).toBeNull()
    expect(storage.getItem(getMemoryKey(record))).not.toBeNull()
  })

  it("invalidates records when their data version changes", () => {
    const storage = new TestStorage()
    const oldRecord = defineMemoryRecord({ ...preference, id: "data-bound", dataVersion: "data-1" })
    const nextRecord = defineMemoryRecord({ ...oldRecord, dataVersion: "data-2" })
    const client = new MemoryClient({ deviceStorage: storage })

    expect(client.write(oldRecord, "list")).toBe(true)
    expect(client.read(nextRecord)).toBe("grid")
    expect(storage.getItem(getMemoryKey(nextRecord))).toBeNull()
  })

  it("degrades safely when storage access throws", () => {
    const unavailable: StorageLike = {
      getItem: () => { throw new DOMException("blocked") },
      setItem: () => { throw new DOMException("blocked") },
      removeItem: () => { throw new DOMException("blocked") },
    }
    const client = new MemoryClient({ deviceStorage: unavailable })

    expect(client.read(preference)).toBe("grid")
    expect(client.write(preference, "list")).toBe(false)
    expect(() => client.clear(preference)).not.toThrow()
  })

  it("notifies same-tab and compatible cross-tab subscribers", () => {
    const storage = new TestStorage()
    let storageListener: ((key: string | null) => void) | undefined
    const client = new MemoryClient({
      deviceStorage: storage,
      addStorageListener(listener) {
        storageListener = listener
        return () => { storageListener = undefined }
      },
    })
    const listener = vi.fn()
    const unsubscribe = client.subscribe(preference, {}, listener)

    client.write(preference, "list")
    storageListener?.(getMemoryKey(preference))
    storageListener?.("unrelated")
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it("clears only the active account partition on logout", () => {
    const storage = new TestStorage()
    const session = new TestStorage()
    const accountRecord = defineMemoryRecord({
      ...preference, partition: { account: true }, signInAdoption: "keep_anonymous",
    })
    const accountSessionRecord = defineMemoryRecord({
      ...preference,
      id: "account-session",
      ...memoryPolicy.sessionContext("clear-account-session"),
      partition: { account: true },
      signInAdoption: "keep_anonymous",
    })
    const client = new MemoryClient({ deviceStorage: storage, sessionStorage: session })
    client.write(accountRecord, "list", { accountId: "user-a" })
    client.write(accountRecord, "list", { accountId: "user-b" })
    client.write(accountSessionRecord, "list", { accountId: "user-a" })

    client.clearAccount("user-a")

    expect(client.read(accountRecord, { accountId: "user-a" })).toBe("grid")
    expect(client.read(accountRecord, { accountId: "user-b" })).toBe("list")
    expect(client.read(accountSessionRecord, { accountId: "user-a" })).toBe("grid")
  })

  it("keeps durable progress when an account is cleared", () => {
    // The sign-out path calls clearAccount on every change of signed-in id. It
    // used to delete every key carrying the account segment regardless of class,
    // and because a successful migration also removes the legacy key, signing out
    // destroyed the only copy of the user's bookmarks, follows and posts.
    const storage = new TestStorage()
    const progress = defineMemoryRecord({
      id: "progress", namespace: "site", surface: "user-system",
      ...memoryPolicy.durableProgress("clear-account-progress"),
      schemaVersion: "1.0.0",
      defaultValue: () => [] as string[],
      validate: (value: unknown): value is string[] => Array.isArray(value),
      partition: { account: true },
      signInAdoption: "keep_anonymous",
    })
    const client = new MemoryClient({ deviceStorage: storage })
    client.write(progress, ["post-1", "post-2"], { accountId: "user-42" })

    client.clearAccount("user-42")

    expect(client.read(progress, { accountId: "user-42" })).toEqual(["post-1", "post-2"])
    expect(storage.getItem(getMemoryKey(progress, { accountId: "user-42" }))).not.toBeNull()
  })

  it("clearing a record also drops its legacy keys, so it cannot resurrect", () => {
    // Removing only the canonical key left the legacy one, and the next read
    // migrated it straight back -- so "clear my progress" appeared to do nothing
    // after one page load.
    const storage = new TestStorage()
    storage.setItem("legacy-progress", JSON.stringify(["a", "b"]))
    const record = defineMemoryRecord({
      id: "resurrect", namespace: "test-game", surface: "map",
      ...memoryPolicy.durableProgress("clear-map-progress"),
      schemaVersion: "1.0.0",
      defaultValue: () => [] as string[],
      validate: (value: unknown): value is string[] => Array.isArray(value),
      legacyKeys: ["legacy-progress"],
      migrateLegacy: (raw: string) => JSON.parse(raw) as string[],
    })
    const client = new MemoryClient({ deviceStorage: storage })
    expect(client.read(record)).toEqual(["a", "b"])

    client.clear(record)

    expect(client.read(record)).toEqual([])
    expect(storage.getItem("legacy-progress")).toBeNull()
  })

  it("does not clear an account whose id merely starts with the cleared one", () => {
    // `encodeURIComponent` leaves `.` unescaped, so a legacy key for account "a.b"
    // ends in `.account.a.b`. Treating any dot as a segment boundary made clearing
    // account "a" delete it too. Dotted ids are realistic -- email-like, or from an
    // external provider.
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage })
    const legacy = (accountId: string) =>
      `arkive.memory.site.user-system.settings.account.${accountId}`
    const envelope = JSON.stringify({
      schemaVersion: "1.0.0", stateClass: "user_preference", writtenAt: 1, value: "keep",
    })
    storage.setItem(legacy("a"), envelope)
    storage.setItem(legacy("a.b"), envelope)

    client.clearAccount("a")

    expect(storage.getItem(legacy("a"))).toBeNull()
    expect(storage.getItem(legacy("a.b"))).not.toBeNull()
  })

  it("clears only the named account, not one whose id it prefixes", () => {
    const storage = new TestStorage()
    const accountRecord = defineMemoryRecord({
      ...preference, partition: { account: true }, signInAdoption: "keep_anonymous",
    })
    const client = new MemoryClient({ deviceStorage: storage })
    client.write(accountRecord, "list", { accountId: "1" })
    client.write(accountRecord, "list", { accountId: "10" })

    client.clearAccount("1")

    expect(client.read(accountRecord, { accountId: "1" })).toBe("grid")
    expect(client.read(accountRecord, { accountId: "10" })).toBe("list")
  })

  it("migrates a legacy value that exceeds the record's byte cap", () => {
    // Skipping an oversized legacy value abandoned the user's existing progress
    // unread and orphaned the old key -- aion2's World_L_A list is 126,454 bytes
    // in the pre-migration format.
    const storage = new TestStorage()
    const ids = Array.from({ length: 4_000 }, (_, index) => `marker-${index}-aaaaaaaaaaaaaaaa`)
    storage.setItem("legacy-progress", JSON.stringify(ids))
    expect(JSON.stringify(ids).length).toBeGreaterThan(100_000)
    const progress = defineMemoryRecord({
      id: "legacy-sized", namespace: "test-game", surface: "map",
      ...memoryPolicy.durableProgress("clear-map-progress"),
      schemaVersion: "1.0.0",
      defaultValue: () => [] as string[],
      validate: (value: unknown): value is string[] => Array.isArray(value),
      legacyKeys: ["legacy-progress"],
      migrateLegacy: (raw: string) => JSON.parse(raw) as string[],
    })

    expect(new MemoryClient({ deviceStorage: storage }).read(progress)).toHaveLength(4_000)
  })

  it("enforces the namespace budget without evicting an earlier record", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage })
    const largeValue = "x".repeat(1_600_000)
    const largeRecord = (id: string) => defineMemoryRecord({
      id,
      namespace: "budget-test",
      surface: "drafts",
      ...memoryPolicy.taskDraft("clear-large-draft"),
      schemaVersion: "1.0.0",
      defaultValue: () => "",
      validate: (value: unknown): value is string => typeof value === "string",
      maximumBytes: 2_000_000,
    })

    expect(client.write(largeRecord("first"), largeValue)).toBe(true)
    expect(client.write(largeRecord("second"), largeValue)).toBe(false)
    expect(client.read(largeRecord("first"))).toBe(largeValue)
  })

  it("measures record limits using serialized UTF-8 bytes", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage })
    const record = defineMemoryRecord({
      ...preference,
      id: "utf8-limit",
      defaultValue: () => "",
      validate: (value: unknown): value is string => typeof value === "string",
      maximumBytes: 150,
    })

    expect(client.write(record, "a".repeat(20))).toBe(true)
    expect(client.write(record, "界".repeat(20))).toBe(false)
  })

  it("clears typed legacy keys by state class and namespace", () => {
    const storage = new TestStorage()
    const client = new MemoryClient({ deviceStorage: storage })
    const draft = defineMemoryRecord({
      id: "legacy-draft", namespace: "clear-test", surface: "editor",
      ...memoryPolicy.taskDraft("discard-draft"),
      schemaVersion: "2.0.0", defaultValue: () => "", migrate: (value) => value,
      validate: (value: unknown): value is string => typeof value === "string",
    })
    storage.setItem(
      "arkive.memory.v1.0.0.clear-test.editor.legacy-draft",
      JSON.stringify({ schemaVersion: "1.0.0", writtenAt: 10, expiresAt: Date.now() + 1_000, value: "draft" }),
    )
    storage.setItem("arkive.memory.v1.0.0.other.editor.legacy-draft", "{}")

    client.clearStateClass("task_draft", "clear-test")

    expect(storage.getItem("arkive.memory.v1.0.0.clear-test.editor.legacy-draft")).toBeNull()
    expect(storage.getItem("arkive.memory.v1.0.0.other.editor.legacy-draft")).not.toBeNull()
    expect(draft.stateClass).toBe("task_draft")
  })

  it("requires expiry for time-limited state classes", () => {
    expect(() => defineMemoryRecord({
      ...preference,
      id: "invalid-session",
      stateClass: "session_context",
    })).toThrow("must declare expiring retention")
  })

  it("rejects transient UI as a persisted record", () => {
    expect(() => defineMemoryRecord({
      ...preference,
      stateClass: "transient_ui",
    })).toThrow("transient_ui")
  })
})
