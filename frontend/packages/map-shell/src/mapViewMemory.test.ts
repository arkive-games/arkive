// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  readMapView,
  writeMapView,
  useMapViewMemory,
  type MapViewStore,
} from "./mapViewMemory"

/** In-memory store standing in for the app's storage adapter. */
function memoryStore(initial: string | null = null): MapViewStore & { raw: () => string | null } {
  let value = initial
  return {
    get: () => value,
    set: (raw) => { value = raw },
    raw: () => value,
  }
}

describe("readMapView / writeMapView", () => {
  it("returns nulls when nothing is stored", () => {
    expect(readMapView(memoryStore(), "MainWorld")).toEqual({ view: null, marker: null })
  })

  it("round-trips a view and a marker", () => {
    const store = memoryStore()
    writeMapView(store, "MainWorld", { x: 100, y: -250.5, zoom: -1.25 })
    writeMapView(store, "MainWorld", { marker: "m-1" })
    expect(readMapView(store, "MainWorld")).toEqual({
      view: { x: 100, y: -250.5, zoom: -1.25 },
      marker: "m-1",
    })
  })

  it("saving the view preserves the marker, and vice versa", () => {
    const store = memoryStore()
    writeMapView(store, "m", { marker: "keep-me" })
    writeMapView(store, "m", { x: 1, y: 2, zoom: 0 })
    expect(readMapView(store, "m").marker).toBe("keep-me")
    writeMapView(store, "m", { marker: null })
    expect(readMapView(store, "m")).toEqual({ view: { x: 1, y: 2, zoom: 0 }, marker: null })
  })

  it("keeps per-map entries independent", () => {
    const store = memoryStore()
    writeMapView(store, "a", { x: 1, y: 1, zoom: 1 })
    writeMapView(store, "b", { x: 2, y: 2, zoom: 2, marker: "mb" })
    expect(readMapView(store, "a")).toEqual({ view: { x: 1, y: 1, zoom: 1 }, marker: null })
    expect(readMapView(store, "b")).toEqual({ view: { x: 2, y: 2, zoom: 2 }, marker: "mb" })
  })

  it("tolerates corrupt JSON and recovers on the next write", () => {
    const store = memoryStore("{not json")
    expect(readMapView(store, "m")).toEqual({ view: null, marker: null })
    writeMapView(store, "m", { x: 3, y: 4, zoom: -3 })
    expect(readMapView(store, "m").view).toEqual({ x: 3, y: 4, zoom: -3 })
  })

  it("tolerates non-object / wrong-shaped payloads", () => {
    expect(readMapView(memoryStore('["array"]'), "m")).toEqual({ view: null, marker: null })
    expect(readMapView(memoryStore('{"m": "oops"}'), "m")).toEqual({ view: null, marker: null })
    expect(readMapView(memoryStore("null"), "m")).toEqual({ view: null, marker: null })
  })

  it("rejects a view with missing or non-finite numbers but still reads the marker", () => {
    const store = memoryStore(JSON.stringify({
      m: { x: 1, y: "nope", zoom: 0, marker: "still-here" },
    }))
    expect(readMapView(store, "m")).toEqual({ view: null, marker: "still-here" })
    const infinite = memoryStore(JSON.stringify({ m: { x: 1, y: 2, zoom: null } }))
    expect(readMapView(infinite, "m").view).toBeNull()
  })

  it("rejects a non-string marker", () => {
    const store = memoryStore(JSON.stringify({ m: { x: 1, y: 2, zoom: 0, marker: 42 } }))
    expect(readMapView(store, "m")).toEqual({ view: { x: 1, y: 2, zoom: 0 }, marker: null })
  })

  it("swallows adapter errors on read and write", () => {
    const throwing: MapViewStore = {
      get: () => { throw new Error("denied") },
      set: () => { throw new Error("denied") },
    }
    expect(readMapView(throwing, "m")).toEqual({ view: null, marker: null })
    expect(() => writeMapView(throwing, "m", { x: 1, y: 2, zoom: 0 })).not.toThrow()
  })
})

describe("useMapViewMemory", () => {
  it("exposes the stored view and marker for the current map", () => {
    const store = memoryStore(JSON.stringify({
      MainWorld: { x: 10, y: 20, zoom: -2, marker: "mk" },
    }))
    const { result } = renderHook(() => useMapViewMemory(store, "MainWorld"))
    expect(result.current.initialView).toEqual({ x: 10, y: 20, zoom: -2 })
    expect(result.current.initialMarkerId).toBe("mk")
  })

  it("saveView and saveMarker persist through the store", () => {
    const store = memoryStore()
    const { result } = renderHook(() => useMapViewMemory(store, "m"))
    act(() => {
      result.current.saveView({ x: 5, y: 6, zoom: 1.5 })
      result.current.saveMarker("sel")
    })
    expect(readMapView(store, "m")).toEqual({ view: { x: 5, y: 6, zoom: 1.5 }, marker: "sel" })
  })

  it("re-reads when the map changes", () => {
    const store = memoryStore(JSON.stringify({
      a: { x: 1, y: 1, zoom: 0, marker: "ma" },
      b: { x: 2, y: 2, zoom: 1 },
    }))
    const { result, rerender } = renderHook(
      ({ mapId }: { mapId: string }) => useMapViewMemory(store, mapId),
      { initialProps: { mapId: "a" } },
    )
    expect(result.current.initialMarkerId).toBe("ma")
    rerender({ mapId: "b" })
    expect(result.current.initialView).toEqual({ x: 2, y: 2, zoom: 1 })
    expect(result.current.initialMarkerId).toBeNull()
  })
})
