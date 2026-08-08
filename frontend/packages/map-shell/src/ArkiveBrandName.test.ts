import { describe, expect, it } from "vitest"
import {
  ARKIVE_BRAND_NAME_EN,
  ARKIVE_BRAND_NAME_ZH_CN,
  ARKIVE_BRAND_NAME_ZH_TW,
  getArkiveBrandName,
} from "./ArkiveBrandName"

describe("getArkiveBrandName", () => {
  it("uses the domain wordmark for English", () => {
    expect(getArkiveBrandName("en-US", "Legacy label")).toBe(ARKIVE_BRAND_NAME_EN)
    expect(getArkiveBrandName("en_GB", "Legacy label")).toBe(ARKIVE_BRAND_NAME_EN)
  })

  it("uses the localized Chinese wordmarks", () => {
    expect(getArkiveBrandName("zh-CN")).toBe(ARKIVE_BRAND_NAME_ZH_CN)
    expect(getArkiveBrandName("zh-Hant")).toBe(ARKIVE_BRAND_NAME_ZH_TW)
  })

  it("keeps the app-provided label for other locales", () => {
    expect(getArkiveBrandName("ko-KR", "Arkive 게임 가이드")).toBe("Arkive 게임 가이드")
  })
})
