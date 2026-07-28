import { describe, expect, it } from "vitest"

import {
  compareVersions,
  resolveChangelog,
  resolveText,
  validateChangelog,
  versionUrl,
  type ChangelogFile,
} from "./changelog"

const TEXT = { "en-US": "English", "zh-CN": "简体", "zh-TW": "繁體" }
const SHA_A = "0123456789abcdef0123456789abcdef01234567"
const SHA_B = "89abcdef0123456789abcdef0123456789abcdef"
const REPO = "https://github.com/arkive-games/arkive"

describe("resolveText", () => {
  it("returns the exact locale when present", () => {
    expect(resolveText(TEXT, "zh-CN")).toBe("简体")
  })

  it("falls back from zh-TW to zh-CN before English", () => {
    expect(resolveText({ "en-US": "English", "zh-CN": "简体" }, "zh-TW")).toBe("简体")
  })

  it("prefers an explicit zh-TW over the zh-CN fallback", () => {
    expect(resolveText(TEXT, "zh-TW")).toBe("繁體")
  })

  it("falls back to en-US for an unlisted locale", () => {
    expect(resolveText(TEXT, "ja-JP")).toBe("English")
  })

  it("returns an empty string when nothing matches", () => {
    expect(resolveText({}, "ja-JP")).toBe("")
  })

  it("treats an empty value as absent", () => {
    expect(resolveText({ "en-US": "English", "ja-JP": "" }, "ja-JP")).toBe("English")
  })
})

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0)
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1)
    expect(compareVersions("0.9.0", "1.0.0")).toBe(-1)
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1)
  })
})

describe("resolveChangelog", () => {
  it("resolves every change for the locale and carries the commit through", () => {
    const file: ChangelogFile = {
      entries: [
        {
          version: "1.1.0",
          date: "2026-07-02",
          commit: SHA_B,
          changes: [{ kind: "feature", text: TEXT }],
        },
        {
          version: "1.0.0",
          date: "2026-07-01",
          commit: SHA_A,
          changes: [{ kind: "fix", text: TEXT }],
        },
      ],
    }
    expect(resolveChangelog(file, "zh-CN")).toEqual([
      {
        version: "1.1.0",
        date: "2026-07-02",
        commit: SHA_B,
        changes: [{ kind: "feature", text: "简体" }],
      },
      {
        version: "1.0.0",
        date: "2026-07-01",
        commit: SHA_A,
        changes: [{ kind: "fix", text: "简体" }],
      },
    ])
  })
})

describe("versionUrl", () => {
  it("compares against the previous release when there is one", () => {
    expect(versionUrl(REPO, { commit: SHA_B }, { commit: SHA_A })).toBe(
      `${REPO}/compare/${SHA_A}...${SHA_B}`,
    )
  })

  it("links the single commit for the oldest release", () => {
    expect(versionUrl(REPO, { commit: SHA_A })).toBe(`${REPO}/commit/${SHA_A}`)
  })

  it("does not double up on a trailing slash in the repo url", () => {
    expect(versionUrl(`${REPO}/`, { commit: SHA_A })).toBe(`${REPO}/commit/${SHA_A}`)
  })
})

describe("validateChangelog", () => {
  const valid: ChangelogFile = {
    entries: [
      {
        version: "1.1.0",
        date: "2026-07-02",
        commit: SHA_B,
        changes: [{ kind: "feature", text: TEXT }],
      },
      {
        version: "1.0.0",
        date: "2026-07-01",
        commit: SHA_A,
        changes: [{ kind: "fix", text: TEXT }],
      },
    ],
  }

  it("reports no problems for a well-formed file", () => {
    expect(validateChangelog(valid)).toEqual([])
  })

  it("rejects a missing commit", () => {
    const bad = {
      entries: [{ version: "1.0.0", date: "2026-07-01", changes: valid.entries[1].changes }],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[0] (1.0.0): commit undefined is not a 40-character SHA",
    )
  })

  it("rejects an abbreviated commit", () => {
    const bad = {
      entries: [
        {
          version: "1.0.0",
          date: "2026-07-01",
          commit: "0123456",
          changes: valid.entries[1].changes,
        },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      'entries[0] (1.0.0): commit "0123456" is not a 40-character SHA',
    )
  })

  it("rejects a non-object", () => {
    expect(validateChangelog(null)).toEqual(["file: expected an object with an `entries` array"])
  })

  it("rejects an empty entries array", () => {
    expect(validateChangelog({ entries: [] })).toEqual(["entries: must not be empty"])
  })

  it("rejects a malformed version", () => {
    const bad = {
      entries: [{ version: "1.0", date: "2026-07-01", changes: valid.entries[1].changes }],
    }
    expect(validateChangelog(bad)).toContain('entries[0]: version "1.0" is not MAJOR.MINOR.PATCH')
  })

  it("rejects a malformed date", () => {
    const bad = {
      entries: [{ version: "1.0.0", date: "07/01/2026", changes: valid.entries[1].changes }],
    }
    expect(validateChangelog(bad)).toContain(
      'entries[0] (1.0.0): date "07/01/2026" is not YYYY-MM-DD',
    )
  })

  it("rejects versions that are not strictly descending", () => {
    const bad = {
      entries: [
        { version: "1.0.0", date: "2026-07-02", changes: valid.entries[0].changes },
        { version: "1.0.0", date: "2026-07-01", changes: valid.entries[1].changes },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[1] (1.0.0): version must be strictly lower than entries[0] (1.0.0)",
    )
  })

  it("rejects dates that increase as versions descend", () => {
    const bad = {
      entries: [
        { version: "1.1.0", date: "2026-07-01", changes: valid.entries[0].changes },
        { version: "1.0.0", date: "2026-07-02", changes: valid.entries[1].changes },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[1] (1.0.0): date 2026-07-02 is newer than entries[0] (2026-07-01)",
    )
  })

  it("rejects an entry with no changes", () => {
    const bad = { entries: [{ version: "1.0.0", date: "2026-07-01", changes: [] }] }
    expect(validateChangelog(bad)).toContain("entries[0] (1.0.0): changes must not be empty")
  })

  it("rejects an unknown kind", () => {
    const bad = {
      entries: [{ version: "1.0.0", date: "2026-07-01", changes: [{ kind: "chore", text: TEXT }] }],
    }
    expect(validateChangelog(bad)).toContain(
      'entries[0] (1.0.0).changes[0]: kind "chore" is not one of feature, improvement, fix, data',
    )
  })

  it("rejects a missing required locale", () => {
    const bad = {
      entries: [
        { version: "1.0.0", date: "2026-07-01", changes: [{ kind: "fix", text: { "en-US": "x" } }] },
      ],
    }
    expect(validateChangelog(bad)).toContain(
      "entries[0] (1.0.0).changes[0]: text is missing zh-CN, zh-TW",
    )
  })
})
