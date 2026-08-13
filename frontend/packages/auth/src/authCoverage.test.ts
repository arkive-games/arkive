import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Fails when the backend gains an authentication operation this package ignores.
 *
 * This is the one guarantee the generated client does NOT replace, and the
 * reason this file exists after `specDrift.test.ts` was deleted. Generation
 * answers "does the client match the document?" — a question now settled by
 * construction, since the client *is* the document. It says nothing about
 * whether `CoreClient` exposes what was generated. Add `POST /auth/change-email`
 * to the Go router and `check:api-drift` stays green, `sdk.gen.ts` grows a
 * `changeEmail` nobody calls, and the gap is invisible until someone notices the
 * screen is missing.
 *
 * So the list below is deliberately hand-maintained. Adding an entry is a
 * decision to be made and reviewed, not a chore: it records that a human looked
 * at a new endpoint and chose either to surface it or to leave it alone. A
 * generated list would restate the specification and assert nothing.
 *
 * Scope is `/auth/*` only. `/users/*` is mostly administrative and `/forum/*`
 * belongs to a different feature; neither is this package's responsibility.
 */
const SPEC_PATH = fileURLToPath(
  new URL("../../../../backend-go/openapi/core.json", import.meta.url),
)

/**
 * Operations `CoreClient` calls, by the `operationId` the backend declares.
 *
 * These are the spec's ids, which are not always the generated function's name:
 * `loginJWT` in the document becomes `loginJwt` in TypeScript. The document is
 * what this test compares against, so the document's spelling is what belongs
 * here.
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
] as const

/**
 * Operations deliberately left alone, each with the reason.
 *
 * Empty today. An entry here is a claim that the UI does not need the endpoint —
 * which is worth stating explicitly, because the alternative is an endpoint
 * quietly going unused and nobody able to say whether that was intended.
 */
const NOT_NEEDED: Record<string, string> = {}

interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId?: string }>>
}

function authOperationIds(): string[] {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiDocument
  const ids = new Set<string>()
  for (const [path, item] of Object.entries(spec.paths)) {
    if (!path.startsWith("/auth/")) continue
    for (const operation of Object.values(item)) {
      if (operation.operationId) ids.add(operation.operationId)
    }
  }
  return [...ids].sort()
}

describe("the authentication surface is fully accounted for", () => {
  it("finds the specification where the backend writes it", () => {
    expect(() => authOperationIds()).not.toThrow()
    expect(authOperationIds().length).toBeGreaterThan(0)
  })

  it("handles, or explicitly declines, every /auth/* operation the backend offers", () => {
    const accounted = new Set<string>([...HANDLED, ...Object.keys(NOT_NEEDED)])
    const unaccounted = authOperationIds().filter((id) => !accounted.has(id))

    // A new entry in this list means the backend grew an endpoint the UI cannot
    // reach. Either call it from CoreClient and add it to HANDLED, or record in
    // NOT_NEEDED why the UI does not want it.
    expect(unaccounted).toEqual([])
  })

  // The other direction: an operation removed from the backend should not linger
  // here claiming to be handled, or the list stops describing anything.
  it("claims to handle nothing the backend no longer offers", () => {
    const offered = new Set(authOperationIds())
    const stale = [...HANDLED, ...Object.keys(NOT_NEEDED)].filter((id) => !offered.has(id)).sort()

    expect(stale).toEqual([])
  })
})
