// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ArkiveMapTopBar } from "./ArkiveMapTopBar"

afterEach(cleanup)

function renderTopBar() {
  return render(
    <ArkiveMapTopBar
      homeUrl="https://arkive.example"
      homeLinkProps={{ target: "_blank", rel: "noopener noreferrer" }}
      homeLabel="Arkive home"
      brandName="Arkive"
      brandSlogan="Sail Games With Us."
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
    const { getByTestId } = renderTopBar()
    const brand = getByTestId("brand-link")

    expect(brand.getAttribute("href")).toBe("https://arkive.example")
    expect(brand.getAttribute("target")).toBe("_blank")
    expect(brand.textContent).toContain("Arkive")
    expect(brand.textContent).toContain("Sail Games With Us.")
    expect(getByTestId("map-link").textContent).toBe("Map")
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
