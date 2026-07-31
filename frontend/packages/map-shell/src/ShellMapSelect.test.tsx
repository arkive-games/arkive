// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShellMapSelect } from "./ShellMapSelect"

afterEach(cleanup)

const maps = [
  { id: "elysea", label: "Elysea" },
  { id: "asmodae", label: "Asmodae" },
]

describe("ShellMapSelect", () => {
  it("renders the active map label in the trigger", () => {
    const { getByTestId } = render(
      <ShellMapSelect maps={maps} activeMapId="asmodae" onSelectMap={vi.fn()} />,
    )
    expect(getByTestId("map-select").textContent).toContain("Asmodae")
  })

  it("renders the placeholder when no map is active", () => {
    const { getByTestId } = render(
      <ShellMapSelect
        maps={maps}
        activeMapId=""
        onSelectMap={vi.fn()}
        placeholder="Select a map"
      />,
    )
    expect(getByTestId("map-select").textContent).toContain("Select a map")
  })

  it("shows the active map's leading glyph in the trigger", () => {
    const withIcons = maps.map((m) => ({
      ...m,
      icon: <img src={`/${m.id}.webp`} alt="" />,
    }))
    const { getByTestId } = render(
      <ShellMapSelect maps={withIcons} activeMapId="asmodae" onSelectMap={vi.fn()} />,
    )
    const icons = getByTestId("map-select").querySelectorAll("img")
    // Only the active map's glyph — the others live in the listbox, which Radix
    // mounts on open.
    expect(icons).toHaveLength(1)
    expect(icons[0].getAttribute("src")).toBe("/asmodae.webp")
  })

  it("ignores the deprecated barStyle instead of reviving the gradient band", () => {
    const { container } = render(
      <ShellMapSelect
        maps={maps}
        activeMapId="asmodae"
        onSelectMap={vi.fn()}
        barStyle={{ background: "red" }}
        classNames={{ bar: "should-not-render" }}
      />,
    )
    expect(container.querySelector("[style*='red']")).toBeNull()
    expect(container.querySelector(".should-not-render")).toBeNull()
  })
})
