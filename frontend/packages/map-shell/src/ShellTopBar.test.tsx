// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ShellTopBar, type ShellNavItem } from "./ShellTopBar"

afterEach(cleanup)

const renderItem = (
  item: ShellNavItem,
  className: string,
  labelClassName?: string,
) => (
  <a href={`#${item.key}`} className={className} data-testid={`link-${item.key}`}>
    {labelClassName ? (
      <span data-slot="nav-item-label" className={labelClassName}>
        {item.label}
      </span>
    ) : (
      item.label
    )}
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

  it("opens child links on hover without rendering a chevron", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [{ key: "/items", label: "Items" }],
      },
    ]
    const { getByTestId, queryByTestId } = render(
      <ShellTopBar nav={{ items, renderItem }} />,
    )

    const trigger = getByTestId("nav-dropdown-database")
    expect(trigger.querySelector("svg")).toBeNull()
    expect(queryByTestId("link-/items")).toBeNull()
    fireEvent.pointerEnter(trigger)
    expect(getByTestId("link-/items")).toBeTruthy()
    fireEvent.pointerLeave(trigger.parentElement!)
    expect(queryByTestId("link-/items")).toBeNull()
  })

  it("anchors an active dropdown indicator to the text label", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        active: true,
        children: [{ key: "/items", label: "Items" }],
      },
    ]
    const { getByTestId } = render(
      <ShellTopBar
        nav={{
          items,
          renderItem,
          classNames: {
            label: "relative",
            labelActive: "after:absolute after:left-1/2",
          },
        }}
      />,
    )

    const label = getByTestId("nav-dropdown-database").querySelector(
      '[data-slot="nav-item-label"]',
    )
    expect(label?.getAttribute("class")).toContain("after:left-1/2")
  })
})
