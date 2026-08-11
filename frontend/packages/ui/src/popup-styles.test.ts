import { describe, expect, it } from "vitest"

import {
  FLOATING_SURFACE_CLASS,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  MODAL_OVERLAY_CLASS,
  MODAL_SURFACE_CLASS,
  POPUP_CLOSE_CONTROL_CLASS,
} from "./popup-styles"

describe("popup style contracts", () => {
  it.each([
    ["floating", FLOATING_SURFACE_CLASS],
    ["menu", MENU_CONTENT_CLASS],
    ["modal", MODAL_SURFACE_CLASS],
  ])("uses the shared surface geometry for %s surfaces", (_, className) => {
    expect(className).toContain("rounded-lg")
    expect(className).toContain("border")
    expect(className).toContain("shadow-lg")
  })

  it("keeps menu rows aligned across popup implementations", () => {
    for (const token of ["min-h-11", "rounded-md", "px-3", "text-sm", "font-medium"]) {
      expect(MENU_ITEM_CLASS).toContain(token)
    }
    expect(MENU_ITEM_CLASS).toContain("focus-visible:ring-ring")
    expect(MENU_ITEM_CLASS).toContain("aria-disabled:pointer-events-none")
    expect(MENU_ITEM_CLASS).not.toContain("data-[disabled]:pointer-events-none")
  })

  it("uses responsive geometry and shared focus for icon close controls", () => {
    expect(POPUP_CLOSE_CONTROL_CLASS).toContain("size-11")
    expect(POPUP_CLOSE_CONTROL_CLASS).toContain("md:size-9")
    expect(POPUP_CLOSE_CONTROL_CLASS).toContain("rounded-md")
    expect(POPUP_CLOSE_CONTROL_CLASS).toContain("focus-visible:ring-ring")
  })

  it("uses one overlay treatment for modal surfaces", () => {
    expect(MODAL_OVERLAY_CLASS).toBe("bg-black/50")
  })
})
