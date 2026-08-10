// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ArkiveSiteInfo, type ArkiveSiteInfoStrings } from "./ArkiveSiteInfo"

afterEach(cleanup)

const strings: ArkiveSiteInfoStrings = {
  aboutTitle: "About this site",
  introTemplate: "Built by {arkive} as an unofficial {game} map and database.",
  disclaimerTemplate: "Not affiliated with {developer}. {game} belongs to {developer}.",
  versionTitle: "Version updates",
  viewVersionTemplate: "View version {version}",
  recentUpdatesTitle: "Recent updates",
  noRecentUpdates: "No updates yet.",
  feedbackTitle: "Community and feedback",
  feedbackHint: "Use the feedback group below.",
  close: "Close",
}

const feedbackGroup = {
  label: "Feedback QQ group",
  number: "1091411026",
  copyLabel: "Copy",
  copiedLabel: "Copied",
}

describe("ArkiveSiteInfo", () => {
  it("links Arkive, emphasizes owned names, and omits template braces", () => {
    const { container, getByRole, getAllByText } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.3"
        recentEntries={[]}
        feedbackGroup={feedbackGroup}
      />,
    )

    expect(getByRole("link", { name: "Arkive" }).getAttribute("href")).toBe("https://tc-imba.com")
    expect(getAllByText("Palworld").every((node) => node.tagName === "STRONG")).toBe(true)
    expect(getAllByText("Pocketpair, Inc.").every((node) => node.tagName === "STRONG")).toBe(true)
    expect(container.textContent).not.toMatch(/[{}]/)
  })

  it("opens a text-only recent-update dialog from the current version", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.3"
        recentEntries={[{
          version: "1.2.3",
          date: "2026-08-08",
          commit: "1234567890123456789012345678901234567890",
          changes: [{ kind: "improvement", text: "Improved the About panel." }],
        }]}
        feedbackGroup={feedbackGroup}
      />,
    )

    fireEvent.click(getByTestId("site-info-version-trigger"))
    expect(getByTestId("site-info-version-dialog")).toBeTruthy()
    expect(getByText("1.2.3")).toBeTruthy()
    expect(getByText("Improved the About panel.")).toBeTruthy()
    expect(getByText("2026-08-08")).toBeTruthy()
    expect(queryByText("1234567")).toBeNull()
  })

  it("shows every version since the configured start release", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.4"
        historyStartVersion="1.2.1"
        recentEntries={[
          {
            version: "1.2.4",
            date: "2026-08-09",
            commit: "2345678901234567890123456789012345678901",
            changes: [{ kind: "fix", text: "A later update." }],
          },
          {
            version: "1.2.3",
            date: "2026-08-08",
            commit: "1234567890123456789012345678901234567890",
            changes: [{ kind: "improvement", text: "A second update." }],
          },
          {
            version: "1.2.2",
            date: "2026-08-07",
            commit: "1123456789012345678901234567890123456789",
            changes: [{ kind: "data", text: "A third update." }],
          },
          {
            version: "1.2.1",
            date: "2026-08-06",
            commit: "2123456789012345678901234567890123456789",
            changes: [{
              kind: "fix",
              text: "About history starts here as the fourth visible release.",
            }],
          },
          {
            version: "1.2.0",
            date: "2026-08-01",
            commit: "0123456789012345678901234567890123456789",
            changes: [{ kind: "feature", text: "An older site release." }],
          },
        ]}
        feedbackGroup={feedbackGroup}
      />,
    )

    fireEvent.click(getByTestId("site-info-version-trigger"))
    expect(getByText("A later update.")).toBeTruthy()
    expect(getByText("About history starts here as the fourth visible release.")).toBeTruthy()
    expect(queryByText("An older site release.")).toBeNull()
  })

  it("treats a missing start release as a semantic version boundary", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.4"
        historyStartVersion="1.2.2"
        recentEntries={[
          {
            version: "1.2.4",
            date: "2026-08-09",
            commit: "2345678901234567890123456789012345678901",
            changes: [{ kind: "fix", text: "A newer update." }],
          },
          {
            version: "1.2.3",
            date: "2026-08-08",
            commit: "1234567890123456789012345678901234567890",
            changes: [{ kind: "improvement", text: "Another newer update." }],
          },
          {
            version: "1.2.1",
            date: "2026-08-01",
            commit: "0123456789012345678901234567890123456789",
            changes: [{ kind: "feature", text: "An older site release." }],
          },
        ]}
        feedbackGroup={feedbackGroup}
      />,
    )

    fireEvent.click(getByTestId("site-info-version-trigger"))
    expect(getByText("A newer update.")).toBeTruthy()
    expect(getByText("Another newer update.")).toBeTruthy()
    expect(queryByText("An older site release.")).toBeNull()
  })

  it("shows the current release when the configured boundary is newer", () => {
    const { getByTestId, getByText, queryByText } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.1"
        historyStartVersion="1.2.2"
        recentEntries={[
          {
            version: "1.2.1",
            date: "2026-08-09",
            commit: "1234567890123456789012345678901234567890",
            changes: [{ kind: "fix", text: "The current release." }],
          },
          {
            version: "1.2.0",
            date: "2026-08-01",
            commit: "0123456789012345678901234567890123456789",
            changes: [{ kind: "feature", text: "An older site release." }],
          },
        ]}
        feedbackGroup={feedbackGroup}
      />,
    )

    fireEvent.click(getByTestId("site-info-version-trigger"))
    expect(getByText("The current release.")).toBeTruthy()
    expect(queryByText("An older site release.")).toBeNull()
  })

  it("always renders the shared feedback group after game contact content", () => {
    const { getByText, getByTestId } = render(
      <ArkiveSiteInfo
        strings={strings}
        arkiveName="Arkive"
        arkiveHomeUrl="https://tc-imba.com"
        gameName="Palworld"
        developerName="Pocketpair, Inc."
        version="1.2.3"
        recentEntries={[]}
        feedbackGroup={feedbackGroup}
        gameContact={<p>Game-specific Discord</p>}
      />,
    )

    expect(getByText("Game-specific Discord")).toBeTruthy()
    expect(getByText("Feedback QQ group")).toBeTruthy()
    expect(getByTestId("site-info-group-number").textContent).toBe("1091411026")
  })
})
