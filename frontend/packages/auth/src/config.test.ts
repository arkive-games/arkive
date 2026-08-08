import { describe, expect, it } from "vitest"

import { CORE_API_PREFIX, resolveAuthConfig } from "./config"

describe("resolveAuthConfig", () => {
  it("appends the core module prefix to the configured origin", () => {
    expect(resolveAuthConfig({ apiBaseUrl: "https://api.tc-imba.com" })).toEqual({
      baseUrl: `https://api.tc-imba.com${CORE_API_PREFIX}`,
      transport: "cookie",
      enabled: true,
    })
  })

  it("tolerates a trailing slash, which .env files habitually carry", () => {
    expect(resolveAuthConfig({ apiBaseUrl: "http://localhost:19000/" }).baseUrl).toBe(
      `http://localhost:19000${CORE_API_PREFIX}`,
    )
  })

  it("uses the bearer transport in a Toy build", () => {
    // The cookie is third-party inside the bilibili iframe and blocked there,
    // so a token is the only session that works.
    expect(resolveAuthConfig({ apiBaseUrl: "https://api.tc-imba.com", isToy: true }).transport).toBe(
      "bearer",
    )
  })

  it("uses the cookie transport everywhere else, giving SSO across the games", () => {
    expect(resolveAuthConfig({ apiBaseUrl: "https://api.tc-imba.com" }).transport).toBe("cookie")
  })

  it("disables auth when no API is configured", () => {
    // Every app builds today with no API URL set; a sign-in button that cannot
    // work is worse than no button.
    for (const apiBaseUrl of [undefined, null, "", "   "]) {
      const resolved = resolveAuthConfig({ apiBaseUrl })
      expect(resolved.enabled).toBe(false)
      expect(resolved.baseUrl).toBe("")
    }
  })
})
