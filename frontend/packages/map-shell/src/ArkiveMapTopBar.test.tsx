// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ArkiveMapTopBar } from "./ArkiveMapTopBar"

afterEach(cleanup)

function renderTopBar(over: Partial<ComponentProps<typeof ArkiveMapTopBar>> = {}) {
  return render(
    <ArkiveMapTopBar
      {...over}
      homeUrl="https://arkive.example"
      homeLinkProps={{ target: "_blank", rel: "noopener noreferrer" }}
      homeLabel="Arkive home"
      nav={{
        items: [{ key: "map", label: "Map", active: true }],
        renderItem: (item, className, labelClassName) => (
          <a href="#map" className={className} data-testid="map-link">
            <span className={labelClassName}>{item.label}</span>
          </a>
        ),
      }}
      languageSwitcher={{
        languages: [
          { code: "en", label: "English" },
          { code: "ja", label: "Japanese" },
        ],
        current: "en",
        onChange: vi.fn(),
        menuLabel: "Change language",
        shortLabel: "Language",
      }}
      themeSwitcher={{
        current: "auto",
        onChange: vi.fn(),
        labels: { auto: "Auto", light: "Light", dark: "Dark" },
        menuLabel: "Change theme",
        shortLabel: "Theme",
      }}
      loginLabel="Log in"
    />,
  )
}

describe("ArkiveMapTopBar", () => {
  it("renders the shared brand link and the host-owned navigation slot", () => {
    const { getByRole, getByTestId, getByText } = renderTopBar()
    const brand = getByTestId("brand-link")
    const label = getByText("Map")

    expect(brand.getAttribute("href")).toBe("https://arkive.example")
    expect(brand.getAttribute("target")).toBe("_blank")
    expect(brand.getAttribute("aria-label")).toBe("Arkive home")
    // The English wordmark alone, whatever the language: no slogan, no mark.
    expect(brand.textContent).toBe("Arkive")
    expect(brand.querySelector("svg")).toBeNull()
    expect(getByTestId("brand-wordmark").className).toContain("arkive-wordmark")
    expect(brand.closest("header")?.className).toContain("h-14")
    expect(getByTestId("map-link").textContent).toBe("Map")
    expect(label.classList.contains("arkive-nav-item-label")).toBe(true)
    expect(getByTestId("map-link").className).toContain("text-background")
    expect(getByRole("navigation").className).toContain("rounded-full")
    expect(getByTestId("nav-indicator").className).toContain("arkive-nav-indicator")
  })

  it("shows the game chip only when a game is given", () => {
    expect(renderTopBar().queryByTestId("game-chip")).toBeNull()
    cleanup()
    const { getByTestId } = renderTopBar({ game: { name: "Palworld", icon: "/icon.webp" } })
    expect(getByTestId("game-chip").textContent).toBe("Palworld")
    expect(getByTestId("game-chip").querySelector("img")?.getAttribute("src")).toBe("/icon.webp")
  })

  it("floats as a capsule on the portal home and docks everywhere else", () => {
    expect(renderTopBar().getByTestId("brand-link").closest("header")?.className)
      .not.toContain("arkive-map-topbar--floating")
    cleanup()
    const header = renderTopBar({ variant: "floating" }).getByTestId("brand-link").closest("header")
    expect(header?.className).toContain("arkive-map-topbar--floating")
    expect(header?.className).toContain("rounded-full")
  })

  it("renders language, theme, and login controls in the shared right cluster", () => {
    const { getByTestId, getByRole } = renderTopBar()

    expect(getByTestId("lang-menu")).toBeTruthy()
    expect(getByTestId("theme-menu")).toBeTruthy()
    expect(getByRole("button", { name: "Log in" })).toBeTruthy()
  })

  it("opens utility menus on pointer hover", () => {
    const { getByTestId, getAllByRole } = renderTopBar()

    fireEvent.pointerEnter(getByTestId("lang-menu"))
    expect(getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "English",
      "Japanese",
    ])

    fireEvent.pointerEnter(getByTestId("theme-menu"))
    expect(getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Auto",
      "Light",
      "Dark",
    ])
  })

  it("clears pointer focus from utility triggers", () => {
    const { getByTestId } = renderTopBar()
    const trigger = getByTestId("theme-menu")

    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.pointerUp(trigger)
    expect(document.activeElement).not.toBe(trigger)
  })

  it("keeps hover-open utility menus stable across pointer clicks", () => {
    const { getByTestId, getAllByRole } = renderTopBar()
    const themeTrigger = getByTestId("theme-menu")
    const languageTrigger = getByTestId("lang-menu")

    fireEvent.pointerEnter(themeTrigger, { pointerType: "mouse" })
    fireEvent.pointerDown(themeTrigger, { pointerType: "mouse", button: 0 })
    fireEvent.click(themeTrigger)
    expect(getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Auto",
      "Light",
      "Dark",
    ])

    fireEvent.pointerEnter(languageTrigger, { pointerType: "mouse" })
    fireEvent.pointerDown(languageTrigger, { pointerType: "mouse", button: 0 })
    fireEvent.click(languageTrigger)
    expect(getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "English",
      "Japanese",
    ])
  })
})
