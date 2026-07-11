import { describe, expect, it } from "vitest"

import { searchTokenize } from "./searchTokenizer"

describe("searchTokenize", () => {
  it("splits letter runs from digit runs", () => {
    expect(searchTokenize("No.111B")).toEqual(["No", "111", "B"])
  })

  it("strips leading zeros from numeric tokens", () => {
    expect(searchTokenize("No.011")).toEqual(["No", "11"])
  })

  it("tokenizes CJK per character", () => {
    expect(searchTokenize("云海鹿")).toEqual(["云", "海", "鹿"])
  })

  it("mixes scripts", () => {
    expect(searchTokenize("Lv.3 拉普蕾西亚")).toEqual(["Lv", "3", "拉", "普", "蕾", "西", "亚"])
  })

  it("returns empty for symbol-only input", () => {
    expect(searchTokenize("--- ()")).toEqual([])
  })
})
