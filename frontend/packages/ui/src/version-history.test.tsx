// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { VersionHistory } from "./version-history"
import type { ResolvedEntry } from "./changelog"

afterEach(cleanup)

const SHA_A = "0123456789abcdef0123456789abcdef01234567"
const SHA_B = "89abcdef0123456789abcdef0123456789abcdef"
const REPO = "https://github.com/arkive-games/arkive"

const ENTRIES: ResolvedEntry[] = [
  {
    version: "1.1.0",
    date: "2026-07-02",
    commit: SHA_B,
    changes: [
      { kind: "feature", text: "Added a wiki" },
      { kind: "fix", text: "Fixed the sidebar" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-01",
    commit: SHA_A,
    changes: [{ kind: "improvement", text: "Rebuilt" }],
  },
]

describe("VersionHistory", () => {
  it("renders one section per version, newest first", () => {
    render(<VersionHistory entries={ENTRIES} />)
    const sections = screen.getAllByTestId("changelog-entry")
    expect(sections).toHaveLength(2)
    expect(sections[0].getAttribute("data-version")).toBe("1.1.0")
    expect(sections[1].getAttribute("data-version")).toBe("1.0.0")
  })

  it("shows the version number and date", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.getByText("v1.1.0")).toBeTruthy()
    expect(screen.getByText("2026-07-02")).toBeTruthy()
  })

  it("marks only the newest entry as current", () => {
    render(<VersionHistory entries={ENTRIES} labels={{ current: "Current" }} />)
    expect(screen.getAllByText("Current")).toHaveLength(1)
    expect(screen.getAllByTestId("changelog-entry")[0].textContent).toContain("Current")
  })

  it("omits the current badge when no label is injected", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.queryByTestId("changelog-current")).toBeNull()
  })

  it("renders every change with its injected kind label", () => {
    render(
      <VersionHistory
        entries={ENTRIES}
        labels={{ kinds: { feature: "New", fix: "Fixed", improvement: "Improved" } }}
      />,
    )
    expect(screen.getByText("Added a wiki")).toBeTruthy()
    expect(screen.getByText("Fixed the sidebar")).toBeTruthy()
    expect(screen.getByText("New")).toBeTruthy()
    expect(screen.getByText("Fixed")).toBeTruthy()
    expect(screen.getByText("Improved")).toBeTruthy()
  })

  it("falls back to the raw kind when no label is injected", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.getByText("feature")).toBeTruthy()
  })

  it("links a version to the compare range against the previous release", () => {
    render(<VersionHistory entries={ENTRIES} repoUrl={REPO} />)
    expect(screen.getByText("v1.1.0").closest("a")?.getAttribute("href")).toBe(
      `${REPO}/compare/${SHA_A}...${SHA_B}`,
    )
  })

  it("links the oldest version to its single commit", () => {
    render(<VersionHistory entries={ENTRIES} repoUrl={REPO} />)
    expect(screen.getByText("v1.0.0").closest("a")?.getAttribute("href")).toBe(
      `${REPO}/commit/${SHA_A}`,
    )
  })

  it("shows the abbreviated sha for each version", () => {
    render(<VersionHistory entries={ENTRIES} repoUrl={REPO} />)
    expect(screen.getByText(SHA_B.slice(0, 7))).toBeTruthy()
    expect(screen.getByText(SHA_A.slice(0, 7))).toBeTruthy()
  })

  // One segment per gap between markers: the timeline terminates at the last
  // entry rather than trailing off past it.
  it("connects the markers with one spine segment per gap", () => {
    render(<VersionHistory entries={ENTRIES} />)
    expect(screen.getAllByTestId("changelog-spine")).toHaveLength(ENTRIES.length - 1)
  })

  it("draws no spine for a single entry", () => {
    render(<VersionHistory entries={[ENTRIES[0]]} />)
    expect(screen.queryAllByTestId("changelog-spine")).toHaveLength(0)
  })

  it("renders the empty state for no entries", () => {
    render(<VersionHistory entries={[]} labels={{ empty: "Nothing yet" }} />)
    expect(screen.getByText("Nothing yet")).toBeTruthy()
    expect(screen.queryAllByTestId("changelog-entry")).toHaveLength(0)
  })
})
