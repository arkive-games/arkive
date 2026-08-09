import { describe, expect, it } from "vitest"
import { canUseLodTiers } from "./markerLod"

describe("canUseLodTiers", () => {
  it("refuses a set that assigns no tiers at all", () => {
    // V Rising's Vardoran: 372 markers, none tiered. Culling would hide every one.
    expect(canUseLodTiers([{}, {}, {}])).toBe(false)
    expect(canUseLodTiers([{ tier: null }, { tier: undefined }])).toBe(false)
  })

  it("refuses a set whose lowest tier is above 1", () => {
    // aion2's Abyss_Battlefield_A: all 121 markers are tier 2, and only tier 1 is
    // drawn at the mount zoom, so the map would open blank.
    expect(canUseLodTiers([{ tier: 2 }, { tier: 3 }])).toBe(false)
  })

  it("allows a set with at least one tier-1 marker", () => {
    expect(canUseLodTiers([{ tier: 1 }])).toBe(true)
    expect(canUseLodTiers([{ tier: 3 }, { tier: 1 }, {}])).toBe(true)
  })

  it("refuses an empty set rather than culling nothing into nothing", () => {
    expect(canUseLodTiers([])).toBe(false)
  })
})
