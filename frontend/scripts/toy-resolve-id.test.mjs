import { describe, expect, it } from "vitest"
import { findBySlug, toyList } from "./toy-resolve-id.mjs"

// Shaped like a real `toy mylist --json` response: no slug field, slug only in url.
const PAYLOAD = {
  total: 4,
  pn: 1,
  ps: 20,
  list: [
    { id: 16701370506240, url: "https://www.bilibili.com/toy/arkive-aion2/index.html" },
    { id: 16627177462784, url: "https://www.bilibili.com/toy/arkive/index.html" },
    { id: 16601890004992, url: "https://www.bilibili.com/toy/arkive-palworld/index.html" },
    { id: 16422826778624, url: "https://www.bilibili.com/toy/merge-creeper/index.html" },
  ],
}

describe("toyList", () => {
  it("accepts both shapes the CLI is known to return", () => {
    expect(toyList(PAYLOAD)).toHaveLength(4)
    expect(toyList([{ id: 1 }])).toHaveLength(1)
  })

  it("treats an error envelope as an error, not an empty account", () => {
    // The failure that motivated this: an expired session answers a message and no
    // list, which `payload?.list ?? []` would have reported as "no such toy".
    expect(() => toyList({ code: -101, message: "登录态已失效，请执行 toy login" })).toThrow(/登录态已失效/)
    expect(() => toyList({ code: -101, message: "nope", list: [] })).toThrow(/returned an error/)
  })

  it("refuses a truncated page rather than searching it", () => {
    // Default page size is 20; a present toy on page 2 would otherwise read as absent.
    expect(() => toyList({ total: 25, list: PAYLOAD.list })).toThrow(/4 of 25 toys/)
  })

  it("rejects a payload of an unknown shape", () => {
    expect(() => toyList({ list: "nope" })).toThrow(/neither an array nor an object/)
  })
})

describe("findBySlug", () => {
  it("resolves each configured Arkive toy", () => {
    expect(findBySlug(PAYLOAD, "arkive").id).toBe(16627177462784)
    expect(findBySlug(PAYLOAD, "arkive-aion2").id).toBe(16701370506240)
    expect(findBySlug(PAYLOAD, "arkive-palworld").id).toBe(16601890004992)
  })

  it("matches whole segments in BOTH directions", () => {
    // "arkive" is a prefix of "arkive-aion2"/"arkive-palworld". A substring match
    // either way round would publish one site's bundle over another's toy, so
    // probe both: short slug against a list holding the long ones (above), and a
    // long slug against a list holding only the short one.
    const onlyShort = { total: 1, list: [PAYLOAD.list[1]] }
    expect(() => findBySlug(onlyShort, "arkive-aion2")).toThrow(/no toy with slug "arkive-aion2"/)
  })

  it("throws on a miss instead of letting the caller fall back to create", () => {
    expect(() => findBySlug(PAYLOAD, "arkive-vrising")).toThrow(/no toy with slug "arkive-vrising"/)
    expect(() => findBySlug(PAYLOAD, "arkive-vrising")).toThrow(/second toy/)
  })

  it("throws rather than guessing when duplicates exist", () => {
    const dupes = { total: 2, list: [PAYLOAD.list[1], { ...PAYLOAD.list[1], id: 999 }] }
    expect(() => findBySlug(dupes, "arkive")).toThrow(/2 toys share the slug/)
  })

  it("refuses an entry with no usable id, so `toy update undefined` cannot happen", () => {
    const noId = { total: 1, list: [{ url: "https://www.bilibili.com/toy/arkive/index.html" }] }
    expect(() => findBySlug(noId, "arkive")).toThrow(/no usable numeric id/)
    const zero = { total: 1, list: [{ id: 0, url: "https://www.bilibili.com/toy/arkive/index.html" }] }
    expect(() => findBySlug(zero, "arkive")).toThrow(/no usable numeric id/)
  })

  it("treats an empty account as a miss", () => {
    expect(() => findBySlug({ total: 0, list: [] }, "arkive")).toThrow(/found: none/)
  })
})
