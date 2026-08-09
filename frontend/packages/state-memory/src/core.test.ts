import { describe, expect, it, vi } from "vitest"
import { MemoryClient, defineMemoryRecord, getMemoryKey, type StorageLike } from "./core"

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
  stateClass: "device_preference",
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
      "arkive.memory.v1.0.0.test-game.catalog.view-mode",
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
    const accountRecord = defineMemoryRecord({ ...preference, accountScoped: true })
    const client = new MemoryClient({ deviceStorage: storage })
    client.write(accountRecord, "list", { accountId: "user-a" })
    client.write(accountRecord, "list", { accountId: "user-b" })

    client.clearAccount("user-a")

    expect(client.read(accountRecord, { accountId: "user-a" })).toBe("grid")
    expect(client.read(accountRecord, { accountId: "user-b" })).toBe("list")
  })
})
