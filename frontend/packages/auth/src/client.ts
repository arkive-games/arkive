import {
  AuthError,
  type AltchaChallenge,
  type AuthErrorCode,
  type AuthTransport,
  type Envelope,
  type TokenResponse,
  type TokenStorage,
  type User,
} from "./types"

/** Every operation this client calls, checked against the OpenAPI document. */
export const CORE_OPERATIONS = {
  getAltchaChallenge: { method: "GET", path: "/auth/altcha" },
  register: { method: "POST", path: "/auth/register" },
  loginJWT: { method: "POST", path: "/auth/jwt/login" },
  loginCookie: { method: "POST", path: "/auth/cookie/login" },
  logoutCookie: { method: "POST", path: "/auth/cookie/logout" },
  logoutJWT: { method: "POST", path: "/auth/jwt/logout" },
  forgotPassword: { method: "POST", path: "/auth/forgot-password" },
  resetPassword: { method: "POST", path: "/auth/reset-password" },
  requestVerifyToken: { method: "POST", path: "/auth/request-verify-token" },
  verifyUser: { method: "POST", path: "/auth/verify" },
  getCurrentUser: { method: "GET", path: "/users/me" },
  updateCurrentUser: { method: "PATCH", path: "/users/me" },
} as const

export interface CoreClientOptions {
  /** Origin plus module prefix, e.g. `https://api.tc-imba.com/api/v1/core`. */
  baseUrl: string
  transport: AuthTransport
  /** Required when transport is `bearer`; ignored otherwise. */
  storage?: TokenStorage
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

/**
 * Typed client for the accounts and authentication surface.
 *
 * Two transports, because one is not enough for where this ships. On the game
 * subdomains the session is an httpOnly cookie: script cannot read it, so an
 * XSS cannot exfiltrate it, and every app shares one login. Inside a Bilibili
 * Toy the page is a third-party iframe, where that cookie is blocked outright
 * by Safari and Firefox and is being removed in Chrome — so there the session
 * is a bearer token in storage, which is weaker against XSS but is the only
 * thing that works at all.
 */
export class CoreClient {
  private readonly baseUrl: string
  private readonly transport: AuthTransport
  private readonly storage?: TokenStorage
  private readonly fetchImpl: typeof fetch

  constructor(options: CoreClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.transport = options.transport
    this.storage = options.storage
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)

    if (this.transport === "bearer" && !this.storage) {
      throw new Error("CoreClient: transport 'bearer' requires a TokenStorage")
    }
  }

  // -- session ------------------------------------------------------------

  async getAltchaChallenge(): Promise<AltchaChallenge> {
    return this.enveloped<AltchaChallenge>(CORE_OPERATIONS.getAltchaChallenge.path)
  }

  async register(input: {
    name: string
    email: string
    password: string
    altcha: string
  }): Promise<User> {
    const path = `${CORE_OPERATIONS.register.path}?altcha=${encodeURIComponent(input.altcha)}`
    return this.enveloped<User>(path, {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        password: input.password,
      }),
    })
  }

  async login(email: string, password: string): Promise<User> {
    const body = JSON.stringify({ email, password })

    if (this.transport === "cookie") {
      return this.enveloped<User>(CORE_OPERATIONS.loginCookie.path, { method: "POST", body })
    }

    // The bearer endpoint returns the token at the top level rather than in the
    // envelope, so that conventional OAuth2 tooling can find it.
    const token = await this.raw<TokenResponse>(CORE_OPERATIONS.loginJWT.path, {
      method: "POST",
      body,
    })
    this.storage!.write(token.accessToken)
    return this.getCurrentUser()
  }

  async logout(): Promise<void> {
    const path =
      this.transport === "cookie"
        ? CORE_OPERATIONS.logoutCookie.path
        : CORE_OPERATIONS.logoutJWT.path
    try {
      await this.enveloped<unknown>(path, { method: "POST" })
    } finally {
      // The local session is discarded even if the call failed. Leaving a
      // token behind after the user asked to sign out is the worse outcome.
      this.storage?.clear()
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.enveloped<User>(CORE_OPERATIONS.getCurrentUser.path)
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
    return this.enveloped<User>(CORE_OPERATIONS.updateCurrentUser.path, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  }

  // -- password and address -----------------------------------------------

  async forgotPassword(email: string): Promise<void> {
    await this.enveloped<unknown>(CORE_OPERATIONS.forgotPassword.path, {
      method: "POST",
      body: JSON.stringify({ email }),
    })
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.enveloped<unknown>(CORE_OPERATIONS.resetPassword.path, {
      method: "POST",
      body: JSON.stringify({ token, password }),
    })
  }

  async requestVerification(email: string): Promise<void> {
    await this.enveloped<unknown>(CORE_OPERATIONS.requestVerifyToken.path, {
      method: "POST",
      body: JSON.stringify({ email }),
    })
  }

  async verify(token: string): Promise<User> {
    return this.enveloped<User>(CORE_OPERATIONS.verifyUser.path, {
      method: "POST",
      body: JSON.stringify({ token }),
    })
  }

  // -- plumbing -----------------------------------------------------------

  private headers(hasBody: boolean): HeadersInit {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (hasBody) headers["Content-Type"] = "application/json"

    if (this.transport === "bearer") {
      const token = this.storage!.read()
      if (token) headers["Authorization"] = `Bearer ${token}`
    }
    return headers
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(init.body != null), ...init.headers },
        // Only the cookie transport needs credentials. Omitting them for
        // bearer means the API may answer with a wildcard CORS origin, which
        // is what lets the Toy build talk to it at all.
        credentials: this.transport === "cookie" ? "include" : "omit",
      })
    } catch {
      // A rejected fetch is DNS, TLS, offline or a CORS preflight refusal —
      // never an application error. Reported distinctly so the UI can say
      // "cannot reach the server" instead of "wrong password".
      throw new AuthError("NetworkError", "Could not reach the server", 0)
    }
  }

  /** Unwraps the standard envelope, turning a failure into an AuthError. */
  private async enveloped<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.send(path, init)
    const payload = await this.parse<Envelope<T>>(response)

    if (!response.ok) {
      throw new AuthError(
        normaliseCode(payload?.errorCode, response.status),
        payload?.errorMessage || response.statusText,
        response.status,
      )
    }
    return payload.data as T
  }

  /** For the one endpoint that answers outside the envelope. */
  private async raw<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.send(path, init)
    const payload = await this.parse<T & Partial<Envelope<never>>>(response)

    if (!response.ok) {
      throw new AuthError(
        normaliseCode(payload?.errorCode, response.status),
        payload?.errorMessage || response.statusText,
        response.status,
      )
    }
    return payload
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text()
    if (!text) return {} as T
    try {
      return JSON.parse(text) as T
    } catch {
      // A proxy or edge error page rather than the API. Reporting it as a
      // parse failure would send the user hunting in the wrong place.
      throw new AuthError(
        response.ok ? "UnknownError" : normaliseCode(undefined, response.status),
        "The server returned an unexpected response",
        response.status,
      )
    }
  }
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
