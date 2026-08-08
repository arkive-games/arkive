/**
 * Wire types for the backend's `core` module.
 *
 * These mirror `backend-go/openapi/core.json`. They are hand-written rather
 * than generated, and `specDrift.test.ts` asserts that the operations this
 * client calls still exist in that document with the same paths and methods —
 * so a backend change that would break the client fails a test rather than a
 * user's login. Replacing this file with `@hey-api/openapi-ts` output later is
 * a drop-in change; the drift test is what makes deferring it safe.
 */

/** A user account, as the API exposes it. Never carries password material. */
export interface User {
  id: string
  name: string
  email: string
  isActive: boolean
  isSuperuser: boolean
  isVerified: boolean
  createdAt: string
  updatedAt: string
}

/** The envelope every endpoint returns except the token endpoint. */
export interface Envelope<T> {
  errorCode: string
  errorMessage: string
  showType: number
  data: T | null
}

/** The bearer-token payload from `POST /auth/jwt/login`. */
export interface TokenResponse {
  accessToken: string
  tokenType: string
  expiresAt: string
}

/** A proof-of-work challenge gating registration. */
export interface AltchaChallenge {
  algorithm: string
  challenge: string
  maxNumber: number
  salt: string
  signature: string
}

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
export type AuthTransport = "cookie" | "bearer"

/** Stores the bearer token when cookies cannot be used. */
export interface TokenStorage {
  read(): string | null
  write(token: string): void
  clear(): void
}
