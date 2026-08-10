// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import {
  applyArkiveDocumentLocale,
  bindArkiveDocumentLocale,
  normalizeArkiveLanguageTag,
} from "./documentLocale"

describe("document locale", () => {
  it("normalizes Arkive language aliases", () => {
    expect(normalizeArkiveLanguageTag("en")).toBe("en-US")
    expect(normalizeArkiveLanguageTag("zh_Hans")).toBe("zh-CN")
    expect(normalizeArkiveLanguageTag("zh-HK")).toBe("zh-TW")
    expect(normalizeArkiveLanguageTag("ja")).toBe("ja-JP")
    expect(normalizeArkiveLanguageTag("ko")).toBe("ko-KR")
  })

  it("preserves valid non-CJK locales", () => {
    expect(normalizeArkiveLanguageTag("pt-br")).toBe("pt-BR")
    expect(normalizeArkiveLanguageTag("not a locale")).toBe("en-US")
  })

  it("updates the document language without adding another font source", () => {
    applyArkiveDocumentLocale("ko-KR", document)

    expect(document.documentElement.lang).toBe("ko-KR")
    expect(document.querySelector("#arkive-locale-fonts")).toBeNull()
  })

  it("tracks language changes and can remove its listener", () => {
    let listener: ((language: string) => void) | undefined
    const source = {
      language: "en",
      on: vi.fn((_event: "languageChanged", next: (language: string) => void) => {
        listener = next
      }),
      off: vi.fn(),
    }

    const unbind = bindArkiveDocumentLocale(source, document)
    listener?.("ja-JP")
    expect(document.documentElement.lang).toBe("ja-JP")

    unbind()
    expect(source.off).toHaveBeenCalledWith("languageChanged", listener)
  })
})
