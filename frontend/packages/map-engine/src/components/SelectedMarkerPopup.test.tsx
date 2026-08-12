// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { GameMapMeta } from "@gamemap/data-contract"
import type { EngineMarker } from "../engineTypes.ts"
import SelectedMarkerPopup from "./SelectedMarkerPopup.tsx"

vi.mock("react-leaflet", () => ({
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="leaflet-popup">{children}</div>,
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const map = {
  width: 1024,
  height: 1024,
} as GameMapMeta

const marker = {
  id: "marker-1",
  subtype: "boss",
  category: "boss",
  x: 200,
  y: 300,
  localizedName: "Kingpaca",
  subtypeLabel: "Field boss",
  images: [],
  contributors: [],
} as EngineMarker

describe("SelectedMarkerPopup", () => {
  it("does not mount a Leaflet popup when the app uses a separate detail surface", () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        <SelectedMarkerPopup
          map={map}
          marker={marker}
          onSelectMarker={vi.fn()}
          renderPopupContent={() => null}
        />,
      )
    })

    expect(container.querySelector('[data-testid="leaflet-popup"]')).toBeNull()
  })
})
