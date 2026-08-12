import { describe, expect, it } from "vitest"
import { deriveEyeState, syncExpanded } from "./filter-logic"

describe("deriveEyeState", () => {
  it("returns none for an empty subtype list", () => {
    expect(deriveEyeState([])).toBe("none")
  })
  it("returns none when no subtype is active", () => {
    expect(deriveEyeState([{ active: false }, { active: false }])).toBe("none")
  })
  it("returns some when only part is active", () => {
    expect(deriveEyeState([{ active: true }, { active: false }])).toBe("some")
  })
  it("returns all when every subtype is active", () => {
    expect(deriveEyeState([{ active: true }, { active: true }])).toBe("all")
  })
})

describe("syncExpanded", () => {
  it("appends category ids not yet known", () => {
    expect(syncExpanded([], ["a", "b"])).toEqual(["a", "b"])
    expect(syncExpanded(["a"], ["a", "b", "c"], new Set(["a"]))).toEqual(["a", "b", "c"])
  })
  it("returns the same array reference when nothing changed", () => {
    const prev = ["a", "b"]
    expect(syncExpanded(prev, ["a", "b"])).toBe(prev)
    expect(syncExpanded(prev, ["a"])).toBe(prev)
  })
  it("preserves a user-collapsed category after it has been seen", () => {
    expect(syncExpanded(["b"], ["a", "b"], new Set(["a", "b"]))).toEqual(["b"])
  })
  it("does not auto-expand categories listed as collapsed-by-default", () => {
    const collapsed = new Set(["pal"])
    expect(syncExpanded([], ["location", "pal"], new Set(), collapsed)).toEqual(["location"])
    // A user-expanded collapsed-by-default category is preserved once known.
    expect(syncExpanded(["pal"], ["location", "pal"], new Set(["pal"]), collapsed)).toEqual(["pal", "location"])
    // Nothing to add → same reference (no needless re-render).
    expect(syncExpanded(["location"], ["location", "pal"], new Set(["location", "pal"]), collapsed)).toEqual(["location"])
  })
})
