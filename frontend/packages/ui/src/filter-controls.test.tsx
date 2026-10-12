// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FilterChip, FilterRow, SearchInput, toggleValue } from "./filter-controls"

afterEach(cleanup)

describe("filter controls", () => {
  it("toggles a value in and out of a selection", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"])
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"])
  })

  it("marks a chip active and keeps the variant's own styling", () => {
    render(<FilterChip variant="accent" active onClick={() => {}}>Fire</FilterChip>)
    const chip = screen.getByRole("button", { name: "Fire" })
    expect(chip.getAttribute("aria-pressed")).toBe("true")
    expect(chip.className).toContain("min-h-8")
    render(<FilterChip variant="pill" active={false} onClick={() => {}}>Water</FilterChip>)
    expect(screen.getByRole("button", { name: "Water" }).className).toContain("rounded-full")
  })

  it("lays a labelled row out inline or in a fixed label column", () => {
    const { container, rerender } = render(<FilterRow label="Element"><span>chip</span></FilterRow>)
    expect(container.firstElementChild!.className).toContain("flex-wrap")
    rerender(<FilterRow layout="column" label="Element"><span>chip</span></FilterRow>)
    expect(container.firstElementChild!.className).toContain("items-start")
    expect(container.querySelector("span")!.className).toContain("w-16")
  })

  it("names the search box after its visible caption when it has one", () => {
    const { rerender } = render(
      <SearchInput value="" onChange={() => {}} placeholder="placeholder text" caption="Search graces" />,
    )
    // The caption is on screen, so it -- not the placeholder -- names the box.
    expect(screen.getByLabelText("Search graces").getAttribute("aria-label")).toBe("Search graces")
    render(<SearchInput value="" onChange={() => {}} placeholder="placeholder text" clearOnEscape />)
    expect(screen.getByLabelText("placeholder text")).toBeTruthy()
    rerender(<SearchInput value="" onChange={() => {}} placeholder="p" label="Explicit name" />)
    expect(screen.getByLabelText("Explicit name")).toBeTruthy()
  })
})
