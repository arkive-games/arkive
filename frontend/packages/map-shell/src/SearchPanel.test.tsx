// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { SearchOptions } from "minisearch"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SearchPanel, type SearchField, type SearchItem } from "./SearchPanel"

afterEach(cleanup)

const labels = {
  search: "Search",
  placeholder: "Search quests, NPCs, items, or map markers",
  resultsCount: (n: number) => `${n} results`,
  unnamed: "Unnamed",
  noDescription: "No description",
  exactNumericMatches: (value: number) => `No.${value}`,
  nearbyNumericMatches: (value: number) => `Breeding Power ≈ ${value}`,
}

// Palworld keeps explicit Paldeck lookup available through a `No.123` query.
const palworldPaldeckLookup = (q: string): SearchOptions | undefined =>
  /^no\.?\s*\d+[a-z]?$/i.test(q)
    ? { fields: ["idLabel"], prefix: false, fuzzy: false }
    : undefined

type Overrides = {
  searchFields?: SearchField[]
  resolveSearchOptions?: (query: string) => SearchOptions | undefined
  searchOptions?: SearchOptions
  resultAside?: (item: SearchItem) => string | undefined
  floatingPlacement?: "right" | "center"
}

function renderSearchPanel(items: SearchItem[], over: Overrides = {}) {
  return render(
    <SearchPanel
      items={items}
      labels={labels}
      onFlyTo={vi.fn()}
      onSelect={vi.fn()}
      searchFields={over.searchFields ?? ["name", "description", "idLabel"]}
      resolveSearchOptions={over.resolveSearchOptions}
      searchOptions={over.searchOptions}
      resultAside={over.resultAside}
      floatingPlacement={over.floatingPlacement}
    />,
  )
}

// Type the query, then click the trailing "search now" button that bypasses the
// input debounce (the last button labelled with the search text).
function searchFor(query: string) {
  fireEvent.change(screen.getByTestId("marker-search"), { target: { value: query } })
  const buttons = screen.getAllByRole("button", { name: labels.search })
  fireEvent.click(buttons[buttons.length - 1])
}

const item = (over: Partial<SearchItem> & Pick<SearchItem, "id" | "name">): SearchItem => ({
  x: 0,
  y: 0,
  ...over,
})

const palworld = {
  searchFields: ["name", "idLabel"] as SearchField[],
  resolveSearchOptions: palworldPaldeckLookup,
  searchOptions: { combineWith: "AND" as const, fuzzy: false },
}

