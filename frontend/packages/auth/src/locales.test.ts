import { describe, expect, it } from "vitest"

import { AUTH_LOCALES, authStringsFor } from "./locales"
import { DEFAULT_AUTH_STRINGS } from "./strings"

describe("authStringsFor", () => {
  it("returns the exact catalogue for a known tag", () => {
    expect(authStringsFor("zh-CN").signIn).toBe("登录")
    expect(authStringsFor("zh-TW").signIn).toBe("登入")
    expect(authStringsFor("en-US").signIn).toBe("Sign in")
  })

  it("routes Simplified and Traditional variants correctly", () => {
    // Apps in this workspace use several of these tags, and getting the script
    // wrong is the kind of thing a Chinese-reading user notices immediately.
    for (const tag of ["zh", "zh-Hans", "zh-SG", "zh-hans-cn"]) {
      expect(authStringsFor(tag).signIn).toBe("登录")
    }
    for (const tag of ["zh-TW", "zh-Hant", "zh-HK", "zh-hant-tw", "zh-MO"]) {
      expect(authStringsFor(tag).signIn).toBe("登入")
    }
  })

  it("matches on the base language when the region is unknown", () => {
    expect(authStringsFor("ja").signIn).toBe("ログイン")
    expect(authStringsFor("ko").signIn).toBe("로그인")
    expect(authStringsFor("en-GB").signIn).toBe("Sign in")
  })

  it("falls back to English for an untranslated locale", () => {
    // palworld carries 17 locales and sts2 15; only five are translated here.
    // Falling back is what lets the feature ship without inventing the rest.
    expect(authStringsFor("de-DE")).toEqual(DEFAULT_AUTH_STRINGS)
    expect(authStringsFor("pt-BR").signIn).toBe("Sign in")
    expect(authStringsFor(undefined)).toEqual(DEFAULT_AUTH_STRINGS)
    expect(authStringsFor("  ")).toEqual(DEFAULT_AUTH_STRINGS)
  })

  it("always returns a complete set of strings, however partial the catalogue", () => {
    // ja-JP and ko-KR are deliberately partial; every key must still resolve or
    // the UI renders "undefined" at users.
    for (const tag of [...AUTH_LOCALES, "de-DE", "zh-Hant"]) {
      const strings = authStringsFor(tag)
      for (const [key, value] of Object.entries(strings)) {
        if (key === "errors") continue
        expect(typeof value, `${tag}.${key}`).toBe("string")
        expect((value as string).length, `${tag}.${key}`).toBeGreaterThan(0)
      }
      for (const [code, message] of Object.entries(strings.errors)) {
        expect(typeof message, `${tag}.errors.${code}`).toBe("string")
        expect(message.length, `${tag}.errors.${code}`).toBeGreaterThan(0)
      }
    }
  })

  it("covers every error code the client can raise", () => {
    const codes = Object.keys(DEFAULT_AUTH_STRINGS.errors)
    for (const tag of AUTH_LOCALES) {
      expect(Object.keys(authStringsFor(tag).errors).sort()).toEqual(codes.sort())
    }
  })
})
