// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MarkerPopupCard } from "./MarkerPopupCard"

afterEach(cleanup)

describe("MarkerPopupCard", () => {
  it("keeps game-specific content inside the shared marker card hierarchy", () => {
    const { getByTestId, getByText } = render(
      <MarkerPopupCard
        name="Marker name"
        metaLine="Category / Type"
        positionLabel="Position"
        positionValue="12, 34"
        description="Marker description"
      >
        <button type="button">Action</button>
      </MarkerPopupCard>,
    )

    const card = getByTestId("marker-popup-card")
    expect(card.className).toContain("rounded-xl")
    expect(getByText("Marker name").tagName).toBe("H2")
    expect(getByText("Category / Type")).toBeTruthy()
    expect(getByText("Position")).toBeTruthy()
    expect(getByText("12, 34")).toBeTruthy()
    expect(getByText("Action")).toBeTruthy()
  })
})