describe("SearchPanel", () => {
  it("keeps the legacy right placement as the floating default", () => {
    const { getByTestId } = renderSearchPanel([])
    const root = getByTestId("search-panel")

    expect(root.className).toContain("right-3")
    expect(root.className).toContain("w-[290px]")
  })

  it("applies the shared responsive centered floating geometry", () => {
    const { getByTestId } = renderSearchPanel([], { floatingPlacement: "center" })
    const root = getByTestId("search-panel")

    expect(root.className).toContain("left-1/2")
    expect(root.className).toContain("min-w-72")
    expect(root.className).toContain("max-w-[34rem]")
    expect(root.className).not.toContain("right-3")
  })

  it("renders a descriptive placeholder independently from the submit label", () => {
    renderSearchPanel([])

    expect(screen.getByPlaceholderText(labels.placeholder)).toBeTruthy()
    expect(screen.getByTestId("search-submit").textContent).toBe(labels.search)
    expect(screen.queryByTestId("search-scope-toggle")).toBeNull()
  })

  it("matches idLabel values in search queries", () => {
    renderSearchPanel([
      item({ id: "pal-037", name: "Catalog Pal", description: "Forest runner", idLabel: "No.037" }),
    ])

    searchFor("No.037")

    expect(screen.getByText("No.037")).toBeTruthy()
    expect(screen.getByText("Catalog Pal")).toBeTruthy()
  })

  it("searches only the indexed fields", () => {
    // description is not indexed here, so a term only in description misses.
    renderSearchPanel(
      [
        item({ id: "a", name: "Lamball", description: "Lv.22" }),
        item({ id: "b", name: "Cattiva", description: "Lv.22" }),
      ],
      { searchFields: ["name"] },
    )

    searchFor("Lv")

    expect(screen.queryByText("Lamball")).toBeNull()
    expect(screen.queryByText("Cattiva")).toBeNull()
  })

  it("without a resolver, a numeric query uses default prefix matching", () => {
    // No app rule → generic behavior: "12" prefix-matches the "123" id token.
    renderSearchPanel([
      item({ id: "pal-123", name: "Prefix Pal", idLabel: "No.123" }),
    ])

    searchFor("12")

    expect(screen.getByText("Prefix Pal")).toBeTruthy()
  })

  it("orders numeric proximity results by distance and deduplicates species", () => {
    renderSearchPanel([
      item({
        id: "exact-spawn-1",
        name: "Exact Pal",
        proximityValue: 1230,
        proximityKey: "exact",
        proximityOrder: 2,
        proximityLabel: "Breeding Power: 1230",
      }),
      item({
        id: "exact-spawn-2",
        name: "Exact Pal duplicate",
        proximityValue: 1230,
        proximityKey: "exact",
        proximityOrder: 2,
      }),
      item({ id: "high", name: "High Pal", proximityValue: 1240, proximityOrder: 3 }),
      item({ id: "low", name: "Low Pal", proximityValue: 1220, proximityOrder: 1 }),
      item({ id: "quest", name: "Quest 1230" }),
    ])

    searchFor("1230")

    const resultText = Array.from(
      screen.getByTestId("search-results").querySelectorAll("button"),
      (button) => button.textContent,
    )
    expect(resultText).toHaveLength(3)
    expect(resultText[0]).toContain("Exact Pal")
    expect(resultText[1]).toContain("Low Pal")
    expect(resultText[2]).toContain("High Pal")
    expect(screen.queryByText("Exact Pal duplicate")).toBeNull()
    expect(screen.queryByText("Quest 1230")).toBeNull()
    expect(screen.getByText("Breeding Power: 1230")).toBeTruthy()
    expect(screen.getByText("Breeding Power ≈ 1230")).toBeTruthy()
  })

  it("pins an exact numeric id in its own group before proximity results", () => {
    renderSearchPanel([
      item({
        id: "catalog-spawn-1",
        name: "Catalog Pal",
        idLabel: "No.123",
        numericId: 123,
        proximityValue: 500,
        proximityKey: "catalog",
        proximityOrder: 123,
      }),
      item({
        id: "catalog-spawn-2",
        name: "Catalog Pal duplicate",
        idLabel: "No.123",
        numericId: 123,
        proximityValue: 500,
        proximityKey: "catalog",
        proximityOrder: 123,
      }),
      item({
        id: "power",
        name: "Exact Power Pal",
        idLabel: "No.007",
        numericId: 7,
        proximityValue: 123,
        proximityOrder: 7,
      }),
      item({ id: "near", name: "Near Power Pal", proximityValue: 124 }),
    ])

    searchFor("123")

    const resultText = Array.from(
      screen.getByTestId("search-results").querySelectorAll("button"),
      (button) => button.textContent,
    )
    expect(resultText).toHaveLength(3)
    expect(resultText[0]).toContain("Catalog Pal")
    expect(resultText[1]).toContain("Exact Power Pal")
    expect(resultText[2]).toContain("Near Power Pal")
    expect(screen.queryByText("Catalog Pal duplicate")).toBeNull()
    expect(screen.getAllByTestId("search-result-group").map((group) => group.textContent))
      .toEqual(["No.123", "Breeding Power ≈ 123"])
  })

  it("with the Palworld resolver, an explicit No. query is an exact id lookup", () => {
    renderSearchPanel(
      [
        item({ id: "pal-123", name: "Exact Pal", idLabel: "No.123" }),
        item({ id: "pal-231", name: "Reorder Pal", idLabel: "No.231" }), // shares digits
        item({ id: "pal-012", name: "Padded Pal", idLabel: "No.012" }), // shares digits
        item({ id: "pal-124", name: "Neighbour Pal", idLabel: "No.124" }), // edit-distance 1
      ],
      palworld,
    )

    searchFor("No.123")

    expect(screen.getByText("Exact Pal")).toBeTruthy()
    expect(screen.queryByText("Reorder Pal")).toBeNull()
    expect(screen.queryByText("Padded Pal")).toBeNull()
    expect(screen.queryByText("Neighbour Pal")).toBeNull()
  })

  it("matches a zero-padded id token with an unpadded query", () => {
    renderSearchPanel([item({ id: "pal-011", name: "Padded Pal", idLabel: "No.011" })], palworld)

    searchFor("No.11")

    expect(screen.getByText("Padded Pal")).toBeTruthy()
  })

  it("explicit id lookup ignores the prefix range and levels embedded in names", () => {
    renderSearchPanel(
      [
        item({ id: "pal-011", name: "Exact Pal", idLabel: "No.011" }),
        item({ id: "pal-110", name: "Prefix Pal", idLabel: "No.110" }), // 11X, must not match "11"
        item({ id: "pal-a", name: "Alpha Pal Lv.11", idLabel: "No.099" }), // level in name
      ],
      palworld,
    )

    searchFor("No.11")

    expect(screen.getByText("Exact Pal")).toBeTruthy()
    expect(screen.queryByText("Prefix Pal")).toBeNull()
    expect(screen.queryByText("Alpha Pal Lv.11")).toBeNull()
  })

  it("finds a suffixed id by its number", () => {
    renderSearchPanel([item({ id: "pal-111b", name: "Variant Pal", idLabel: "No.111B" })], palworld)

    searchFor("No.111")

    expect(screen.getByText("Variant Pal")).toBeTruthy()
  })

  it("still matches CJK names per character", () => {
    renderSearchPanel([
      item({ id: "pal-1", name: "皮皮鸡" }),
      item({ id: "pal-2", name: "冰企鹅" }),
    ])

    searchFor("皮鸡")

    expect(screen.getByText("皮皮鸡")).toBeTruthy()
  })

  it("default OR-combine surfaces pals sharing a single CJK character", () => {
    // Documents the problem searchOptions solves: "云海鹿" tokenizes to 云/海/鹿
    // and OR matches anything containing any one of them.
    renderSearchPanel(
      [
        item({ id: "t", name: "云海鹿" }),
        item({ id: "sea", name: "海獭" }), // shares 海
        item({ id: "deer", name: "岩角鹿" }), // shares 鹿
      ],
      { searchFields: ["name"] },
    )

    searchFor("云海鹿")

    expect(screen.getByText("云海鹿")).toBeTruthy()
    expect(screen.getByText("海獭")).toBeTruthy()
    expect(screen.getByText("岩角鹿")).toBeTruthy()
  })

  it("searchOptions combineWith:AND requires every query token to match", () => {
    renderSearchPanel(
      [
        item({ id: "t", name: "云海鹿" }),
        item({ id: "sea", name: "海獭" }), // shares 海 only
        item({ id: "deer", name: "岩角鹿" }), // shares 鹿 only
      ],
      { searchFields: ["name"], searchOptions: { combineWith: "AND" } },
    )

    searchFor("云海鹿")

    expect(screen.getByText("云海鹿")).toBeTruthy()
    expect(screen.queryByText("海獭")).toBeNull()
    expect(screen.queryByText("岩角鹿")).toBeNull()
  })

  it("combineWith:AND still matches a partial CJK query via prefix", () => {
    renderSearchPanel(
      [
        item({ id: "t", name: "云海鹿" }),
        item({ id: "sea", name: "海獭" }),
      ],
      { searchFields: ["name"], searchOptions: { combineWith: "AND" } },
    )

    searchFor("云海")

    expect(screen.getByText("云海鹿")).toBeTruthy()
    expect(screen.queryByText("海獭")).toBeNull()
  })

  it("a per-query resolver still overrides the searchOptions base", () => {
    // Base sets AND, but the Paldeck resolver takes over for an explicit query.
    renderSearchPanel(
      [
        item({ id: "pal-123", name: "Exact Pal", idLabel: "No.123" }),
        item({ id: "pal-124", name: "Neighbour Pal", idLabel: "No.124" }),
      ],
      { ...palworld, searchOptions: { combineWith: "AND", fuzzy: false } },
    )

    searchFor("No.123")

    expect(screen.getByText("Exact Pal")).toBeTruthy()
    expect(screen.queryByText("Neighbour Pal")).toBeNull()
  })

  it("renders an idLabel badge only for items that provide one", () => {
    const { container } = renderSearchPanel([
      item({ id: "pal-037", name: "Catalog Pal", description: "Forest runner", idLabel: "No.037" }),
      item({ id: "pal-038", name: "Label-free Pal", description: "No catalog label" }),
    ])

    searchFor("Pal")

    expect(screen.getByText("Label-free Pal")).toBeTruthy()
    expect(
      Array.from(container.querySelectorAll("span.font-mono")).map((b) => b.textContent),
    ).toEqual(["No.037"])
  })

  it("renders a resultAside line when provided", () => {
    renderSearchPanel([item({ id: "m1", name: "Zone Marker" })], {
      searchFields: ["name"],
      resultAside: () => "Verteron",
    })

    searchFor("Zone")

    expect(screen.getByText("Zone Marker")).toBeTruthy()
    expect(screen.getByText("Verteron")).toBeTruthy()
  })
})
