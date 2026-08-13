/**
 * The envelope every Arkive endpoint returns, and the one place it is unwrapped.
 *
 * The backend wraps every successful payload as
 * `{errorCode, errorMessage, showType, data}`, so a generated client returns the
 * envelope rather than the payload: `getCurrentUser()` would hand back the
 * wrapper and every call site would have to write `res.data.data` and check
 * `errorCode` for itself. Unwrapping once here is what keeps that out of 33 call
 * sites and out of six apps.
 */

export interface Envelope<T> {
  errorCode: string
  errorMessage: string
  showType: number
  data: T | null
}

/** The code the backend returns when nothing went wrong. */
export const SUCCESS_CODE = "Success"

/**
 * ApiError is what a non-Success response becomes.
 *
 * It carries the backend's own stable `errorCode` rather than only an HTTP
 * status, because that is what callers switch on — the status alone cannot
 * distinguish "that name is taken" from "that email is taken", which are both
 * 409.
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  /**
   * The response this came from, when there was one.
   *
   * Deliberately typed as loosely as it is used rather than as an
   * `AxiosResponse`, so this module stays free of a transport dependency. It
   * exists because the generated client reads `error.response?.data` when a call
   * was made without `throwOnError: true`; without it, that mode reports an empty
   * object instead of the backend's error body.
   */
  readonly response?: { data?: unknown }

  constructor(code: string, message: string, status: number, response?: { data?: unknown }) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = status
    this.response = response
  }
}

/**
 * isEnvelope decides, from the body alone, whether a response is wrapped.
 *
 * This is a structural test rather than a per-operation list, and it has to be:
 * 32 of the 33 operations are enveloped, but `POST /auth/jwt/login` answers with
 * a bare TokenResponse. Unwrapping unconditionally would return `undefined` for
 * the access token and break sign-in for the bearer transport only — which is the
 * Bilibili Toy, the one place least likely to be noticed quickly.
 */
export function isEnvelope(body: unknown): body is Envelope<unknown> {
  if (body === null || typeof body !== "object") return false
  const candidate = body as Record<string, unknown>
  return typeof candidate.errorCode === "string" && "data" in candidate
}

/**
 * normaliseCode gives a response a stable machine-readable code even when the
 * body did not carry one.
 *
 * A proxy timing out, a 502 from nginx or a network-level failure never reaches
 * the application, so it has no `errorCode`. Callers still need to branch on
 * something, and the HTTP status is all there is.
 */
export function normaliseCode(code: string | undefined, status: number): string {
  if (code && code.length > 0) return code
  switch (status) {
    case 400:
      return "ValidationError"
    case 401:
      return "UnauthorizedError"
    case 403:
      return "PermissionError"
    case 404:
      return "NotFoundError"
    case 409:
      return "IntegrityError"
    case 413:
      return "RequestEntityTooLargeError"
    case 422:
      return "ValidationError"
    case 429:
      return "RateLimitExceededError"
    case 503:
      return "StorageUnavailableError"
    default:
      return status >= 500 ? "InternalServerError" : "Error"
  }
}

/**
 * unwrap turns a response body into the payload, or throws.
 *
 * Exported separately from the interceptor so the rule can be tested directly,
 * without an HTTP layer to arrange.
 */
export function unwrap<T>(body: unknown, status: number, statusText: string): T {
  if (!isEnvelope(body)) {
    // Not enveloped: the only such operation is the bearer login, whose body is
    // the token itself. A failure there still has to raise.
    if (status >= 400) {
      throw new ApiError(normaliseCode(undefined, status), statusText, status)
    }
    if (typeof body === "string") {
      // An absent body, which is how axios represents a 204 or any response with
      // no content. Reported as undefined rather than as the empty string,
      // because that is what it means -- and because the generated client turns
      // undefined into `{}`, which is the shape a caller of an empty operation
      // expects. No operation in the spec returns one today, but rejecting it
      // would break the first one that did.
      if (body.length === 0) return undefined as T

      // Text on a successful status did not come from the API: it is an edge or
      // proxy page that happened to answer 200. No operation returns a bare
      // string, so passing it through would hand a caller an HTML document typed
      // as a User.
      throw new ApiError("UnknownError", "The server returned an unexpected response", status)
    }
    return body as T
  }

  if (status >= 400 || body.errorCode !== SUCCESS_CODE) {
    throw new ApiError(
      normaliseCode(body.errorCode, status),
      body.errorMessage || statusText,
      status,
    )
  }
  return body.data as T
}
