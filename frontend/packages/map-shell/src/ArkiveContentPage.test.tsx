// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArkiveContentPage, type ArkiveContentPageProps } from "./ArkiveContentPage"

let mobile = false
beforeEach(() => {
  mobile = false
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return query.includes("max-width") ? mobile : false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function page(over: Partial<ArkiveContentPageProps> = {}) {
  return (
    <ArkiveContentPage footer={<footer>Footer</footer>} title="Puppets" heading {...over}>
      {over.children ?? <article>Result</article>}
    </ArkiveContentPage>
  )
}

describe("ArkiveContentPage", () => {
  it("keeps catalogue controls and a single heading outside the results scroller", () => {
    const api = render(page({ width: "wide", toolbar: <input aria-label="Search" />, filterLabel: "Filters" }))
    const scroller = api.container.querySelector("[data-content-scroll]")!
    const toolbar = api.container.querySelector("[data-content-toolbar]")!
    expect(toolbar.contains(api.getByLabelText("Search"))).toBe(true)
    expect(scroller.contains(api.getByLabelText("Search"))).toBe(false)
    expect(toolbar.contains(api.container.querySelector("h1"))).toBe(true)
    expect(api.container.querySelectorAll("h1")).toHaveLength(1)
    expect(scroller.contains(api.container.querySelector("article"))).toBe(true)
    expect(toolbar.className).toContain("max-h-[50%]")
    expect(api.container.querySelector("main")!.className).toContain("arkive-content-wide-data")
    // The filters fold on phones behind the shared disclosure.
    expect(api.getByTestId("filter-disclosure-toggle").textContent).toContain("Filters")
  })

  it("renders a lead-only toolbar with no filter toggle", () => {
    const api = render(page({ toolbarLead: <aside>Tabs</aside> }))
    expect(api.container.querySelector("[data-content-toolbar]")!.contains(api.getByText("Tabs"))).toBe(true)
    expect(api.queryByTestId("filter-disclosure-toggle")).toBeNull()
    expect(api.container.querySelectorAll("h1")).toHaveLength(1)
  })

  it("scrolls the heading with the content on pages without a toolbar", () => {
    const api = render(page())
    expect(api.container.querySelector("[data-content-toolbar]")).toBeNull()
    expect(api.container.querySelector("main")!.contains(api.container.querySelector("h1"))).toBe(true)
  })

  it("resets on a changed result scope but keeps reading position for card edits", () => {
    const api = render(page({ resultsKey: "all", children: <article>Level 1</article> }))
    const scroller = api.container.querySelector<HTMLDivElement>("[data-content-scroll]")!
    scroller.scrollTop = 200
    api.rerender(page({ resultsKey: "all", children: <article>Level 30</article> }))
    expect(scroller.scrollTop).toBe(200)
    api.rerender(page({ resultsKey: "red", children: <article>Level 30</article> }))
    expect(scroller.scrollTop).toBe(0)
  })

  it("offers back-to-top on phones once the column has scrolled", () => {
    mobile = true
    const api = render(page({ backToTopLabel: "Back to top" }))
    const scroller = api.container.querySelector<HTMLDivElement>("[data-content-scroll]")!
    expect(api.queryByTestId("content-back-to-top")).toBeNull()
    scroller.scrollTop = 800
    act(() => {
      fireEvent.scroll(scroller)
    })
    expect(api.getByTestId("content-back-to-top").getAttribute("aria-label")).toBe("Back to top")
  })

  it("keeps the footer to desktop when asked", () => {
    const api = render(page({ hideMobileFooter: true }))
    expect(api.getByText("Footer").parentElement!.className).toBe("hidden md:block")
  })
})
