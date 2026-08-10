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
    const { getByRole, getByTestId, getByText } = renderTopBar()
    const brand = getByTestId("brand-link")
    const label = getByText("Map")

    expect(brand.getAttribute("href")).toBe("https://arkive.example")
    expect(brand.getAttribute("target")).toBe("_blank")
    expect(brand.textContent).toContain("Arkive")
    expect(brand.textContent).toContain("Sail Games With Us.")
    expect(brand.className).toContain("w-fit")
    expect(brand.className).toContain("h-14")
    expect(brand.className).toContain("text-foreground")
    expect(brand.className).toContain("gap-[0.6rem]")
    expect(brand.className).toContain("xl:gap-[0.7rem]")
    expect(brand.className).toContain("pr-3")
    expect(brand.className).toContain("xl:pr-4")
    expect(brand.querySelector("svg")?.getAttribute("class")).toContain("size-[2.125rem]")
    expect(brand.querySelector("svg")?.getAttribute("class")).toContain("xl:size-9")
    expect(getByTestId("brand-name").className).toContain("text-sm")
    expect(getByTestId("brand-name").className).toContain("leading-none")
    expect(getByTestId("brand-slogan").className).toContain("text-[0.7rem]")
    expect(getByTestId("brand-slogan").className).toContain("leading-none")
    expect(getByTestId("brand-slogan").className).toContain("var(--arkive-brand-slogan)")
    expect(brand.closest("header")?.className).toContain("h-14")
    expect(getByTestId("map-link").textContent).toBe("Map")
    expect(label.classList.contains("arkive-nav-item-label")).toBe(true)
    expect(getByTestId("map-link").classList.contains("arkive-nav-item--highlighted")).toBe(true)
    expect(getByRole("navigation").className).toContain("gap-7")
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
