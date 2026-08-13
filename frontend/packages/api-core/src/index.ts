/**
 * `@gamemap/api-core` — the typed client for the backend's `core` module.
 *
 * Everything under `src/generated/` is produced by `pnpm generate` from
 * `backend-go/openapi/core.json` and is committed, so a checkout builds without
 * a backend present and a diff shows exactly what a backend change did to the
 * frontend's view of the API. Do not edit those files; edit the backend and
 * regenerate. `pnpm check:api-drift` fails if they are stale.
 *
 * Nothing here is app-specific: no storage, no environment reading, no i18n. An
 * app supplies the base URL, the transport and (for bearer) the token store, in
 * keeping with the rule that shared packages take their world as an argument.
 *
 * Usage:
 *
 *   const api = createApiClient({ baseUrl, transport: "cookie" })
 *   const user = await result(getCurrentUser({ client: api.client, throwOnError: true }))
 *
 * `throwOnError: true` is not optional — see `result()`.
 */

export {
  createApiClient,
  result,
  type ApiClient,
  type ApiClientOptions,
  type Payload,
  type TokenStorage,
  type Transport,
} from "./client"

export {
  ApiError,
  isEnvelope,
  normaliseCode,
  SUCCESS_CODE,
  type Envelope,
} from "./envelope"

// The generated operations and wire types. Re-exported wholesale rather than
// listed, because a hand-maintained list of ~200 generated names would drift
// from the spec — which is the failure this package exists to remove.
//
// One name to know about: the spec has a schema called `Error`, so this barrel
// exports a type of that name. It is the error envelope, not the JavaScript
// built-in, and an auto-import that reaches for it is almost certainly wrong;
// `ApiError` above is the class callers catch.
export * from "./generated"
