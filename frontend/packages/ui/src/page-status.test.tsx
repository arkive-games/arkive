// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { NotFoundMessage, PageSkeleton } from "./page-status"
import { useDocumentTitle } from "./use-document-title"

afterEach(cleanup)

function Title({ value }: { value?: string }) {
  useDocumentTitle(value)
  return null
}

describe("page status", () => {
  it("labels the skeleton for assistive tech", () => {
    render(<PageSkeleton label="Loading" />)
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading")
  })

  it("renders a bare message, or a message with its way back", () => {
    const { rerender, container } = render(<NotFoundMessage message="Missing" />)
    expect(container.firstElementChild!.tagName).toBe("P")
    rerender(<NotFoundMessage message="Missing" action={<a href="/x">Back</a>} />)
    expect(screen.getByText("Back").closest("div")!.className).toContain("space-y-3")
  })

  it("sets the document title and ignores a pending one", () => {
    document.title = "Before"
    const { rerender } = render(<Title />)
    expect(document.title).toBe("Before")
    rerender(<Title value="Items - Wiki" />)
    expect(document.title).toBe("Items - Wiki")
  })
})
