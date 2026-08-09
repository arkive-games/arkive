import { describe, expect, it } from "vitest"
import { findBySlug, slugOf } from "./toy-resolve-id.mjs"

// Shaped like a real `toy mylist --json` response: no slug field, slug only in url.
const PAYLOAD = {
  total: 4,
  list: [
    { id: 16701370506240, url: "https://www.bilibili.com/toy/arkive-aion2/index.html" },
    { id: 16627177462784, url: "https://www.bilibili.com/toy/arkive/index.html" },
    { id: 16601890004992, url: "https://www.bilibili.com/toy/arkive-palworld/index.html" },
    { id: 16422826778624, url: "https://www.bilibili.com/toy/merge-creeper/index.html" },
  ],
}

describe("slugOf", () => {
  it("reads the slug out of the toy url", () => {
    expect(slugOf({ url: "https://www.bilibili.com/toy/arkive/index.html" })).toBe("arkive")
  })

  it("returns null rather than throwing on a missing or unparseable url", () => {
    expect(slugOf({})).toBeNull()
    expect(slugOf({ url: "not a url" })).toBeNull()
    expect(slugOf({ url: "https://www.bilibili.com/video/BV1" })).toBeNull()
  })
})

describe("findBySlug", () => {
  it("resolves each configured Arkive toy", () => {
    expect(findBySlug(PAYLOAD, "arkive").id).toBe(16627177462784)
    expect(findBySlug(PAYLOAD, "arkive-aion2").id).toBe(16701370506240)
    expect(findBySlug(PAYLOAD, "arkive-palworld").id).toBe(16601890004992)
  })

  it("matches the whole segment, so a shorter slug cannot claim a longer one", () => {
    // The real hazard: "arkive" is a prefix of "arkive-aion2" and
    // "arkive-palworld". A substring match would publish the portal's bundle over
    // a game's toy.
    expect(findBySlug(PAYLOAD, "arkive").id).not.toBe(16701370506240)
  })

  it("throws on a miss instead of letting the caller fall back to create", () => {
    expect(() => findBySlug(PAYLOAD, "arkive-vrising")).toThrow(/no toy with slug "arkive-vrising"/)
    // The message must say why a fallback is unacceptable, since that is the
    // whole reason this is fatal.
    expect(() => findBySlug(PAYLOAD, "arkive-vrising")).toThrow(/second toy/)
  })

  it("throws rather than guessing when duplicates exist", () => {
    const dupes = { list: [PAYLOAD.list[1], { ...PAYLOAD.list[1], id: 999 }] }
    expect(() => findBySlug(dupes, "arkive")).toThrow(/2 toys share the slug/)
  })

  it("rejects a payload whose shape is not what the CLI documents", () => {
    expect(() => findBySlug({ list: "nope" }, "arkive")).toThrow(/not an array/)
  })

  it("treats an empty account as a miss", () => {
    expect(() => findBySlug({ list: [] }, "arkive")).toThrow(/found: none/)
  })
})
