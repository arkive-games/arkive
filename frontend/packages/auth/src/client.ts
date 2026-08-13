import {
  ApiError,
  createApiClient,
  forgotPassword,
  getAltchaChallenge,
  getCurrentUser,
  loginCookie,
  loginJwt,
  logoutCookie,
  logoutJwt,
  register,
  requestVerifyToken,
  resetPassword,
  result,
  updateCurrentUser,
  verifyUser,
  type ApiClient,
  type Payload,
} from "@gamemap/api-core"
import type { AxiosAdapter, AxiosResponse } from "axios"

import {
  AuthError,
  type AltchaChallenge,
  type AuthErrorCode,
  type AuthTransport,
  type TokenStorage,
  type User,
} from "./types"

export interface CoreClientOptions {
  /** Origin plus module prefix, e.g. `https://api.tc-imba.com/api/v1/core`. */
  baseUrl: string
  transport: AuthTransport
  /** Required when transport is `bearer`; ignored otherwise. */
  storage?: TokenStorage
  /** Answers requests instead of the network. Injectable for tests. */
  adapter?: AxiosAdapter
}

/**
 * The accounts and authentication surface, as the UI wants to call it.
 *
 * A thin facade over the generated client rather than a replacement for it. The
 * generated functions take an options object and return a response; the screens
 * want `login(email, password)` and a `User`. Three things live here that the
 * generator cannot know:
 *
 *   - which of the two login endpoints the current transport should use;
 *   - that a failure should arrive as an `AuthError` whose code is drawn from the
 *     narrow vocabulary the UI branches on, not the backend's full set;
 *   - that being signed out is a normal state rather than an error.
 *
 * Two transports, because one is not enough for where this ships. On the game
 * subdomains the session is an httpOnly cookie: script cannot read it, so an XSS
 * cannot exfiltrate it, and every app shares one login. Inside a Bilibili Toy the
 * page is a third-party iframe, where that cookie is blocked outright by Safari
 * and Firefox and is being removed in Chrome — so there the session is a bearer
 * token in storage, weaker against XSS but the only thing that works at all.
 */
export class CoreClient {
  private readonly api: ApiClient
  private readonly transport: AuthTransport
  private readonly storage?: TokenStorage

  constructor(options: CoreClientOptions) {
    this.transport = options.transport
    this.storage = options.storage

    if (this.transport === "bearer" && !this.storage) {
      throw new Error("CoreClient: transport 'bearer' requires a TokenStorage")
    }

    this.api = createApiClient({
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
      transport: options.transport,
      storage: options.storage,
      adapter: options.adapter,
    })
  }

  // -- session ------------------------------------------------------------

  async getAltchaChallenge(): Promise<AltchaChallenge> {
    return this.call((o) => getAltchaChallenge(o))
  }

  async register(input: {
    name: string
    email: string
    password: string
    altcha: string
  }): Promise<User> {
    // The solution travels as a query parameter, and the generated client escapes
    // it: base64 contains +, / and =, all of which change meaning in a query
    // string.
    return this.call((o) =>
      register({
        ...o,
        query: { altcha: input.altcha },
        body: { name: input.name, email: input.email, password: input.password },
      }),
    )
  }

  async login(email: string, password: string): Promise<User> {
    if (this.transport === "cookie") {
      return this.call((o) => loginCookie({ ...o, body: { email, password } }))
    }

    // The bearer endpoint returns the token at the top level rather than in the
    // envelope, so that conventional OAuth2 tooling can find it.
    const token = await this.call((o) => loginJwt({ ...o, body: { email, password } }))
    this.storage!.write(token.accessToken)
    try {
      return await this.getCurrentUser()
    } catch (error) {
      // The token has to go back out if the account it belongs to could not be
      // read. Otherwise a network blip between these two calls leaves `login()`
      // reporting failure to the user while the stored token quietly authenticates
      // every request after it — signed in, having just been told they are not.
      this.storage!.clear()
      throw error
    }
  }

