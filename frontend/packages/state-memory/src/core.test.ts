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
    storage.setItem(key, "x".repeat(100_001))
    expect(client.read(preference)).toBe("grid")
    expect(storage.getItem(key)).toBeNull()
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

  it("moves a reclassified session record out of device storage", () => {
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
    expect(device.getItem("old-filter")).toBeNull()
    expect(session.getItem(getMemoryKey(record))).not.toBeNull()
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
