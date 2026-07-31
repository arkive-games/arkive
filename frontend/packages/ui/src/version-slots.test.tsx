// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BuildInfo } from "./build-info"
import { SiteFooter } from "./site-footer"
import { VersionHistory } from "./version-history"

afterEach(cleanup)

// A Bilibili toy is a sealed directory on bilibili.com: it cannot reach our
// hosting, and the ICP filing describes our hosting rather than that page. Each
// of these components therefore has to be able to drop its outbound links —
// otherwise the toy ships dead ones. `null` is the "omit" signal.
describe("toy-safe link opt-out", () => {
  it("omits the GitHub icon and the ICP filing when they are null", () => {
    render(<SiteFooter githubUrl={null} icpBeian={null} />)
    expect(screen.queryByTestId("site-footer-github")).toBeNull()
    expect(screen.queryByTestId("site-footer-icp")).toBeNull()
    // The brand line itself stays — inside a toy it points at the portal toy.
    expect(screen.getByTestId("site-footer-home")).toBeTruthy()
  })

  it("keeps both links by default", () => {
    render(<SiteFooter />)
    expect(screen.getByTestId("site-footer-github")).toBeTruthy()
    expect(screen.getByTestId("site-footer-icp")).toBeTruthy()
  })

  it("lets homeLinkProps clear the new-tab default for a same-origin target", () => {
    render(
      <SiteFooter
        homeUrl="/toy/arkive/index.html"
        homeLinkProps={{ target: undefined, rel: undefined }}
      />,
    )
    const link = screen.getByTestId("site-footer-home")
    expect(link.getAttribute("href")).toBe("/toy/arkive/index.html")
    expect(link.getAttribute("target")).toBeNull()
    expect(link.getAttribute("rel")).toBeNull()
  })

  it("renders the build commit as plain text when there is no repo", () => {
    render(<BuildInfo commit="0123456789abcdef" buildTime="1750000000000" repoUrl={null} defaultOpen />)
    const hash = screen.getByText("0123456")
    expect(hash.tagName).toBe("SPAN")
  })

  it("renders version-history versions and hashes as plain text when there is no repo", () => {
    render(
      <VersionHistory
        repoUrl={null}
        entries={[
          { version: "1.2.0", date: "2026-07-31", commit: "0123456789abcdef0123456789abcdef01234567", changes: [] },
        ]}
      />,
    )
    expect(screen.getByText("v1.2.0").closest("a")).toBeNull()
    expect(screen.getByText("0123456").closest("a")).toBeNull()
  })
})

describe("SiteFooter versionLink", () => {
  it("renders the slot when provided", () => {
    render(<SiteFooter versionLink={<a href="/changelog">v1.8.0</a>} />)
    expect(screen.getByText("v1.8.0")).toBeTruthy()
  })

  it("renders nothing extra when omitted", () => {
    render(<SiteFooter />)
    expect(screen.queryByTestId("site-footer-version")).toBeNull()
  })
})

describe("BuildInfo siteVersion", () => {
  it("renders the site-version row with its injected label", () => {
    render(
      <BuildInfo
        commit="0123456789abcdef"
        buildTime="1750000000000"
        defaultOpen
        siteVersion={<a href="/changelog">v1.8.0</a>}
        labels={{ siteVersion: "Site" }}
      />,
    )
    expect(screen.getByText("Site")).toBeTruthy()
    expect(screen.getByText("v1.8.0")).toBeTruthy()
  })

  it("omits the row when no siteVersion is passed", () => {
    render(<BuildInfo commit="0123456789abcdef" buildTime="1750000000000" defaultOpen />)
    expect(screen.queryByText("Version")).toBeNull()
  })
})
