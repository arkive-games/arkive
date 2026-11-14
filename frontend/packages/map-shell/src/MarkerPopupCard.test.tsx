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
  it("keeps the popup pointer outside the scrolling content", () => {
    const { getByTestId } = render(<MarkerPopupCard name="Small Settlement" />)
    const card = getByTestId("marker-popup-card")
    const scroll = getByTestId("marker-popup-scroll")

    expect(card.className).toContain("overflow-visible")
    expect(card.className).not.toContain("overflow-y-auto")
    expect(card.className).toContain("max-h-[min(72dvh,32rem)]")
    expect(scroll.className).toContain("min-h-0")
    expect(scroll.className).toContain("overflow-y-auto")
  })

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

  it("copies the exact displayed coordinate without visible feedback", async () => {
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
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(getByTestId("marker-position-copy").getAttribute("aria-label")).toBe(positionCopy.copyLabel)
    expect(getByTestId("marker-position-copy").textContent).toBe("")
  })

  it("keeps the copy action unchanged when clipboard access is rejected", async () => {
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

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(getByTestId("marker-position-copy").getAttribute("aria-label")).toBe(positionCopy.copyLabel)
    expect(getByTestId("marker-position-copy").textContent).toBe("")
  })
})
