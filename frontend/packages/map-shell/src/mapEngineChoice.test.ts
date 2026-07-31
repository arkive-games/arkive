// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_MAP_ENGINE,
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  createMapEngineStore,
  isMapEngineChoice,
  resolveMapEngine,
  type MapEngineStorage,
} from "./mapEngineChoice"

/**
 * In-memory storage standing in for the app's adapter — the shell itself never
 * touches browser storage, so every test here injects one of these instead.
 */
function memoryStorage(initial: string | null = null): MapEngineStorage & { raw: () => string | null } {
  let value = initial
  return {
    read: () => value,
    write: (next) => { value = next },
    raw: () => value,
  }
}

/** An adapter that fails both ways, as private mode / disabled storage does. */
function throwingStorage(): MapEngineStorage {
  return {
    read: () => { throw new Error("storage denied") },
    write: () => { throw new Error("storage denied") },
  }
}

describe("isMapEngineChoice", () => {
  it("accepts only the two engine ids", () => {
    expect(isMapEngineChoice("gl")).toBe(true)
    expect(isMapEngineChoice("leaflet")).toBe(true)
    expect(isMapEngineChoice("GL")).toBe(false)
    expect(isMapEngineChoice("canvas")).toBe(false)
    expect(isMapEngineChoice(null)).toBe(false)
    expect(isMapEngineChoice(undefined)).toBe(false)
    expect(isMapEngineChoice(1)).toBe(false)
  })
})

describe("resolveMapEngine", () => {
  it("lets a valid param win over the stored choice", () => {
    expect(resolveMapEngine("leaflet", "gl")).toBe("leaflet")
    expect(resolveMapEngine("gl", "leaflet")).toBe("gl")
  })

  it("falls back to the stored choice for a missing or bogus param", () => {
    expect(resolveMapEngine(undefined, "leaflet")).toBe("leaflet")
    expect(resolveMapEngine(null, "gl")).toBe("gl")
    expect(resolveMapEngine("nonsense", "leaflet")).toBe("leaflet")
    expect(resolveMapEngine(7, "gl")).toBe("gl")
  })
})

describe("labels and order", () => {
  it("defaults to the WebGL engine", () => {
    expect(DEFAULT_MAP_ENGINE).toBe("gl")
  })

  it("lists GL first and keeps a short label for every choice", () => {
    expect([...MAP_ENGINE_CHOICES]).toEqual(["gl", "leaflet"])
    for (const choice of MAP_ENGINE_CHOICES) {
      expect(MAP_ENGINE_LABELS[choice].full.length).toBeGreaterThan(0)
      expect(MAP_ENGINE_LABELS[choice].short.length).toBeGreaterThan(0)
      // The mobile row is tight: the short form must never be the longer one.
      expect(MAP_ENGINE_LABELS[choice].short.length)
        .toBeLessThanOrEqual(MAP_ENGINE_LABELS[choice].full.length)
    }
  })
})

describe("createMapEngineStore", () => {
  it("defaults to GL when nothing is stored", () => {
    const store = createMapEngineStore(memoryStorage())
    expect(store.getSnapshot()).toBe("gl")
  })

  it("reads a stored choice", () => {
    const store = createMapEngineStore(memoryStorage("leaflet"))
    expect(store.getSnapshot()).toBe("leaflet")
  })

  it("falls back to the default on a corrupt stored value", () => {
    const store = createMapEngineStore(memoryStorage("webgpu"))
    expect(store.getSnapshot()).toBe("gl")
  })

  it("reads through the adapter lazily, on the first snapshot only", () => {
    const storage = memoryStorage("leaflet")
    const read = vi.spyOn(storage, "read")
    const store = createMapEngineStore(storage)
    expect(read).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toBe("leaflet")
    expect(read).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe("leaflet")
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("persists a set and notifies subscribers", () => {
    const storage = memoryStorage()
    const store = createMapEngineStore(storage)
    const seen: string[] = []
    store.subscribe(() => seen.push(store.getSnapshot()))
    store.set("leaflet")
    expect(store.getSnapshot()).toBe("leaflet")
    expect(storage.raw()).toBe("leaflet")
    expect(seen).toEqual(["leaflet"])
  })

  it("notifies every subscriber", () => {
    const store = createMapEngineStore(memoryStorage())
    const a = vi.fn()
    const b = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    store.set("leaflet")
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("drops a redundant set (same value) without notifying", () => {
    const storage = memoryStorage()
    const store = createMapEngineStore(storage)
    const fn = vi.fn()
    store.subscribe(fn)
    // Same as the default, so nothing changes — not even a storage write.
    store.set("gl")
    expect(fn).not.toHaveBeenCalled()
    expect(storage.raw()).toBeNull()

    store.set("leaflet")
    expect(fn).toHaveBeenCalledTimes(1)
    store.set("leaflet")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("stops notifying after unsubscribe", () => {
    const store = createMapEngineStore(memoryStorage())
    const fn = vi.fn()
    const unsubscribe = store.subscribe(fn)
    store.set("leaflet")
    expect(fn).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set("gl")
    expect(fn).toHaveBeenCalledTimes(1)
    // The store itself still moved — only the listener went away.
    expect(store.getSnapshot()).toBe("gl")
  })

  it("keeps the in-memory snapshot moving when the adapter throws", () => {
    const store = createMapEngineStore(throwingStorage())
    // A throwing read still yields the default rather than blowing up.
    expect(store.getSnapshot()).toBe("gl")
    const fn = vi.fn()
    store.subscribe(fn)
    expect(() => store.set("leaflet")).not.toThrow()
    // The UI must stay consistent even though nothing was persisted.
    expect(store.getSnapshot()).toBe("leaflet")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("returns a snapshot stable enough for useSyncExternalStore", () => {
    const store = createMapEngineStore(memoryStorage("leaflet"))
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it("keeps two stores independent", () => {
    const a = createMapEngineStore(memoryStorage())
    const b = createMapEngineStore(memoryStorage("leaflet"))
    a.set("leaflet")
    b.set("gl")
    expect(a.getSnapshot()).toBe("leaflet")
    expect(b.getSnapshot()).toBe("gl")
  })
})

describe("useStoredMapEngine", () => {
  it("exposes the stored choice and re-renders on a set", () => {
    const store = createMapEngineStore(memoryStorage())
    const { result } = renderHook(() => store.useStoredMapEngine())
    expect(result.current).toBe("gl")
    act(() => { store.set("leaflet") })
    expect(result.current).toBe("leaflet")
  })
})
