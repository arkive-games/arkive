import { describe, expect, it } from "vitest"
import { z } from "zod"
import { MemoryClient, getMemoryKey, type StorageLike } from "./core"
import { memoryFor, sharedMemory } from "./define"

class TestStorage implements StorageLike {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function client() {
  const deviceStorage = new TestStorage()
  const sessionStorage = new TestStorage()
  const sharedStorage = new TestStorage()
  return {
    deviceStorage, sessionStorage, sharedStorage,
    memory: new MemoryClient({ deviceStorage, sessionStorage, sharedStorage }),
  }
}

describe("memoryFor", () => {
  it("binds the namespace, so an app cannot write outside its own space", () => {
    const { memory, deviceStorage } = client()
    const mem = memoryFor("palworld", memory)
    const viewMode = mem.preference("catalog/view-mode", {
      schema: z.enum(["grid", "list"]),
      default: "grid" as "grid" | "list",
    })
    viewMode.write("list")
    const [key] = [...deviceStorage.values.keys()]
    expect(key).toContain(".palworld.catalog.view-mode")
    expect(key).not.toContain(".site.")
  })

  it("keeps the stored key format byte-identical to defineMemoryRecord", () => {
    // This layer is typing and ergonomics only. If the key moved, every reader's
    // stored value would be orphaned.
    const { memory } = client()
    const handle = memoryFor("palworld", memory).preference("catalog/view-mode", {
      schema: z.string(), default: "grid",
    })
    expect(getMemoryKey(handle.record)).toBe("arkive.memory.palworld.catalog.view-mode")
  })

  it("gives each dimension value its own key", () => {
    // The V Blood bug: four lists shared one record because none of them declared
    // a dimension, and `write` notifies every subscriber of the same key.
    const { memory } = client()
    const expanded = memoryFor("vrising", memory).session("vblood-detail/reward-lists-expanded", {
      schema: z.boolean(), default: false, keyedBy: { section: true },
    })
    expanded.at({ section: "abilities" }).write(true)
    expect(expanded.at({ section: "abilities" }).read()).toBe(true)
    expect(expanded.at({ section: "recipes" }).read()).toBe(false)
    expect(expanded.at({ section: "buildings" }).read()).toBe(false)
  })

  it("partitions by account and by map independently", () => {
    const { memory } = client()
    const completed = memoryFor("palworld", memory).progress("map/completed", {
      schema: z.array(z.string()), default: () => [] as string[],
      keyedBy: { map: true },
    })
    completed.at({ map: "MainWorld" }).write(["a"])
    completed.at({ map: "Sakurajima" }).write(["b", "c"])
    expect(completed.at({ map: "MainWorld" }).read()).toEqual(["a"])
    expect(completed.at({ map: "Sakurajima" }).read()).toEqual(["b", "c"])
  })

  it("reads an unkeyed record without .at({})", () => {
    const { memory } = client()
    const labels = memoryFor("aion2", memory).preference("map/show-labels", {
      schema: z.boolean(), default: false,
    })
    expect(labels.read()).toBe(false)
    labels.write(true)
    expect(labels.read()).toBe(true)
  })

  it("refuses more than one free dimension, rather than merging them", () => {
    const { memory } = client()
    expect(() => memoryFor("palworld", memory).session("catalog/page", {
      schema: z.number(), default: 1, keyedBy: { map: true, tab: true },
    })).toThrow(/at most one free dimension/)
  })

  it("rejects a path that is not <surface>/<id>", () => {
    const { memory } = client()
    const mem = memoryFor("palworld", memory)
    expect(() => mem.preference("catalog", { schema: z.string(), default: "" }))
      .toThrow(/must be "<surface>\/<id>"/)
  })

  it("validates through the schema, falling back to the default", () => {
    const { memory, deviceStorage } = client()
    const level = memoryFor("palworld", memory).draft("simulator/level", {
      schema: z.number().int().min(1).max(60), default: 60,
    })
    level.write(35)
    expect(level.read()).toBe(35)
    // A value that no longer satisfies the schema reads as the default...
    const key = getMemoryKey(level.record)
    deviceStorage.setItem(key, JSON.stringify({
      schemaVersion: "1.0.0", stateClass: "task_draft", writtenAt: 1,
      expiresAt: Date.now() + 1_000_000, value: 999,
    }))
    expect(level.read()).toBe(60)
    // ...and is NOT deleted by the read.
    expect(deviceStorage.getItem(key)).not.toBeNull()
  })

  it("refuses a definition with neither schema nor guard", () => {
    const { memory } = client()
    // @ts-expect-error -- exercising the runtime guard for JS callers
    expect(() => memoryFor("palworld", memory).preference("a/b", { default: 1 }))
      .toThrow(/supply a schema or a validate guard/)
  })

  it("supports legacy keys that depend on the dimension values", () => {
    const { memory, deviceStorage } = client()
    deviceStorage.setItem("palworld.map.completed.MainWorld", JSON.stringify(["old-a"]))
    const completed = memoryFor("palworld", memory).progress("map/completed-markers", {
      schema: z.array(z.string()), default: () => [] as string[],
      keyedBy: { map: true },
      legacyKeys: (dimensions) => [`palworld.map.completed.${dimensions.map}`],
      migrateLegacy: (raw) => JSON.parse(raw) as string[],
    })
    expect(completed.at({ map: "MainWorld" }).read()).toEqual(["old-a"])
    expect(completed.at({ map: "Sakurajima" }).read()).toEqual([])
  })
})

describe("sharedMemory", () => {
  it("stores in the cross-origin transport, not this origin's device storage", () => {
    const { memory, sharedStorage, deviceStorage } = client()
    const consent = sharedMemory("interface/analytics-consent", {
      schema: z.boolean(), default: false,
    }, memory)
    consent.write(true)
    expect(sharedStorage.length).toBe(1)
    expect(deviceStorage.length).toBe(0)
    expect(consent.read()).toBe(true)
  })

  it("is capped at the cookie budget", () => {
    const { memory } = client()
    expect(() => sharedMemory("interface/too-big", {
      schema: z.string(), default: "", maximumBytes: 10_000,
    }, memory)).toThrow(/cap maximumBytes at 3000/)
  })
})
