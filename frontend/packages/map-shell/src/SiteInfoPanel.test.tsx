// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SiteInfoPanel } from "./SiteInfoPanel"

afterEach(() => {
  cleanup()
  // A stub set by one test must not leak into the next — future tests in
  // this file should not silently inherit whatever the previous test left.
  Reflect.deleteProperty(navigator, "clipboard")
})

const sections = [
  { title: "About", body: <p>An unofficial fan site.</p> },
  { title: "Contact", body: <p>Say hello.</p> },
]

const group = {
  label: "QQ group",
  number: "1091411026",
  copyLabel: "Copy",
  copiedLabel: "Copied",
}

/** Replace the Clipboard API for one test; jsdom's own support is unreliable. */
function stubClipboard(writeText: ((s: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  })
}

describe("SiteInfoPanel", () => {
  it("renders every section title and body", () => {
    stubClipboard(undefined)
    const { getByText } = render(<SiteInfoPanel sections={sections} />)
    expect(getByText("About")).toBeTruthy()
    expect(getByText("An unofficial fan site.")).toBeTruthy()
    expect(getByText("Contact")).toBeTruthy()
    expect(getByText("Say hello.")).toBeTruthy()
  })

  it("omits the feedback card when no group is given", () => {
    stubClipboard(undefined)
    const { queryByTestId } = render(<SiteInfoPanel sections={sections} />)
    expect(queryByTestId("site-info-group-number")).toBeNull()
    expect(queryByTestId("site-info-copy")).toBeNull()
  })

  it("shows the group number when a group is given", () => {
    stubClipboard(undefined)
    const { getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    expect(getByTestId("site-info-group-number").textContent).toBe("1091411026")
  })

  it("hides the copy button when the Clipboard API is unavailable", () => {
    stubClipboard(undefined)
    const { queryByTestId, getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    // The number is still there to select by hand — only the button is gone.
    expect(getByTestId("site-info-group-number")).toBeTruthy()
    expect(queryByTestId("site-info-copy")).toBeNull()
  })

  it("copies the number and swaps the button label", async () => {
    const writeText = vi.fn<(s: string) => Promise<void>>(() => Promise.resolve())
    stubClipboard(writeText)
    const { getByTestId, getByRole } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    // Accessible name after the id/aria-labelledby wiring is "Copy QQ group
    // 1091411026" (own label + group label + number) — go through the role
    // query so nothing can silently drop the label from the accessible name.
    const button = getByRole("button", { name: "Copy QQ group 1091411026" })
    expect(button.textContent).toContain("Copy")
    fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith("1091411026")
    await waitFor(() => expect(getByTestId("site-info-copy").textContent).toContain("Copied"))
  })

  it("does not claim success when the clipboard write is rejected", async () => {
    const writeText = vi.fn<(s: string) => Promise<void>>(() => Promise.reject(new Error("denied")))
    stubClipboard(writeText)
    const { getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    fireEvent.click(getByTestId("site-info-copy"))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(getByTestId("site-info-copy").textContent).toContain("Copy")
    expect(getByTestId("site-info-copy").textContent).not.toContain("Copied")
  })

  it("reverts the label once the copied window elapses", async () => {
    vi.useFakeTimers()
    try {
      stubClipboard(vi.fn(() => Promise.resolve()))
      const { getByTestId } = render(<SiteInfoPanel sections={sections} feedbackGroup={group} />)
      fireEvent.click(getByTestId("site-info-copy"))
      await act(() => vi.advanceTimersByTimeAsync(0)) // flush the writeText promise
      expect(getByTestId("site-info-copy").textContent).toContain("Copied")
      await act(() => vi.advanceTimersByTimeAsync(2000))
      expect(getByTestId("site-info-copy").textContent).toContain("Copy")
    } finally {
      vi.useRealTimers()
    }
  })

  it("extends the copied window on a second click instead of inheriting the first timer", async () => {
    vi.useFakeTimers()
    try {
      stubClipboard(vi.fn(() => Promise.resolve()))
      const { getByTestId } = render(<SiteInfoPanel sections={sections} feedbackGroup={group} />)
      const button = getByTestId("site-info-copy")
      fireEvent.click(button)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(getByTestId("site-info-copy").textContent).toContain("Copied")

      await act(() => vi.advanceTimersByTimeAsync(1900))
      fireEvent.click(getByTestId("site-info-copy"))
      await act(() => vi.advanceTimersByTimeAsync(0))

      await act(() => vi.advanceTimersByTimeAsync(200))
      // With the bug (setCopied(true) as a no-op re-copy), the first timer
      // fired at 2000ms and this would already read "Copy".
      expect(getByTestId("site-info-copy").textContent).toContain("Copied")
    } finally {
      vi.useRealTimers()
    }
  })
})
