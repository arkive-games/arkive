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
        locale="en-US"
        actions={<button type="button">Search</button>}
      />,
    )

    expect(api.getByTestId("arkive-mobile-header")).toBeTruthy()
    expect(api.getByTestId("mobile-brand-link").getAttribute("href")).toBe("https://arkive.example")
    expect(api.getByText("Card library")).toBeTruthy()
    expect(api.getByRole("button", { name: "Search" })).toBeTruthy()
    expect(api.getByRole("button", { name: "Log in" })).toBeTruthy()
  })

  it("opens the shared email login dialog from the More sheet account row", () => {
    const api = render(<ArkiveMobileAccountRow locale="en-US" label="Log in" />)

    fireEvent.click(api.getByRole("button", { name: "Log in" }))

    expect(api.getByRole("dialog")).toBeTruthy()
    expect(api.getByRole("heading", { name: "Log in to Arkive" })).toBeTruthy()
    expect(api.getByLabelText("Email")).toBeTruthy()
    expect(api.getByLabelText("Password")).toBeTruthy()
  })

  it("accepts a signed-in account control in place of the login dialog", () => {
    const api = render(
      <ArkiveMobileHeader
        homeUrl="https://arkive.example"
        homeLabel="Arkive home"
        brandName="Arkive.games"
        loginLabel="Log in"
        locale="en-US"
        accountControl={<a href="#account" aria-label="Account">Avatar</a>}
      />,
    )

    expect(api.getByRole("link", { name: "Account" })).toBeTruthy()
    expect(api.queryByRole("button", { name: "Log in" })).toBeNull()
  })
})
