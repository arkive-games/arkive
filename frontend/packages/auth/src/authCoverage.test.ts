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
 * authentication and avatars. Everything else under `/users/` stays out because it
 * acts on another account or because no surface claims it yet: `/users/{id}` and
 * its `avatar`, `deactivate` and `reactivate` children, `/users/search` and
 * `/users/become-superuser` belong to an admin surface that does not exist, while
 * `/users/uid/{uid}` is a public profile read that acts on nobody's account and
 * that nothing calls today — a forum author link or a profile page would want it,
 * so it is unclaimed rather than administrative.
 *
 * Both halves of that sentence are load-bearing. The blanket "`/users/*` is not
 * this package's responsibility" this file used to claim was untrue of
 * `/users/me`, and it hid four avatar operations that are this package's
 * business; naming only the administrative paths would repeat the mistake one
 * paragraph below where it is corrected.
 */
function isOwned(path: string): boolean {
  return (
    path.startsWith("/auth/") ||
    path === "/users/me" ||
    path.startsWith("/users/me/") ||
    // Prefix, not equality: a future /users/avatar-presets/{id} would otherwise
    // fall outside this function and go unaccounted, which is the exact failure
    // this file exists to prevent.
    path.startsWith("/users/avatar-presets")
  )
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
  // All four say the same thing, because one fact explains all four: the avatar
  // editor is BUILT and is not connected to the backend.
  //
  // `apps/meta/src/UserSystemPages.tsx` ships `AvatarUploadDialog` with a file
  // picker, type and size validation, zoom and crop, and its own `AVATAR_PRESETS`
  // gallery; the same page already calls `updateCurrentUser` for name, email and
  // password. What the chosen avatar reaches is `updateLocalProfile({ avatarSrc })`
  // -- browser memory -- so it does not follow the account to another browser
  // even though every endpoint it would need exists.
  //
  // Recorded this way deliberately. Saying "no avatar UI yet" would be the same
  // mistake this file was widened to correct: an inaccurate note that leaves the
  // next reader believing there is UI to build, when what is missing is one client
  // call per operation. Wiring it is frontend work outside this package, so these
  // stay declined until it happens -- but declined for the true reason.
  listAvatarPresets: "the preset gallery is local (apps/meta AVATAR_PRESETS), not fetched from core",
  setCurrentUserAvatar: "AvatarUploadDialog crops and then stores locally, never uploading",
  setCurrentUserAvatarPreset: "a chosen preset is stored locally, not sent to core",
  deleteCurrentUserAvatar: "nothing sends an avatar to core, so there is none there to clear",
}

interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId?: string }>>
}

/**
 * The value names `client.ts` imports from `@gamemap/api-core`.
 *
 * Reads the specifier list rather than the whole file, for the reason given at
 * the assertion below. `type` specifiers are dropped: a type import is not a
 * call, and `noUnusedLocals` does not fault an unused one the way it faults an
 * unused value.
 */
function importedFromApiCore(): Set<string> {
  const source = readFileSync(CLIENT_PATH, "utf8")
  const block = /import\s*\{([^}]*)\}\s*from\s*["']@gamemap\/api-core["']/s.exec(source)
  if (!block) throw new Error(`no @gamemap/api-core import found in ${CLIENT_PATH}`)

  return new Set(
    block[1]
      .split(",")
      .map((specifier) => specifier.trim())
      .filter((specifier) => specifier.length > 0 && !specifier.startsWith("type "))
      // `a as b` imports under a local name; the local name is what is called.
      .map((specifier) => specifier.split(/\s+as\s+/).pop()!.trim()),
  )
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
  //
  // Searched inside the `@gamemap/api-core` import list, NOT across the whole
  // file, and that distinction is the whole test. Six of these ids are also the
  // names of CoreClient's own methods -- getCurrentUser, register, resetPassword
  // and three more -- so a match anywhere in the file is satisfied by the method
  // declaration alone. Gut `resetPassword`'s body and drop its import and a
  // whole-file search still finds `async resetPassword(`, passing while the call
  // site it exists to protect is gone.
  //
  // The import list cannot be fooled that way, and it is stronger than a
  // substring for a second reason: `noUnusedLocals` is on for this package and CI
  // now runs `tsc` over it, so an imported name that nothing calls fails the
  // build. Presence in that list is therefore compiler-checked evidence of a real
  // use, not textual evidence of a mention.
  it("actually calls everything it claims to handle", () => {
    const imported = importedFromApiCore()
    const uncalled = HANDLED.filter((id) => !imported.has(GENERATED_NAME[id] ?? id)).sort()

    expect(uncalled).toEqual([])
  })
})
