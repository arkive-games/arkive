// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MarkerPopupCard } from "./MarkerPopupCard"

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, "clipboard")
  vi.restoreAllMocks()
})

function stubClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
}

const positionCopy = {
  value: "(73, -485, -1)",
  copyLabel: "Copy position",
  copiedLabel: "Copied",
  failedLabel: "Copy failed",
}

describe("MarkerPopupCard position copy", () => {
  it("renders description text only when the marker has one", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <MarkerPopupCard name="Small Settlement" />,
    )
    expect(queryByTestId("marker-description")).toBeNull()

    rerender(<MarkerPopupCard name="Small Settlement" description="A quiet fast-travel point." />)
    expect(getByTestId("marker-description").textContent).toBe("A quiet fast-travel point.")

    rerender(<MarkerPopupCard name="Small Settlement" description="   " />)
    expect(queryByTestId("marker-description")).toBeNull()
  })

  it("copies the exact displayed coordinate and confirms success", async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
    stubClipboard(writeText)
    const { getByTestId } = render(
      <MarkerPopupCard
        name="Small Settlement"
        positionLabel="Position"
        positionValue={positionCopy.value}
        positionCopy={positionCopy}
      />,
    )

    fireEvent.click(getByTestId("marker-position-copy"))

    expect(writeText).toHaveBeenCalledWith(positionCopy.value)
    await waitFor(() => expect(getByTestId("marker-position-copy").textContent).toContain("Copied"))
  })

  it("shows a failure state when clipboard access is rejected", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { getByTestId } = render(
      <MarkerPopupCard
        name="Small Settlement"
        positionLabel="Position"
        positionValue={positionCopy.value}
        positionCopy={positionCopy}
      />,
    )

    fireEvent.click(getByTestId("marker-position-copy"))

    await waitFor(() => expect(getByTestId("marker-position-copy").textContent).toContain("Copy failed"))
  })
})
