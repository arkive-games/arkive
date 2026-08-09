// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const SCRIPT_SELECTOR = 'script[src^="https://hm.baidu.com/hm.js"]'

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR))
}

function queue(): unknown[][] {
  return (window as unknown as { _hmt?: unknown[][] })._hmt ?? []
}

async function load() {
  // The module keeps its "already started" state in module scope, so every test
  // needs a fresh copy.
  vi.resetModules()
  return await import("./baiduAnalytics")
}

beforeEach(() => {
  document.head.innerHTML = ""
  delete (window as unknown as { _hmt?: unknown[][] })._hmt
  window.history.replaceState({}, "", "/")
})

describe("initBaiduAnalytics", () => {
  it("loads hm.js for the given site id", async () => {
    const { initBaiduAnalytics, ARKIVE_BAIDU_SITE_ID } = await load()
    initBaiduAnalytics()
    expect(scripts().map((s) => s.src)).toEqual([
      `https://hm.baidu.com/hm.js?${ARKIVE_BAIDU_SITE_ID}`,
    ])
  })

  it("creates the _hmt queue hm.js drains on load", async () => {
    const { initBaiduAnalytics } = await load()
    initBaiduAnalytics()
    expect(Array.isArray(queue())).toBe(true)
  })

  it("loads once even when called twice", async () => {
    const { initBaiduAnalytics } = await load()
    initBaiduAnalytics()
    initBaiduAnalytics()
    expect(scripts()).toHaveLength(1)
  })

  it("stays out of dev builds", async () => {
    const { initBaiduAnalytics } = await load()
    initBaiduAnalytics({ dev: true })
    expect(scripts()).toHaveLength(0)
  })

  it("stays out of Toy builds", async () => {
    const { initBaiduAnalytics } = await load()
    initBaiduAnalytics({ toy: true })
    expect(scripts()).toHaveLength(0)
  })
})

describe("trackPageview", () => {
  it("reports a client-side navigation", async () => {
    const { initBaiduAnalytics, trackPageview } = await load()
    initBaiduAnalytics()
    window.history.pushState({}, "", "/pals/Anubis")
    trackPageview()
    expect(queue()).toEqual([["_trackPageview", "/pals/Anubis"]])
  })

  it("keeps the query string, which distinguishes real pages", async () => {
    const { initBaiduAnalytics, trackPageview } = await load()
    initBaiduAnalytics()
    window.history.pushState({}, "", "/breeding?c=Anubis")
    trackPageview()
    expect(queue()).toEqual([["_trackPageview", "/breeding?c=Anubis"]])
  })

  it("skips the entry page, which hm.js already counted", async () => {
    const { initBaiduAnalytics, trackPageview } = await load()
    window.history.replaceState({}, "", "/items")
    initBaiduAnalytics()
    // The router resolves its first navigation for the URL the page loaded on.
    trackPageview()
    expect(queue()).toEqual([])
  })

  it("skips a repeat of the current page", async () => {
    const { initBaiduAnalytics, trackPageview } = await load()
    initBaiduAnalytics()
    window.history.pushState({}, "", "/items")
    trackPageview()
    trackPageview()
    expect(queue()).toHaveLength(1)
  })

  it("reports nothing when analytics never loaded", async () => {
    const { initBaiduAnalytics, trackPageview } = await load()
    initBaiduAnalytics({ dev: true })
    window.history.pushState({}, "", "/items")
    trackPageview()
    expect(queue()).toEqual([])
  })
})
