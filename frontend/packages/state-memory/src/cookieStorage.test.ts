import { describe, expect, it } from "vitest"
import {
  SHARED_MAXIMUM_BYTES,
  createCookieStorage,
  resolveSharedCookieDomain,
  type CookieEnvironment,
} from "./cookieStorage"

/** A jar shared by several "origins", which is exactly what a domain cookie is. */
function jar(hostname = "palworld.tc-imba.com", protocol = "https:") {
  const written: string[] = []
  const values = new Map<string, string>()
  const environment: CookieEnvironment = {
    hostname,
    protocol,
    readCookie: () => [...values].map(([name, value]) => `${name}=${value}`).join("; "),
    writeCookie: (raw) => {
      written.push(raw)
      const [pair] = raw.split(";")
      const at = pair.indexOf("=")
      const name = pair.slice(0, at).trim()
      const value = pair.slice(at + 1).trim()
      if (/Max-Age=0(;|$)/.test(raw)) values.delete(name)
      else values.set(name, value)
    },
  }
  return { environment, written, values }
}

describe("resolveSharedCookieDomain", () => {
  it("returns the parent domain every Arkive site shares", () => {
    expect(resolveSharedCookieDomain("palworld.tc-imba.com")).toBe(".tc-imba.com")
    expect(resolveSharedCookieDomain("tc-imba.com")).toBe(".tc-imba.com")
    expect(resolveSharedCookieDomain("aion2.arkive.games")).toBe(".arkive.games")
  })

  it("declines to guess anywhere else, rather than over-sharing", () => {
    // A label-count heuristic would hand out a public-suffix cookie here.
    expect(resolveSharedCookieDomain("localhost")).toBeNull()
    expect(resolveSharedCookieDomain("127.0.0.1")).toBeNull()
    expect(resolveSharedCookieDomain("nottc-imba.com")).toBeNull()
    expect(resolveSharedCookieDomain("tc-imba.com.evil.net")).toBeNull()
  })

  it("tolerates a trailing-dot FQDN", () => {
    expect(resolveSharedCookieDomain("palworld.tc-imba.com.")).toBe(".tc-imba.com")
  })
})

describe("createCookieStorage", () => {
  it("round-trips a value and survives keys containing separators", () => {
    const { environment } = jar()
    const storage = createCookieStorage(environment)
    const key = "arkive.memory.site.interface.language|viewport=mobile"
    storage.setItem(key, "zh-CN")
    expect(storage.getItem(key)).toBe("zh-CN")
    expect(storage.length).toBe(1)
    expect(storage.key(0)).toBe(key)
  })

  it("scopes the cookie to the parent domain so other Arkive origins see it", () => {
    const { environment, written } = jar("palworld.tc-imba.com")
    createCookieStorage(environment).setItem("k", "v")
    expect(written[0]).toContain("Domain=.tc-imba.com")
    expect(written[0]).toContain("Secure")
    expect(written[0]).toContain("SameSite=Lax")
  })

  it("stays host-only where there is no shared parent, instead of guessing", () => {
    const { environment, written } = jar("localhost", "http:")
    createCookieStorage(environment).setItem("k", "v")
    expect(written[0]).not.toContain("Domain=")
    expect(written[0]).not.toContain("Secure")
  })

  it("a value written on one origin is readable on another under the same domain", () => {
    // The reason this transport exists. Two clients, one jar.
    const shared = jar("palworld.tc-imba.com")
    const palworld = createCookieStorage(shared.environment)
    const aion2 = createCookieStorage({ ...shared.environment, hostname: "aion2.tc-imba.com" })
    palworld.setItem("arkive.memory.site.interface.language", "zh-CN")
    expect(aion2.getItem("arkive.memory.site.interface.language")).toBe("zh-CN")
  })

  it("removes by expiring, and reports the key gone", () => {
    const { environment } = jar()
    const storage = createCookieStorage(environment)
    storage.setItem("k", "v")
    storage.removeItem("k")
    expect(storage.getItem("k")).toBeNull()
    expect(storage.length).toBe(0)
  })

  it("throws rather than writing a cookie the browser would silently drop", () => {
    const { environment } = jar()
    const storage = createCookieStorage(environment)
    expect(() => storage.setItem("k", "x".repeat(SHARED_MAXIMUM_BYTES + 1)))
      .toThrow(/exceeds 3000/)
  })

  it("ignores cookies it does not own", () => {
    const { environment, values } = jar()
    values.set("SESSIONID", "abc")
    values.set("_ga", "GA1.2.3")
    const storage = createCookieStorage(environment)
    expect(storage.length).toBe(0)
    storage.setItem("k", "v")
    expect(storage.length).toBe(1)
    // and never clobbers them
    expect(values.get("SESSIONID")).toBe("abc")
  })
})
