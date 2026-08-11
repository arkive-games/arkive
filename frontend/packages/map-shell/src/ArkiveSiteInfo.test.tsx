// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  ArkiveSiteInfo,
  platformUpdatesUrl,
  type ArkiveSiteInfoStrings,
} from "./ArkiveSiteInfo"

afterEach(cleanup)

const strings: ArkiveSiteInfoStrings = {
  aboutTitle: "About this site",
  introTemplate: "Built by {arkive} as an unofficial {game} map and database.",
  disclaimerTemplate: "Not affiliated with {developer}. {game} belongs to {developer}.",
  versionTitle: "Version updates",
  viewVersionTemplate: "View version {version}",
  feedbackTitle: "Community and feedback",
  feedbackHint: "Use the feedback group below.",
}

const feedbackGroup = {
  label: "Feedback QQ group",
  number: "1091411026",
  copyLabel: "Copy",
  copiedLabel: "Copied",
}

const defaultProps = {
  strings,
  arkiveName: "Arkive",
  arkiveHomeUrl: "https://tc-imba.com",
  gameName: "Palworld",
  developerName: "Pocketpair, Inc.",
  version: "1.2.3",
  gameUpdatesUrl: "/changelog",
  feedbackGroup,
}

describe("ArkiveSiteInfo", () => {
  it("links Arkive, emphasizes owned names, and omits template braces", () => {
    const { container, getByRole, getAllByText } = render(<ArkiveSiteInfo {...defaultProps} />)

    expect(getByRole("link", { name: "Arkive" }).getAttribute("href")).toBe("https://tc-imba.com")
    expect(getAllByText("Palworld").every((node) => node.tagName === "STRONG")).toBe(true)
    expect(getAllByText("Pocketpair, Inc.").every((node) => node.tagName === "STRONG")).toBe(true)
    expect(container.textContent).not.toMatch(/[{}]/)
  })

  it("links to the game history and the one shared platform history", () => {
    const { getByTestId } = render(
      <ArkiveSiteInfo
        {...defaultProps}
        arkiveHomeLinkProps={{ target: "_blank", rel: "noopener noreferrer" }}
      />,
    )

    expect(getByTestId("site-info-game-updates-link").getAttribute("href")).toBe("/changelog")
    expect(getByTestId("site-info-game-updates-link").textContent).toBe("View version 1.2.3")
    expect(getByTestId("site-info-platform-updates-link").getAttribute("href")).toBe(
      "https://tc-imba.com#updates",
    )
    expect(getByTestId("site-info-platform-updates-link").getAttribute("target")).toBe("_blank")
  })

  it("replaces an existing home hash when building the platform history link", () => {
    expect(platformUpdatesUrl("https://tc-imba.com#top")).toBe("https://tc-imba.com#updates")
    expect(platformUpdatesUrl("/toy/arkive/index.html")).toBe("/toy/arkive/index.html#updates")
  })

  it("always renders the shared feedback group after game contact content", () => {
    const { getByText, getByTestId } = render(
      <ArkiveSiteInfo {...defaultProps} gameContact={<p>Game-specific Discord</p>} />,
    )

    expect(getByText("Game-specific Discord")).toBeTruthy()
    expect(getByText("Feedback QQ group")).toBeTruthy()
    expect(getByTestId("site-info-group-number").textContent).toBe("1091411026")
  })
})
