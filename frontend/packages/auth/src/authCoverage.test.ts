import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Fails when the backend gains an operation in this package's territory that
 * nothing here reaches, or claims one it no longer calls.
 *
 * This is the guarantee the generated client does NOT provide, and the reason
 * this file outlived `specDrift.test.ts`. Generation answers "does the client
 * match the document?" — settled by construction now that the client *is* the
 * document. It says nothing about whether anything **calls** what was generated.
 * Add `POST /auth/change-email` to the Go router and `check:api-drift` stays
 * green, `sdk.gen.ts` grows a `changeEmail` nobody calls, and the gap is
 * invisible until someone notices the screen is missing.
 *
 * Three directions, because a two-sided check leaves the third gap open:
 *
 *   1. in the specification, in neither list  — the backend grew something
 *   2. in a list, not in the specification    — the backend dropped something
 *   3. in HANDLED, not called by the client   — the call site went away
 *
 * The lists are hand-maintained on purpose. Adding an entry should be a decision
 * someone makes and reviews; a generated list would restate the specification
 * and assert nothing.
 */
const SPEC_PATH = fileURLToPath(
  new URL("../../../../backend-go/openapi/core.json", import.meta.url),
)
const CLIENT_PATH = fileURLToPath(new URL("./client.ts", import.meta.url))

/**
 * The paths this package is answerable for.
 *
 * `/auth/*` plus the parts of `/users/*` that belong to the signed-in account —
 * `CoreClient` already calls `/users/me`, and `core` is scoped as accounts,
 * authentication and avatars. What stays out is genuinely administrative:
 * `/users/{id}`, `/users/search`, `/users/become-superuser` act on *other*
 * accounts and belong to an admin surface that does not exist yet. Excluding
 * those on that basis is accurate; the blanket "`/users/*` is not this package's
 * responsibility" this file used to claim was not, and it hid four avatar
 * operations that are this package's business.
 */
function isOwned(path: string): boolean {
  return path.startsWith("/auth/") || path === "/users/me" || path.startsWith("/users/me/") ||
    path === "/users/avatar-presets"
}

/**
 * Operations `CoreClient` calls, by the `operationId` the backend declares.
 *
 * These are the document's ids, which are not always the generated function's
 * name: `loginJWT` in the specification becomes `loginJwt` in TypeScript. The
 * document is what this test compares against, so its spelling is what belongs
 * here, and GENERATED_NAME below carries the difference.
 */
const HANDLED = [
  "getAltchaChallenge",
  "register",
  "loginCookie",
  "loginJWT",
  "logoutCookie",
  "logoutJWT",
  "forgotPassword",
  "resetPassword",
  "requestVerifyToken",
  "verifyUser",
  "getCurrentUser",
  "updateCurrentUser",
] as const

/** Where an operationId and its generated function name differ. */
const GENERATED_NAME: Record<string, string> = {
  loginJWT: "loginJwt",
  logoutJWT: "logoutJwt",
}

/**
 * Operations deliberately left alone, each with the reason.
 *
 * An entry is a claim that the UI does not need the endpoint — worth stating,
 * because the alternative is an endpoint quietly going unused with nobody able to
 * say whether that was intended.
 */
const NOT_NEEDED: Record<string, string> = {
  listAvatarPresets:
    "no avatar UI yet; User.avatarUrl is read and rendered, but nothing lets an account change it",
  setCurrentUserAvatar: "no avatar UI yet: uploading needs a file picker and a crop step",
  setCurrentUserAvatarPreset: "no avatar UI yet: choosing a preset needs the preset gallery",
  deleteCurrentUserAvatar: "no avatar UI yet: nothing can set one, so nothing needs to clear one",
}

interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId?: string }>>
}

function ownedOperationIds(): string[] {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiDocument
  const ids = new Set<string>()
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!isOwned(path)) continue
    for (const operation of Object.values(item)) {
      if (operation.operationId) ids.add(operation.operationId)
    }
  }
  return [...ids].sort()
}

describe("this package's slice of the API is fully accounted for", () => {
  it("finds the specification where the backend writes it", () => {
    expect(() => ownedOperationIds()).not.toThrow()
    expect(ownedOperationIds().length).toBeGreaterThan(0)
  })

  it("handles, or explicitly declines, every operation the backend offers here", () => {
    const accounted = new Set<string>([...HANDLED, ...Object.keys(NOT_NEEDED)])
    const unaccounted = ownedOperationIds().filter((id) => !accounted.has(id))

    // A name here means the backend grew an endpoint the UI cannot reach. Either
    // call it from CoreClient and add it to HANDLED, or record in NOT_NEEDED why
    // the UI does not want it.
    expect(unaccounted).toEqual([])
  })

  it("claims nothing the backend no longer offers", () => {
    const offered = new Set(ownedOperationIds())
    const stale = [...HANDLED, ...Object.keys(NOT_NEEDED)].filter((id) => !offered.has(id)).sort()

    expect(stale).toEqual([])
  })

  // The third direction. Without this, deleting the resetPassword call from
  // CoreClient leaves HANDLED still claiming it, every other check green, and
  // nothing naming the loss -- the same invisible gap, entered from the other end.
  it("actually calls everything it claims to handle", () => {
    const source = readFileSync(CLIENT_PATH, "utf8")
    const uncalled = HANDLED.filter((id) => {
      const name = GENERATED_NAME[id] ?? id
      // Word-boundary matched, so `getUser` cannot be satisfied by `getUserByUID`.
      return !new RegExp(`\\b${name}\\b`).test(source)
    }).sort()

    expect(uncalled).toEqual([])
  })
})
