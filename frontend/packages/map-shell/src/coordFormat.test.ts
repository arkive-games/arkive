import { describe, it, expect } from "vitest"

import { formatCoords } from "./coordFormat"

describe("formatCoords", () => {
  it("renders the (X, Y, Z) triple with an axis-labeled aria when height is present", () => {
    expect(formatCoords(123.4, 456.6, 7.2)).toEqual({
      text: "(123, 457, 7)",
      aria: "X: 123, Y: 457, Z: 7",
    })
  })

  it("drops Z from both text and aria when no height is supplied", () => {
    expect(formatCoords(10, 20)).toEqual({
      text: "(10, 20)",
      aria: "X: 10, Y: 20",
    })
  })

  it("keeps a zero height (Z is not treated as absent)", () => {
    expect(formatCoords(1, 2, 0)).toEqual({
      text: "(1, 2, 0)",
      aria: "X: 1, Y: 2, Z: 0",
    })
  })
})