  async logout(): Promise<void> {
    try {
      await this.call((o) => (this.transport === "cookie" ? logoutCookie(o) : logoutJwt(o)))
    } finally {
      // The local session is discarded even if the call failed. Leaving a token
      // behind after the user asked to sign out is the worse outcome.
      this.storage?.clear()
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.call((o) => getCurrentUser(o))
  }

  /**
   * Resolves null when nobody is signed in, rather than throwing.
   *
   * Session restore on page load runs through this: being signed out is the
   * expected case there, not an error, and treating it as one would surface a
   * spurious message to every anonymous visitor.
   */
  async currentUserOrNull(): Promise<User | null> {
    try {
      return await this.getCurrentUser()
    } catch (error) {
      if (error instanceof AuthError && error.code === "UnauthorizedError") {
        return null
      }
      if (error instanceof AuthError && error.status === 401) {
        return null
      }
      throw error
    }
  }

  async updateCurrentUser(input: {
    name?: string
    email?: string
    password?: string
  }): Promise<User> {
    return this.call((o) => updateCurrentUser({ ...o, body: input }))
  }

  // -- password and address -----------------------------------------------

  /**
   * Requests a reset link. Gated by proof of work, because one call to this
   * endpoint mails a real person: without the gate an attacker can mail-bomb a
   * chosen address, and every message spends the sending quota.
   */
  async forgotPassword(email: string, altcha: string): Promise<void> {
    await this.call((o) => forgotPassword({ ...o, query: { altcha }, body: { email } }))
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.call((o) => resetPassword({ ...o, body: { token, password } }))
  }

  async requestVerification(email: string): Promise<void> {
    await this.call((o) => requestVerifyToken({ ...o, body: { email } }))
  }

  async verify(token: string): Promise<User> {
    return this.call((o) => verifyUser({ ...o, body: { token } }))
  }

  // -- plumbing -----------------------------------------------------------

  /**
   * Runs one generated operation and translates its failures.
   *
   * `throwOnError: true` is required by `result`, and required in fact: without
   * it the generated client returns rejections instead of raising them, and a
   * caller reading the payload would see undefined instead of an error.
   */
  private async call<T>(
    operation: (options: {
      client: ApiClient["client"]
      throwOnError: true
    }) => Promise<AxiosResponse<T>>,
  ): Promise<Payload<T>> {
    try {
      return await result(operation({ client: this.api.client, throwOnError: true }))
    } catch (error) {
      throw asAuthError(error)
    }
  }
}

/**
 * Translates a transport-level failure into the vocabulary the UI branches on.
 *
 * Kept separate from the client so the mapping can be read and tested on its
 * own, and so the three distinct failure kinds stay visibly distinct: an
 * application error carrying a code, a server that answered with something other
 * than the API, and a server that did not answer.
 */
export function asAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error

  if (error instanceof ApiError) {
    return new AuthError(normaliseCode(error.code, error.status), error.message, error.status)
  }

  // Never reached the application: offline, DNS, TLS, an aborted request or a
  // CORS preflight refusal. Reported distinctly so the UI can say "cannot reach
  // the server" rather than "wrong password".
  return new AuthError("NetworkError", "Could not reach the server", 0)
}

/** Maps a server code, or a bare status, onto the codes the UI branches on. */
export function normaliseCode(code: string | undefined, status: number): AuthErrorCode {
  const known: AuthErrorCode[] = [
    "UnauthorizedError",
    "PermissionError",
    "UserBadCredentialsError",
    "UserAlreadyExistsError",
    "UserEmailAlreadyExistsError",
    "UserInvalidPasswordError",
    "UserInactiveError",
    "UserAlreadyVerifiedError",
    "AltchaChallengeError",
    "RateLimitExceededError",
    "InvalidTokenError",
    "ValidationError",
  ]
  if (code && (known as string[]).includes(code)) return code as AuthErrorCode
  if (status === 401) return "UnauthorizedError"
  if (status === 403) return "PermissionError"
  if (status === 429) return "RateLimitExceededError"
  if (status === 422 || status === 400) return "ValidationError"
  return "UnknownError"
}
