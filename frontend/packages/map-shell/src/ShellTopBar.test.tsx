// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ShellTopBar, type ShellNavItem } from "./ShellTopBar"

afterEach(cleanup)

const renderItem = (item: ShellNavItem, className: string) => (
  <a href={`#${item.key}`} className={className} data-testid={`link-${item.key}`}>
    {item.label}
  </a>
)

describe("ShellTopBar nav", () => {
  it("renders a plain item as a link", () => {
    const items: ShellNavItem[] = [{ key: "/", label: "Map", active: true }]
    const { getByTestId } = render(<ShellTopBar nav={{ items, renderItem }} />)
    expect(getByTestId("link-/").textContent).toBe("Map")
  })

  it("renders an item with children as a dropdown trigger, not a link", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [
          { key: "/items", label: "Items" },
          { key: "/buildings", label: "Buildings", active: true },
        ],
      },
    ]
    const { getByTestId, queryByTestId } = render(
      <ShellTopBar nav={{ items, renderItem }} />,
    )
    // Trigger present; no direct link for the parent.
    expect(getByTestId("nav-dropdown-database")).toBeTruthy()
    expect(queryByTestId("link-database")).toBeNull()
  })

  it("marks the dropdown trigger active when a child is active", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [{ key: "/items", label: "Items", active: true }],
      },
    ]
    const { getByTestId } = render(<ShellTopBar nav={{ items, renderItem }} />)
    expect(getByTestId("nav-dropdown-database").className).toContain("text-primary")
  })
})
