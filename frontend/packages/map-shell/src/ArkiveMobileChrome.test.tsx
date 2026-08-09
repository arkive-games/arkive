// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ArkiveMobileAccountRow } from "./ArkiveMobileAccountRow"
import { ArkiveMobileHeader } from "./ArkiveMobileHeader"

afterEach(cleanup)

describe("Arkive mobile chrome", () => {
  it("keeps the brand, page title, utility action, and account control reachable", () => {
    const api = render(
      <ArkiveMobileHeader
        homeUrl="https://arkive.example"
        homeLabel="Arkive home"
        brandName="Arkive.games"
        pageTitle="Card library"
        loginLabel="Log in"
        actions={<button type="button">Search</button>}
      />,
    )

    expect(api.getByTestId("arkive-mobile-header")).toBeTruthy()
    expect(api.getByTestId("mobile-brand-link").getAttribute("href")).toBe("https://arkive.example")
    expect(api.getByText("Card library")).toBeTruthy()
    expect(api.getByRole("button", { name: "Search" })).toBeTruthy()
    expect(api.getByRole("button", { name: "Log in" })).toBeTruthy()
  })

  it("delegates the More sheet account action to the host", () => {
    let selected = false
    const api = render(
      <ArkiveMobileAccountRow label="Log in" onSelect={() => { selected = true }} />,
    )

    fireEvent.click(api.getByRole("button", { name: "Log in" }))

    expect(selected).toBe(true)
  })

  it("accepts a signed-in account control in place of the login dialog", () => {
    const api = render(
      <ArkiveMobileHeader
        homeUrl="https://arkive.example"
        homeLabel="Arkive home"
        brandName="Arkive.games"
        loginLabel="Log in"
        accountControl={<a href="#account" aria-label="Account">Avatar</a>}
      />,
    )

    expect(api.getByRole("link", { name: "Account" })).toBeTruthy()
    expect(api.queryByRole("button", { name: "Log in" })).toBeNull()
  })
})
