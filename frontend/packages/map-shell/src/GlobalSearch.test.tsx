// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GlobalSearch, type GlobalSearchEntry, type GlobalSearchSource } from "./GlobalSearch"

// cmdk scrolls the selected item into view and observes the list's size;
// jsdom has neither layout nor ResizeObserver.
window.HTMLElement.prototype.scrollIntoView = () => {}
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

const labels = {
  button: "Search",
  placeholder: "Search everything…",
  empty: "No results",
  loading: "Loading…",
}

const pals: GlobalSearchEntry[] = [
  { id: "SheepBall", name: "Lamball", idLabel: "No.001" },
  { id: "Alpaca", name: "Melpaca", idLabel: "No.011" },
]
const items: GlobalSearchEntry[] = [{ id: "Wool", name: "Wool" }]

function sources(over?: Partial<Record<"pals" | "items", () => Promise<GlobalSearchEntry[]>>>): GlobalSearchSource[] {
  return [
    { key: "pals", label: "Pals", load: over?.pals ?? (() => Promise.resolve(pals)) },
    { key: "items", label: "Items", load: over?.items ?? (() => Promise.resolve(items)) },
  ]
}

function renderSearch(props?: {
  sources?: GlobalSearchSource[]
  onSelect?: (sourceKey: string, id: string) => void
  lang?: string
}) {
  return render(
    <GlobalSearch
      sources={props?.sources ?? sources()}
      onSelect={props?.onSelect ?? vi.fn()}
      labels={labels}
      lang={props?.lang ?? "en-US"}
      debounceMs={0}
    />,
  )
}

async function openAndType(query: string) {
  fireEvent.click(screen.getByTestId("global-search-button"))
  const input = await screen.findByPlaceholderText(labels.placeholder)
  fireEvent.change(input, { target: { value: query } })
  return input
}

describe("GlobalSearch", () => {
  it("opens on click, loads sources, and finds a prefix match with its group heading", async () => {
    renderSearch()
    await openAndType("Lam")
    expect(await screen.findByText("Lamball")).toBeTruthy()
    expect(screen.getByText("Pals")).toBeTruthy()
    // idLabel chip rendered
    expect(screen.getByText("No.001")).toBeTruthy()
  })

  it("does NOT fuzzy-match a typo'd query", async () => {
    renderSearch()
    await openAndType("Lambell") // edit distance 1 from "Lamball"
    expect(await screen.findByText(labels.empty)).toBeTruthy()
    expect(screen.queryByText("Lamball")).toBeNull()
  })

  it("AND-combines multi-token queries", async () => {
    renderSearch({
      sources: [
        {
          key: "pals",
          label: "Pals",
          load: () =>
            Promise.resolve([
              { id: "a", name: "云海鹿" },
              { id: "b", name: "海豚" },
            ]),
        },
      ],
    })
    await openAndType("云海")
    expect(await screen.findByText("云海鹿")).toBeTruthy()
    expect(screen.queryByText("海豚")).toBeNull() // shares 海 only — OR would match
  })

  it("matches zero-padded id labels by bare number", async () => {
    renderSearch()
    await openAndType("11")
    expect(await screen.findByText("Melpaca")).toBeTruthy() // No.011 → token "11"
  })

  it("selecting a result calls onSelect with source key + entry id and closes", async () => {
    const onSelect = vi.fn()
    renderSearch({ onSelect })
    await openAndType("Wool")
    fireEvent.click(await screen.findByText("Wool"))
    expect(onSelect).toHaveBeenCalledWith("items", "Wool")
    await waitFor(() => expect(screen.queryByPlaceholderText(labels.placeholder)).toBeNull())
  })

  it("tolerates a failing source", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    renderSearch({
      sources: sources({ pals: () => Promise.reject(new Error("boom")) }),
    })
    await openAndType("Wool")
    expect(await screen.findByText("Wool")).toBeTruthy()
    expect(screen.queryByText("Lamball")).toBeNull()
    err.mockRestore()
  })

  it("reloads sources when lang changes", async () => {
    const load = vi.fn(() => Promise.resolve(pals))
    const src: GlobalSearchSource[] = [{ key: "pals", label: "Pals", load }]
    const { rerender } = render(
      <GlobalSearch sources={src} onSelect={vi.fn()} labels={labels} lang="en-US" debounceMs={0} />,
    )
    fireEvent.click(screen.getByTestId("global-search-button"))
    await screen.findByPlaceholderText(labels.placeholder)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender(
      <GlobalSearch sources={src} onSelect={vi.fn()} labels={labels} lang="zh-CN" debounceMs={0} />,
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it("opens via Ctrl+K", async () => {
    renderSearch()
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(await screen.findByPlaceholderText(labels.placeholder)).toBeTruthy()
  })

  it("skips entries with empty names", async () => {
    renderSearch({
      sources: [
        {
          key: "pals",
          label: "Pals",
          load: () => Promise.resolve([{ id: "x", name: "" }, { id: "SheepBall", name: "Lamball" }]),
        },
      ],
    })
    await openAndType("Lam")
    expect(await screen.findByText("Lamball")).toBeTruthy()
  })
})
