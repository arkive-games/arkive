// @vitest-environment jsdom

import { useState } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ArkiveMobileMapControls } from "./ArkiveMobileMapControls"

afterEach(cleanup)

function Harness({ filterActive = true }: { filterActive?: boolean } = {}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  return (
    <ArkiveMobileMapControls
      search={{
        label: "Search map",
        open: searchOpen,
        onOpenChange: setSearchOpen,
        content: <div data-testid="search-content" />,
      }}
      filter={{
        label: "Marker types",
        open: filterOpen,
        onOpenChange: setFilterOpen,
        active: filterActive,
        header: <div data-testid="filter-header" />,
        content: <div data-testid="filter-content" />,
      }}
    />
  )
}

describe("ArkiveMobileMapControls", () => {
  it("exposes touch-sized search and semantically active filter actions", () => {
    const api = render(<Harness />)
    expect(api.getByTestId("map-fab-search").className).toContain("size-12")
    // data-active, not aria-pressed: the button is a dialog trigger, so
    // "pressed" would describe the filter state on a control whose own state is
    // open/closed.
    expect(api.getByTestId("map-fab-filter").getAttribute("data-active")).toBe("true")
    expect(api.getByTestId("map-filter-active-indicator")).toBeTruthy()
  })

  it("reports no changed state when the filter is untouched", () => {
    const api = render(<Harness filterActive={false} />)
    expect(api.getByTestId("map-fab-filter").getAttribute("data-active")).toBe("false")
    expect(api.queryByTestId("map-filter-active-indicator")).toBeNull()
  })

  it("opens content-sized map sheets and keeps their accessible titles", () => {
    const api = render(<Harness />)

    fireEvent.click(api.getByTestId("map-fab-search"))
    expect(api.getByTestId("search-sheet").className).toContain("max-h-[min(72dvh")
    expect(api.getByTestId("search-content")).toBeTruthy()
    fireEvent.keyDown(document.body, { key: "Escape" })
    // Assert the dismissal actually happened: without this the next click would
    // stack a second dialog and the test would still pass.
    expect(api.queryByTestId("search-sheet")).toBeNull()

    fireEvent.click(api.getByTestId("map-fab-filter"))
    expect(api.getByTestId("filter-sheet").className).toContain("max-h-[min(85dvh")
    expect(api.getByText("Marker types")).toBeTruthy()
    expect(api.getByTestId("filter-header")).toBeTruthy()
    expect(api.getByTestId("filter-content")).toBeTruthy()
  })
})
