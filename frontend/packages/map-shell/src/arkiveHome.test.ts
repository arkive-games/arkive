import { describe, expect, it } from "vitest"
import {
  ARKIVE_DEV_HOME_URL,
  ARKIVE_PRODUCTION_HOME_URL,
  ARKIVE_TOY_HOME_URL,
  resolveArkiveHomeUrl,
} from "./arkiveHome"

describe("resolveArkiveHomeUrl", () => {
  it("uses the local portal in development", () => {
    expect(resolveArkiveHomeUrl({ dev: true })).toBe(ARKIVE_DEV_HOME_URL)
  })

  it("uses the production portal outside development", () => {
    expect(resolveArkiveHomeUrl()).toBe(ARKIVE_PRODUCTION_HOME_URL)
  })

  it("keeps an environment override at highest priority", () => {
    expect(resolveArkiveHomeUrl({ envUrl: "https://preview.example", dev: true, toy: true })).toBe(
      "https://preview.example",
    )
  })

  it("uses the same-origin portal inside a toy", () => {
    expect(resolveArkiveHomeUrl({ dev: true, toy: true })).toBe(
      ARKIVE_TOY_HOME_URL,
    )
  })
})
