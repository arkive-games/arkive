// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BuildInfo } from "./build-info"
import { SiteFooter } from "./site-footer"

afterEach(cleanup)

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
