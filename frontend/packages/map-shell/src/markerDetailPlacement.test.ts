import { describe, expect, it } from "vitest"
import { placeMarkerDetailAbove } from "./markerDetailPlacement"

const boundary = { left: 0, top: 0, right: 1000, bottom: 700 }
const size = { width: 352, height: 360 }

describe("placeMarkerDetailAbove", () => {
  it("always places the surface above and centered on the marker", () => {
    const result = placeMarkerDetailAbove({ anchor: { x: 500, y: 500 }, size, boundary })
    expect(result.x).toBe(-176)
    expect(result.y).toBe(-384)
    expect(result.arrowX).toBe(176)
    expect(result.panX).toBe(0)
    expect(result.panY).toBe(0)
  })

  it("requests horizontal map movement while keeping the surface above", () => {
    const left = placeMarkerDetailAbove({ anchor: { x: 100, y: 500 }, size, boundary })
    const right = placeMarkerDetailAbove({ anchor: { x: 900, y: 500 }, size, boundary })
    expect(left.x).toBe(-176)
    expect(left.panX).toBe(-88)
    expect(right.x).toBe(-176)
    expect(right.panX).toBe(88)
  })

  it("requests downward marker movement when the top edge is too close", () => {
    const result = placeMarkerDetailAbove({ anchor: { x: 500, y: 240 }, size, boundary })
    expect(result.y).toBe(-384)
    expect(result.panY).toBe(-156)
  })

  it("keeps the surface below an overlapping search bar", () => {
    const result = placeMarkerDetailAbove({
      anchor: { x: 500, y: 400 },
      size,
      boundary,
      obstacles: [{ left: 300, top: 12, right: 900, bottom: 72 }],
    })
    expect(result.panY).toBe(-68)
  })

  it("chooses the nearest clear side of an overlapping control", () => {
    const result = placeMarkerDetailAbove({
      anchor: { x: 500, y: 620 },
      size,
      boundary,
      obstacles: [{ left: 300, top: 500, right: 700, bottom: 560 }],
    })
    expect(result.panY).toBe(108)
  })

  it("moves horizontally around a tall sidebar", () => {
    const result = placeMarkerDetailAbove({
      anchor: { x: 100, y: 500 },
      size,
      boundary,
      obstacles: [{ left: 0, top: 0, right: 300, bottom: 700 }],
    })
    expect(result.panX).toBe(-388)
    expect(result.panY).toBe(0)
  })
})
