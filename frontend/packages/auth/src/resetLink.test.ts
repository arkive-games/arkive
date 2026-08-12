// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import { consumeResetToken, readResetLink } from "./resetLink"

describe("readResetLink", () => {
  it("finds the token on the reset landing path", () => {
    expect(readResetLink("https://tc-imba.com/user?reset=abc123")).toEqual({
      token: "abc123",
      onResetPath: true,
    })
  })

  it("tolerates a trailing slash", () => {
    expect(readResetLink("https://tc-imba.com/user/?reset=abc123").onResetPath).toBe(true)
  })

  it("reports the path even with no token, so the page can still render", () => {
    expect(readResetLink("https://tc-imba.com/user")).toEqual({ token: null, onResetPath: true })
  })

  it("treats an empty token as absent", () => {
    // A truncated link should offer the "request a new one" path rather than a
    // reset form pre-filled with nothing.
    expect(readResetLink("https://tc-imba.com/user?reset=").token).toBeNull()
    expect(readResetLink("https://tc-imba.com/user?reset=%20%20").token).toBeNull()
  })

  it("ignores other pages", () => {
    expect(readResetLink("https://tc-imba.com/")).toEqual({ token: null, onResetPath: false })
    expect(readResetLink("https://palworld.tc-imba.com/pals")).toEqual({
      token: null,
      onResetPath: false,
    })
  })

  it("reads hash routing, which Toy builds use", () => {
    // Toy pages are served from a single index.html, so the path lives after '#'.
    expect(readResetLink("https://www.bilibili.com/toy/arkive/index.html#/user?reset=xyz")).toEqual({
      token: "xyz",
      onResetPath: true,
    })
  })

  it("does not confuse a query token with a hash route", () => {
    expect(readResetLink("https://tc-imba.com/#/games?reset=nope").onResetPath).toBe(false)
  })

  it("survives a malformed URL", () => {
    expect(readResetLink("not a url")).toEqual({ token: null, onResetPath: false })
    expect(readResetLink("")).toEqual({ token: null, onResetPath: false })
  })

  it("keeps a token containing URL-significant characters intact", () => {
    // Reset tokens are JWTs: dots, dashes and underscores are expected.
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig-with_chars"
    expect(readResetLink(`https://tc-imba.com/user?reset=${jwt}`).token).toBe(jwt)
  })
})

describe("consumeResetToken path gating", () => {
  // Regression: the helper used to ignore onResetPath, so a stray ?reset= on any
  // page of any app opened the reset form.
  it("ignores a token on a page that is not the reset landing", () => {
    const original = window.location.href
    try {
      window.history.replaceState({}, "", "/pals?reset=stray")
      expect(consumeResetToken()).toBeNull()
      // and leaves the URL alone, since it consumed nothing
      expect(window.location.search).toContain("reset=stray")
    } finally {
      window.history.replaceState({}, "", original)
    }
  })

  it("reads and strips a token on the reset landing", () => {
    const original = window.location.href
    try {
      window.history.replaceState({}, "", "/user?reset=abc123")
      expect(consumeResetToken()).toBe("abc123")
      // The token is a credential: it must not survive in history or Referer.
      expect(window.location.search).not.toContain("abc123")
      // and a second read finds nothing left
      expect(consumeResetToken()).toBeNull()
    } finally {
      window.history.replaceState({}, "", original)
    }
  })
})
