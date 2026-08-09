// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountDialog, type AccountDialogMode } from "./AccountDialog"
import { AuthProvider } from "./AuthProvider"

afterEach(cleanup)

function renderDialog(initialMode: AccountDialogMode = "login") {
  return render(
    <AuthProvider baseUrl="" enabled={false}>
      <AccountDialog
        open
        onOpenChange={vi.fn()}
        initialMode={initialMode}
      />
    </AuthProvider>,
  )
}

describe("AccountDialog", () => {
  it("uses the Arkive dialog composition across the account flows", () => {
    const { getByLabelText, getByRole } = renderDialog()

    expect(getByRole("heading", { name: "Sign in to Arkive" })).toBeTruthy()
    expect(getByLabelText("Email").getAttribute("type")).toBe("email")
    expect(getByLabelText("Password").getAttribute("type")).toBe("password")

    fireEvent.click(getByRole("button", { name: "Show password" }))
    expect(getByLabelText("Password").getAttribute("type")).toBe("text")

    fireEvent.click(getByRole("button", { name: "No account yet? Create one" }))
    expect(getByRole("heading", { name: "Create an Arkive account" })).toBeTruthy()
    expect(getByLabelText("Display name")).toBeTruthy()

    fireEvent.click(getByRole("button", { name: "Already have an account? Sign in" }))
    fireEvent.click(getByRole("button", { name: "Forgot your password?" }))
    expect(getByRole("heading", { name: "Reset your password" })).toBeTruthy()
    expect(getByRole("button", { name: "Send reset link" })).toBeTruthy()
  })

  it("renders the reset-code form in the same dialog shell", () => {
    const { getByLabelText, getByRole } = renderDialog("reset")

    expect(getByRole("heading", { name: "Choose a new password" })).toBeTruthy()
    expect(getByLabelText("Reset code")).toBeTruthy()
    expect(getByLabelText("New password").getAttribute("type")).toBe("password")
    expect(getByRole("button", { name: "Update password" })).toBeTruthy()
  })
})
