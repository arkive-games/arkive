// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GameMapMeta } from "@gamemap/data-contract"
import type { EngineMarker } from "../engineTypes.ts"
import SelectedMarkerPopup from "./SelectedMarkerPopup.tsx"

const mapContainer = document.createElement("div")
const panBy = vi.fn()
vi.mock("react-leaflet", () => ({
  useMap: () => ({
    getContainer: () => mapContainer,
    latLngToContainerPoint: () => ({ x: 120, y: 240 }),
    panBy,
  }),
  useMapEvents: () => undefined,
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  mapContainer.remove()
  mapContainer.replaceChildren()
  root = null
  container = null
  panBy.mockClear()
})

const map = {
  id: "test-map",
  name: "Test map",
  type: "world",
  tileWidth: 256,
  tileHeight: 256,
  tilesCountX: 4,
  tilesCountY: 4,
  width: 1024,
  height: 1024,
} as unknown as GameMapMeta
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
} as unknown as EngineMarker

function renderPopup(renderPopupContent: () => React.ReactNode) {
  container = document.createElement("div")
  document.body.append(container, mapContainer)
  root = createRoot(container)
  act(() => {
    root?.render(
      <SelectedMarkerPopup map={map} marker={marker} renderPopupContent={renderPopupContent} />,
    )
  })
}

describe("SelectedMarkerPopup", () => {
  it("does not mount an anchor when the app uses a separate detail surface", () => {
    renderPopup(() => null)
    expect(mapContainer.querySelector("[data-marker-detail-anchor]")).toBeNull()
  })

  it("renders app content at the projected marker anchor", () => {
    renderPopup(() => <div>Details</div>)
    const anchor = mapContainer.querySelector<HTMLElement>("[data-marker-detail-anchor]")
    expect(anchor?.style.transform).toBe("translate3d(120px, 240px, 0)")
    expect(anchor?.textContent).toBe("Details")
  })

  it("pans once per selected marker when right-side detail space is insufficient", () => {
    renderPopup(() => <div>Details</div>)
    const anchor = mapContainer.querySelector<HTMLElement>("[data-marker-detail-anchor]")
    act(() => {
      anchor?.dispatchEvent(new CustomEvent("marker-detail-pan", { bubbles: true, detail: { x: 96 } }))
      anchor?.dispatchEvent(new CustomEvent("marker-detail-pan", { bubbles: true, detail: { x: 48 } }))
    })
    expect(panBy).toHaveBeenCalledTimes(1)
    expect(panBy).toHaveBeenCalledWith([96, 0], { animate: false })
  })
})
