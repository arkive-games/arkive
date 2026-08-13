/**
 * Types for the backend's `core` module, as this package presents them.
 *
 * The wire types are no longer written by hand: they are aliases onto
 * `@gamemap/api-core`, which generates them from `backend-go/openapi/core.json`.
 * A backend field that changes shape is now a compile error here rather than a
 * silent mismatch — something the old `specDrift.test.ts` could not catch at all,
 * since it compared paths and methods and never bodies.
 *
 * It did check one thing generation does not, though: that this package still
 * covers the whole `/auth/*` surface. Matching the document says nothing about
 * whether anything calls what was generated, so that assertion lives on in
 * `authCoverage.test.ts` rather than having been retired with the rest.
 *
 * What stays hand-written is the part the spec does not describe: the error
 * vocabulary the UI branches on.
 */

import type {
  Challenge,
  TokenResponse as CoreTokenResponse,
  TokenStorage as CoreTokenStorage,
  Transport,
  UserRead,
} from "@gamemap/api-core"

/** A user account, as the API exposes it. Never carries password material. */
export type User = UserRead

/** The bearer-token payload from `POST /auth/jwt/login`. */
export type TokenResponse = CoreTokenResponse

/** A proof-of-work challenge gating registration. */
export type AltchaChallenge = Challenge

/**
 * Error codes the UI branches on. The backend's vocabulary is larger; only the
 * ones that change what the user is told are named here, and anything else
 * falls through to a generic message.
 */
export type AuthErrorCode =
  | "UnauthorizedError"
  | "PermissionError"
  | "UserBadCredentialsError"
  | "UserAlreadyExistsError"
  | "UserEmailAlreadyExistsError"
  | "UserInvalidPasswordError"
  | "UserInactiveError"
  | "UserAlreadyVerifiedError"
  | "AltchaChallengeError"
  | "RateLimitExceededError"
  | "InvalidTokenError"
  | "ValidationError"
  | "NetworkError"
  | "UnknownError"

/** A failed request, normalised so callers never inspect HTTP status codes. */
export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly status: number

  constructor(code: AuthErrorCode, message: string, status = 0) {
    super(message)
    this.name = "AuthError"
    this.code = code
    this.status = status
  }
}

/** How the session travels. */
export type AuthTransport = Transport

/** Stores the bearer token when cookies cannot be used. */
export type TokenStorage = CoreTokenStorage
