// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShellSidebar } from "./ShellSidebar"

afterEach(cleanup)

const labels = { collapseLabel: "Collapse", expandLabel: "Expand" }

describe("ShellSidebar", () => {
  it("defaults to the left side and keeps the original toggle testid", () => {
    const { getByTestId, queryByTestId } = render(<ShellSidebar {...labels} />)
    expect(getByTestId("sidebar-toggle")).toBeTruthy()
    expect(queryByTestId("sidebar-toggle-right")).toBeNull()
  })

  it("uses a distinct toggle testid on the right so left selectors stay unique", () => {
    const { getByTestId, queryByTestId } = render(<ShellSidebar {...labels} side="right" />)
    expect(getByTestId("sidebar-toggle-right")).toBeTruthy()
    expect(queryByTestId("sidebar-toggle")).toBeNull()
  })

  it("hangs the toggle off the left edge when on the right", () => {
    const { getByTestId } = render(<ShellSidebar {...labels} side="right" />)
    const cls = getByTestId("sidebar-toggle-right").className
    expect(cls).toContain("left-0")
    expect(cls).toContain("-translate-x-full")
    expect(cls).not.toContain("right-0")
  })

  it("reports collapse changes on the right side too", () => {
    const onCollapsedChange = vi.fn()
    const { getByTestId } = render(
      <ShellSidebar {...labels} side="right" onCollapsedChange={onCollapsedChange} />,
    )
    fireEvent.click(getByTestId("sidebar-toggle-right"))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
  })

  it("renders children on the right side", () => {
    const { getByText } = render(
      <ShellSidebar {...labels} side="right">
        <p>Panel body</p>
      </ShellSidebar>,
    )
    expect(getByText("Panel body")).toBeTruthy()
  })

  it("keeps sidebar-toggle resolving to exactly one element when left and right sidebars both render", () => {
    const { getAllByTestId } = render(
      <>
        <ShellSidebar {...labels} />
        <ShellSidebar {...labels} side="right" />
      </>,
    )
    expect(getAllByTestId("sidebar-toggle")).toHaveLength(1)
    expect(getAllByTestId("sidebar-toggle-right")).toHaveLength(1)
  })

  it.each([
    ["left", false, "left"],
    ["left", true, "right"],
    ["right", false, "right"],
    ["right", true, "left"],
  ] as const)(
    "on the %s side with collapsed=%s, chevron points %s-ward",
    (side, collapsed, expected) => {
      const { getByTestId } = render(
        <ShellSidebar {...labels} side={side} collapsed={collapsed} />,
      )
      const toggle = getByTestId(side === "right" ? "sidebar-toggle-right" : "sidebar-toggle")
      expect(toggle.querySelector(`.lucide-chevron-${expected}`)).toBeTruthy()
      const other = expected === "left" ? "right" : "left"
      expect(toggle.querySelector(`.lucide-chevron-${other}`)).toBeNull()
    },
  )
})
