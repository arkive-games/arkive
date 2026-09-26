// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios"
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

/** Answers every request with a 401 carrying the given backend error code. */
function rejectingAdapter(errorCode: string): AxiosAdapter {
  return async (config) => {
    const response: AxiosResponse = {
      data: { errorCode, errorMessage: "rejected" },
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config,
    }
    throw new AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, {}, response)
  }
}

describe("AccountDialog", () => {
  it("uses the Arkive dialog composition across the account flows", () => {
    const { getByLabelText, getByRole } = renderDialog()

    const dialog = getByRole("dialog")
    expect(dialog.getAttribute("data-size")).toBe("sm")
    expect(dialog.className).toContain("rounded-lg")
    expect(dialog.className).toContain("shadow-lg")
    expect(dialog.className).not.toContain("rounded-2xl")
    expect(dialog.querySelector('[data-slot="dialog-tide-line"]')).toBeTruthy()
    expect(getByRole("button", { name: "Close" }).className).toContain("size-11")
    expect(getByRole("button", { name: "Close" }).className).toContain("md:size-9")
    expect(getByRole("button", { name: "Close" }).className).toContain("rounded-md")

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

  // The provider records a failed login in its own error state, which rebuilt
  // clearError; the dialog reset effect depends on clearError, so it re-ran and
  // wiped the message the moment it was set.
  it("keeps the wrong-password message on screen after a rejected sign-in", async () => {
    const { findByTestId, getByLabelText, getByRole } = render(
      <AuthProvider baseUrl="https://api.test" adapter={rejectingAdapter("UserBadCredentialsError")}>
        <AccountDialog open onOpenChange={vi.fn()} />
      </AuthProvider>,
    )

    fireEvent.change(getByLabelText("Email"), { target: { value: "someone@example.com" } })
    fireEvent.change(getByLabelText("Password"), { target: { value: "wrong-password" } })
    fireEvent.click(getByRole("button", { name: "Sign in" }))

    const alert = await findByTestId("account-dialog-error")
    expect(alert.textContent).toBe("Incorrect email or password.")
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(getByRole("alert").textContent).toBe("Incorrect email or password.")
  })
})
