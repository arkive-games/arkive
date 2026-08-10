// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArkiveMapTopBar, type ArkiveMapTopBarAccount } from "./ArkiveMapTopBar"

afterEach(cleanup)

function renderTopBar(account?: ArkiveMapTopBarAccount, onLogin?: () => void) {
  return render(
    <ArkiveMapTopBar
      homeUrl="https://arkive.example"
      homeLabel="Arkive home"
      brandName="Arkive"
      brandSlogan="Sail Games With Us."
      nav={{
        items: [{ key: "map", label: "Map", active: true }],
        renderItem: (item, className, labelClassName) => (
          <a href="#map" className={className}>
            <span className={labelClassName}>{item.label}</span>
          </a>
        ),
      }}
      languageSwitcher={{
        languages: [{ code: "en", label: "English" }],
        current: "en",
        onChange: vi.fn(),
        menuLabel: "Change language",
      }}
      themeSwitcher={{
        current: "auto",
        onChange: vi.fn(),
        labels: { auto: "Auto", light: "Light", dark: "Dark" },
        menuLabel: "Change theme",
      }}
      loginLabel="Log in"
      onLogin={onLogin}
      account={account}
    />,
  )
}

function account(overrides: Partial<ArkiveMapTopBarAccount> = {}): ArkiveMapTopBarAccount {
  return {
    status: "anonymous",
    signInLabel: "Sign in",
    signOutLabel: "Sign out",
    accountLabel: "Account",
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
}

describe("ArkiveMapTopBar account control", () => {
  it("keeps the plain login button when no account prop is supplied", () => {
    const onLogin = vi.fn()
    const { getByRole, queryByTestId } = renderTopBar(undefined, onLogin)

    // sts2 and lostark have not adopted auth yet, so the old contract has to
    // keep working rather than becoming a required prop.
    expect(queryByTestId("account-sign-in")).toBeNull()
    fireEvent.click(getByRole("button", { name: "Log in" }))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it("shows a neutral placeholder while the session is being probed", () => {
    const { getByTestId, queryByTestId } = renderTopBar(account({ status: "loading" }))

    const trigger = getByTestId("account-loading") as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.getAttribute("aria-busy")).toBe("true")
    // Rendering "Sign in" mid-probe makes a signed-in user think they were
    // logged out, and they click it.
    expect(queryByTestId("account-sign-in")).toBeNull()
    expect(queryByTestId("account-menu")).toBeNull()
  })

  it("invokes onSignIn when signed out", () => {
    const onSignIn = vi.fn()
    const { getByTestId } = renderTopBar(account({ onSignIn }))

    fireEvent.click(getByTestId("account-sign-in"))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it("shows the display name and signs out from the menu when signed in", () => {
    const onSignOut = vi.fn()
    const { getByTestId } = renderTopBar(
      account({ status: "authenticated", userName: "alice", onSignOut }),
    )

    const trigger = getByTestId("account-menu")
    expect(trigger.textContent).toContain("alice")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    // The cluster is hover-driven, matching the language and theme menus.
    fireEvent.pointerEnter(trigger.parentElement as HTMLElement)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(getByTestId("account-sign-out"))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it("renders host-supplied entries above sign out", () => {
    const onSelect = vi.fn()
    const { getByTestId, getAllByRole } = renderTopBar(
      account({
        status: "authenticated",
        userName: "alice",
        items: [{ key: "profile", label: "Profile", onSelect }],
      }),
    )

    const trigger = getByTestId("account-menu")
    fireEvent.pointerEnter(trigger.parentElement as HTMLElement)

    expect(getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Profile",
      "Sign out",
    ])
    expect(getByTestId("account-profile").className).toContain("min-h-11")
    expect(getByTestId("account-profile").className).toContain("px-3")
    expect(getByTestId("account-profile").className).toContain("text-sm")
    expect(getByTestId("account-profile").className).toContain("font-medium")

    fireEvent.click(getByTestId("account-profile"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("falls back to the account label when no display name is known", () => {
    const { getByTestId } = renderTopBar(account({ status: "authenticated" }))
    expect(getByTestId("account-menu").textContent).toContain("Account")
  })

  it("closes the menu when focus leaves the cluster", () => {
    const { getByTestId } = renderTopBar(account({ status: "authenticated", userName: "alice" }))

    const trigger = getByTestId("account-menu")
    const cluster = trigger.parentElement as HTMLElement
    fireEvent.pointerEnter(cluster)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    fireEvent.pointerLeave(cluster)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})
