import { describe, expect, it } from "vitest"
import { placeMarkerDetailRight } from "./markerDetailPlacement"

const boundary = { left: 0, top: 0, right: 1000, bottom: 700 }
const size = { width: 352, height: 360 }

describe("placeMarkerDetailRight", () => {
  it("always places the surface to the marker's right", () => {
    const result = placeMarkerDetailRight({ anchor: { x: 500, y: 350 }, size, boundary })
    expect(result.x).toBe(30)
    expect(result.panX).toBe(0)
  })

  it("requests horizontal map movement instead of changing sides", () => {
    const result = placeMarkerDetailRight({ anchor: { x: 800, y: 350 }, size, boundary })
    expect(result.x).toBe(30)
    expect(result.panX).toBe(194)
  })

  it("keeps the surface below an overlapping search bar", () => {
    const result = placeMarkerDetailRight({
      anchor: { x: 500, y: 160 },
      size,
      boundary,
      obstacles: [{ left: 300, top: 12, right: 900, bottom: 72 }],
    })
    expect(result.y + 160).toBe(84)
  })

  it("keeps the surface above an overlapping bottom control", () => {
    const result = placeMarkerDetailRight({
      anchor: { x: 500, y: 520 },
      size,
      boundary,
      obstacles: [{ left: 700, top: 600, right: 900, bottom: 690 }],
    })
    expect(result.y + 520).toBe(228)
  })

  it("clamps vertically and keeps the pointer aligned to the marker", () => {
    const result = placeMarkerDetailRight({ anchor: { x: 500, y: 680 }, size, boundary })
    expect(result.y + 680).toBe(328)
    expect(result.arrowY).toBe(340)
  })
})
