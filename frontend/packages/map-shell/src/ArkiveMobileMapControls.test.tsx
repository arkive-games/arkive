// @vitest-environment jsdom

import { useState } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ArkiveMobileMapControls } from "./ArkiveMobileMapControls"

afterEach(cleanup)

function Harness() {
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
        active: true,
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
    expect(api.getByTestId("map-fab-filter").getAttribute("aria-pressed")).toBe("true")
    expect(api.getByTestId("map-filter-active-indicator")).toBeTruthy()
  })

  it("opens content-sized map sheets and keeps their accessible titles", () => {
    const api = render(<Harness />)

    fireEvent.click(api.getByTestId("map-fab-search"))
    expect(api.getByTestId("search-sheet").className).toContain("max-h-[min(72dvh")
    expect(api.getByTestId("search-content")).toBeTruthy()
    fireEvent.keyDown(document.body, { key: "Escape" })

    fireEvent.click(api.getByTestId("map-fab-filter"))
    expect(api.getByTestId("filter-sheet").className).toContain("max-h-[min(85dvh")
    expect(api.getByText("Marker types")).toBeTruthy()
    expect(api.getByTestId("filter-header")).toBeTruthy()
    expect(api.getByTestId("filter-content")).toBeTruthy()
  })
})
