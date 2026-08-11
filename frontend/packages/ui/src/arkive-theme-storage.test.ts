import { describe, expect, it } from "vitest"
import {
  ARKIVE_THEME_STORAGE_KEY,
  clearArkiveThemePreference,
  createArkiveThemeStorage,
  resolveArkiveThemeCookieDomain,
  type ArkiveThemeStorageEnvironment,
} from "./arkive-theme-storage"

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
      removeItem: (key) => values.delete(key),
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
    expect(JSON.parse(values.get(ARKIVE_THEME_STORAGE_KEY) ?? "null")).toMatchObject({
      schemaVersion: "1.0.0",
      stateClass: "user_preference",
      value: "light",
    })
    expect(writes.at(-1)).toContain("Domain=.tc-imba.com")
    expect(writes.at(-1)).toContain("Secure")
  })

  it("uses a host cookie on localhost so the preference crosses dev ports", () => {
    const { environment, writes } = createEnvironment()

    createArkiveThemeStorage({ environment }).set("dark")

    expect(writes.at(-1)).toContain("arkive.theme=dark")
    expect(writes.at(-1)).not.toContain("Domain=")
  })

  it("clears shared and legacy storage plus host and parent-domain cookies", () => {
    const { environment, values, writes } = createEnvironment({
      hostname: "aion2.tc-imba.com",
      protocol: "https:",
      stored: {
        [ARKIVE_THEME_STORAGE_KEY]: JSON.stringify({
          schemaVersion: "1.0.0",
          stateClass: "user_preference",
          writtenAt: 1,
          value: "dark",
        }),
        "aion2.theme": "dark",
      },
    })

    clearArkiveThemePreference({ legacyKeys: ["aion2.theme"], environment })

    expect(values.has(ARKIVE_THEME_STORAGE_KEY)).toBe(false)
    expect(values.has("aion2.theme")).toBe(false)
    expect(writes).toHaveLength(2)
    expect(writes.every((value) => value.includes("Max-Age=0"))).toBe(true)
    expect(writes.some((value) => value.includes("Domain=.tc-imba.com"))).toBe(true)
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

describe("theme layers", () => {
  it("writes an override and seeds the shared cookie on a game's first pick", () => {
    const { environment, writes } = createEnvironment()
    const storage = createArkiveThemeStorage({ environment })

    storage.set("dark")

    expect(storage.readLayers?.()).toEqual({ global: "dark", override: "dark" })
    // The cookie is the only transport that crosses origins, so seeding it is
    // what carries the choice to the other games.
    expect(writes.some((cookie) => cookie.startsWith("arkive.theme=dark"))).toBe(true)
  })

  it("keeps a later game pick local once a shared value exists", () => {
    const { environment } = createEnvironment({ cookie: "arkive.theme=dark" })
    const storage = createArkiveThemeStorage({ environment })

    storage.set("light")

    expect(storage.readLayers?.()).toEqual({ global: "dark", override: "light" })
    expect(storage.get()).toBe("light")
  })

  it("writes only the shared value on the portal", () => {
    const { environment } = createEnvironment()
    const storage = createArkiveThemeStorage({ environment, layer: "global" })

    storage.set("dark")

    // meta is not a game: there is no "this site only" for it to mean.
    expect(storage.readLayers?.()).toEqual({ global: "dark", override: null })
  })

  it("leaves an overriding site alone when the shared value changes", () => {
    const { environment } = createEnvironment()
    const storage = createArkiveThemeStorage({ environment })
    storage.setOverride?.("light")

    storage.setGlobal?.("dark")

    expect(storage.get()).toBe("light")
    expect(storage.readLayers?.()).toEqual({ global: "dark", override: "light" })
  })

  it("falls back to the shared value once the override is cleared", () => {
    const { environment } = createEnvironment({ cookie: "arkive.theme=dark" })
    const storage = createArkiveThemeStorage({ environment })
    storage.setOverride?.("light")

    storage.clearOverride?.()

    expect(storage.get()).toBe("dark")
  })

  it("drops the override when preferences are reset", () => {
    const { environment } = createEnvironment()
    const storage = createArkiveThemeStorage({ environment })
    storage.setOverride?.("light")

    clearArkiveThemePreference({ environment })

    // Otherwise a reset restores the shared theme and leaves this site still
    // overriding it, which reads as the reset having done nothing.
    expect(storage.readLayers?.()).toEqual({ global: null, override: null })
  })
})
