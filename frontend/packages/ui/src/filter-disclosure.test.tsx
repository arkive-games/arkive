// @vitest-environment jsdom
import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FilterDisclosure } from "./filter-disclosure"

afterEach(cleanup)

function body() {
  return screen.getByText("chips").parentElement!
}

describe("FilterDisclosure", () => {
  it("starts expanded and collapses the body on phones only", () => {
    render(<FilterDisclosure label="Filters"><span>chips</span></FilterDisclosure>)
    const toggle = screen.getByTestId("filter-disclosure-toggle")
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.className).toContain("md:hidden")
    expect(body().className).not.toContain("hidden")

    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    // Hidden below md, always visible from md up.
    expect(body().className).toContain("hidden")
    expect(body().className).toContain("md:block")
    expect(toggle.getAttribute("aria-controls")).toBe(body().id)
  })

  it("keeps the controls mounted while collapsed so their state survives", () => {
    function Search() {
      const [value, setValue] = useState("")
      return <input aria-label="search" value={value} onChange={(e) => setValue(e.target.value)} />
    }
    render(<FilterDisclosure label="Filters"><Search /></FilterDisclosure>)
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "abc" } })
    const toggle = screen.getByTestId("filter-disclosure-toggle")
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect((screen.getByLabelText("search") as HTMLInputElement).value).toBe("abc")
  })

  it("dots the toggle while a filter is active and shows the summary", () => {
    render(<FilterDisclosure label="Filters" active summary="12 results"><span>chips</span></FilterDisclosure>)
    expect(screen.getByTestId("filter-disclosure-active-dot")).toBeTruthy()
    expect(screen.getByText("12 results")).toBeTruthy()
  })

  it("supports controlled state and per-state accessible names", () => {
    const calls: boolean[] = []
    render(
      <FilterDisclosure label="Filters" expanded={false} onExpandedChange={(v) => calls.push(v)} expandLabel="Show" collapseLabel="Hide">
        <span>chips</span>
      </FilterDisclosure>,
    )
    const toggle = screen.getByTestId("filter-disclosure-toggle")
    expect(toggle.getAttribute("aria-label")).toBe("Show")
    fireEvent.click(toggle)
    expect(calls).toEqual([true])
    // Still controlled: the parent did not flip it.
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })
})
