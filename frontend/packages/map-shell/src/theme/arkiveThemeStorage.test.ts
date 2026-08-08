import { describe, expect, it } from "vitest"
import {
  ARKIVE_THEME_STORAGE_KEY,
  createArkiveThemeStorage,
  resolveArkiveThemeCookieDomain,
  type ArkiveThemeStorageEnvironment,
} from "./arkiveThemeStorage"

function createEnvironment({
  hostname = "localhost",
  protocol = "http:",
  cookie = "",
  stored = {},
}: {
  hostname?: string
  protocol?: string
  cookie?: string
  stored?: Record<string, string>
} = {}) {
  const values = new Map(Object.entries(stored))
  const writes: string[] = []
  const environment: ArkiveThemeStorageEnvironment = {
    hostname,
    protocol,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    readCookie: () => cookie,
    writeCookie: (value) => writes.push(value),
  }
  return { environment, values, writes }
}

describe("createArkiveThemeStorage", () => {
  it("prefers the shared cookie over app-local legacy values", () => {
    const { environment } = createEnvironment({
      cookie: "arkive.theme=light",
      stored: { "aion2.theme": "dark" },
    })

    expect(createArkiveThemeStorage({ legacyKeys: ["aion2.theme"], environment }).get()).toBe("light")
  })

  it("migrates a legacy preference into shared storage and a parent-domain cookie", () => {
    const { environment, values, writes } = createEnvironment({
      hostname: "aion2.tc-imba.com",
      protocol: "https:",
      stored: { "aion2.theme": "light" },
    })

    expect(createArkiveThemeStorage({ legacyKeys: ["aion2.theme"], environment }).get()).toBe("light")
    expect(values.get(ARKIVE_THEME_STORAGE_KEY)).toBe("light")
    expect(writes.at(-1)).toContain("Domain=.tc-imba.com")
    expect(writes.at(-1)).toContain("Secure")
  })

  it("uses a host cookie on localhost so the preference crosses dev ports", () => {
    const { environment, writes } = createEnvironment()

    createArkiveThemeStorage({ environment }).set("dark")

    expect(writes.at(-1)).toContain("arkive.theme=dark")
    expect(writes.at(-1)).not.toContain("Domain=")
  })
})

describe("resolveArkiveThemeCookieDomain", () => {
  it("recognizes temporary and permanent Arkive domains", () => {
    expect(resolveArkiveThemeCookieDomain("tc-imba.com")).toBe(".tc-imba.com")
    expect(resolveArkiveThemeCookieDomain("aion2.tc-imba.com")).toBe(".tc-imba.com")
    expect(resolveArkiveThemeCookieDomain("www.arkive.games")).toBe(".arkive.games")
    expect(resolveArkiveThemeCookieDomain("localhost")).toBeNull()
  })
})
