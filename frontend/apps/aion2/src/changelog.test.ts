import { describe, expect, it } from "vitest";
import { compareVersions, validateChangelog, type ChangelogFile } from "@gamemap/ui";

import raw from "./changelog.json";

const file = raw as ChangelogFile;

describe("aion2 changelog.json", () => {
  it("is structurally valid", () => {
    expect(validateChangelog(file)).toEqual([]);
  });

  // A floor, not an equality — future releases bump this and should not need a
  // test edit.
  it("is at or beyond the backfilled state", () => {
    expect(compareVersions(file.entries[0].version, "1.5.0")).toBeGreaterThanOrEqual(0);
    expect(file.entries.length).toBeGreaterThanOrEqual(17);
  });

  it("records the phase-2 rebuild as the 1.0.0 major", () => {
    const major = file.entries.find((e) => e.version === "1.0.0");
    expect(major?.date).toBe("2026-07-01");
  });

  it("covers the whole history back to the first release", () => {
    expect(file.entries.at(-1)).toMatchObject({ version: "0.1.0", date: "2025-11-17" });
  });
});
