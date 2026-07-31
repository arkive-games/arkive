// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Hint } from "./hint"
import { TooltipProvider } from "./tooltip"
import { MOBILE_MAX_WIDTH } from "./use-is-mobile"

afterEach(cleanup)

/**
 * `useIsMobile` reads `window.matchMedia`, which jsdom does not implement at
 * all, so every test here has to install one. The stub parses the max-width out
 * of the query instead of hard-coding `matches`, so a future change to the
 * breakpoint query cannot make these tests silently assert the wrong side of it.
 */
function setViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  }) as typeof window.matchMedia
}

const DESKTOP = MOBILE_MAX_WIDTH + 1
const PHONE = 390

function renderHint(ui: React.ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("Hint on desktop", () => {
  it("wires the child up as a hover tooltip trigger and opens no sheet", () => {
    setViewportWidth(DESKTOP)
    renderHint(
      <Hint content="Mutation only appears from breeding." title="Mutation">
        <span data-testid="badge">Mutation</span>
      </Hint>,
    )
    const badge = screen.getByTestId("badge")
    // `asChild` merges the trigger onto the caller's element: the data-slot and
    // the tooltip state land on the very span the call site wrote.
    expect(badge.getAttribute("data-slot")).toBe("tooltip-trigger")
    expect(badge.getAttribute("data-state")).toBe("closed")
    // No touch affordances, and clicking is not a disclosure gesture here.
    expect(badge.getAttribute("role")).toBeNull()
    fireEvent.click(badge)
    expect(screen.queryByTestId("hint-sheet")).toBeNull()
  })
})

describe("Hint on mobile", () => {
  it("opens the bottom sheet when the child is tapped", () => {
    setViewportWidth(PHONE)
    renderHint(
      <Hint content="Mutation only appears from breeding." title="Mutation">
        <span data-testid="badge">Mutation</span>
      </Hint>,
    )
    const badge = screen.getByTestId("badge")
    // The child stays the same element (its testid survives) but becomes a real
    // tap target that is also reachable by keyboard.
    expect(badge.getAttribute("role")).toBe("button")
    expect(badge.getAttribute("tabindex")).toBe("0")
    expect(screen.queryByTestId("hint-sheet")).toBeNull()

    fireEvent.click(badge)
    const sheet = screen.getByTestId("hint-sheet")
    expect(sheet).toBeTruthy()
    // One rung above the z-[3000] Sheet, so a hint opened from inside the mobile
    // filter sheet is not buried by it.
    expect(sheet.className).toContain("z-[3050]")
    expect(screen.getByText("Mutation only appears from breeding.")).toBeTruthy()
    // The heading is visible (not sr-only) and repeats the subject, so the sheet
    // says what it is explaining. Scoped to the sheet: the badge says "Mutation"
    // too, so a bare text query would match both.
    const heading = sheet.querySelector('[data-slot="sheet-title"]')
    expect(heading?.textContent).toBe("Mutation")
    expect(heading?.className).not.toContain("sr-only")
  })

  it("opens on Enter for keyboard users", () => {
    setViewportWidth(PHONE)
    renderHint(
      <Hint content="Explained." title="Subject">
        <span data-testid="badge">badge</span>
      </Hint>,
    )
    fireEvent.keyDown(screen.getByTestId("badge"), { key: "Enter" })
    expect(screen.getByTestId("hint-sheet")).toBeTruthy()
  })

  it("keeps the child's own handler when it is cloned", () => {
    setViewportWidth(PHONE)
    let clicked = 0
    renderHint(
      <Hint content="Explained." title="Subject">
        <span data-testid="badge" onClick={() => (clicked += 1)}>
          badge
        </span>
      </Hint>,
    )
    fireEvent.click(screen.getByTestId("badge"))
    expect(clicked).toBe(1)
    expect(screen.getByTestId("hint-sheet")).toBeTruthy()
  })

  it("leaves an interactive child alone in icon mode and opens from the ⓘ button", () => {
    setViewportWidth(PHONE)
    let toggled = 0
    renderHint(
      <Hint
        content="Only mutation-pool passives."
        title="Mutation"
        mobileTrigger="icon"
        iconTestId="mutation-hint"
      >
        <button type="button" data-testid="chip" onClick={() => (toggled += 1)}>
          Mutation
        </button>
      </Hint>,
    )
    // The chip keeps doing its own job — a filter chip must still filter.
    fireEvent.click(screen.getByTestId("chip"))
    expect(toggled).toBe(1)
    expect(screen.queryByTestId("hint-sheet")).toBeNull()
    expect(screen.getByTestId("chip").getAttribute("role")).toBeNull()

    const icon = screen.getByTestId("mutation-hint")
    // Named from `title` so the package needs no built-in copy of its own.
    expect(icon.getAttribute("aria-label")).toBe("Mutation")
    fireEvent.click(icon)
    expect(screen.getByTestId("hint-sheet")).toBeTruthy()
    expect(toggled).toBe(1)
  })

  it("falls back to an sr-only heading built from the injected srTitle", () => {
    setViewportWidth(PHONE)
    renderHint(
      <Hint content="Explained." srTitle="Details">
        <span data-testid="badge">badge</span>
      </Hint>,
    )
    fireEvent.click(screen.getByTestId("badge"))
    const heading = screen.getByText("Details")
    expect(heading.className).toContain("sr-only")
  })
})
