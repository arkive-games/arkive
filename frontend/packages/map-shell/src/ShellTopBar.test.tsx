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

  it("does not repeat the dropdown label inside its menu", () => {
    const items: ShellNavItem[] = [
      {
        key: "all-games",
        label: "All games",
        children: [{ key: "/game", label: "Game" }],
      },
    ]
    const { getAllByText, getByTestId } = render(
      <ShellTopBar nav={{ items, renderItem }} />,
    )

    fireEvent.pointerEnter(getByTestId("nav-dropdown-all-games"))
    expect(getAllByText("All games")).toHaveLength(1)
  })

  it("keeps localized dropdown labels at a readable menu width", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [{ key: "/simulator", label: "Stat simulator" }],
      },
    ]
    const { getByRole, getByTestId } = render(
      <ShellTopBar nav={{ items, renderItem }} />,
    )

    fireEvent.pointerEnter(getByTestId("nav-dropdown-database"))
    // jsdom does no layout, so width itself is untestable here; these pin the
    // two classes the behaviour depends on. `w-max` is what stops the label
    // wrapping -- the floor alone does not.
    expect(getByRole("menu").className).toContain("w-max")
    expect(getByRole("menu").className).toContain("min-w-44")
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

  it("keeps one highlighted item while crossing the nav and restores the route on exit", () => {
    const items: ShellNavItem[] = [
      { key: "map", label: "Map", active: true },
      { key: "database", label: "Database" },
    ]
    const { getByRole, getByTestId, getByText } = render(
      <ShellTopBar
        nav={{
          items,
          renderItem,
          classNames: { label: "nav-label", labelActive: "is-highlighted" },
        }}
      />,
    )

    const mapLabel = getByText("Map")
    const databaseLabel = getByText("Database")
    const mapLink = getByTestId("link-map")
    const databaseLink = getByTestId("link-database")
    expect(mapLabel.className).toContain("is-highlighted")
    expect(databaseLabel.className).not.toContain("is-highlighted")
    expect(mapLink.className).toContain("text-primary")
    expect(databaseLink.className).toContain("text-foreground/70")

    fireEvent.pointerEnter(databaseLink.parentElement!)
    expect(mapLabel.className).not.toContain("is-highlighted")
    expect(databaseLabel.className).toContain("is-highlighted")
    expect(mapLink.className).toContain("text-foreground/70")
    expect(databaseLink.className).toContain("text-primary")

    fireEvent.pointerLeave(getByRole("navigation"))
    expect(mapLabel.className).toContain("is-highlighted")
    expect(databaseLabel.className).not.toContain("is-highlighted")
    expect(mapLink.className).toContain("text-primary")
    expect(databaseLink.className).toContain("text-foreground/70")
  })

  it("uses one geometry and type treatment for nav and utility menu items", () => {
    const items: ShellNavItem[] = [
      {
        key: "database",
        label: "Database",
        children: [{ key: "/items", label: "Items" }],
      },
    ]
    const { getByTestId } = render(
      <ShellTopBar
        nav={{ items, renderItem }}
        languageSwitcher={{
          languages: [{ code: "en", label: "English" }],
          current: "en",
          onChange: () => undefined,
          menuLabel: "Language",
          shortLabel: "Language",
        }}
      />,
    )

    fireEvent.pointerEnter(getByTestId("nav-dropdown-database"))
    const navItem = getByTestId("link-/items")
    fireEvent.pointerEnter(getByTestId("lang-menu"))
    const utilityItem = getByTestId("lang-en")

    for (const item of [navItem, utilityItem]) {
      expect(item.className).toContain("flex")
      expect(item.className).toContain("min-h-11")
      expect(item.className).toContain("px-3")
      expect(item.className).toContain("rounded-md")
      expect(item.className).toContain("text-sm")
      expect(item.className).toContain("font-medium")
    }

    expect(navItem.className).toContain("[&>[data-slot=nav-item-label]]:flex-1")
    expect(navItem.parentElement?.className).not.toContain("[&>a]:block")
  })
})
