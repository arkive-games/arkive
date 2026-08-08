import { describe, expect, it } from "vitest"

import { CoreClient, normaliseCode } from "./client"
import { createMemoryTokenStorage } from "./storage"
import { AuthError } from "./types"

const USER = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "alice",
  email: "alice@example.com",
  isActive: true,
  isSuperuser: false,
  isVerified: false,
  createdAt: "2026-08-09T00:00:00Z",
  updatedAt: "2026-08-09T00:00:00Z",
}

interface Call {
  url: string
  init: RequestInit
}

/** Records requests and replays canned responses. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = []
  const queue = [...responses]

  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const next = queue.shift() ?? { status: 500, body: {} }
    const status = next.status ?? 200
    return new Response(JSON.stringify(next.body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch

  return { impl, calls }
}

function ok<T>(data: T) {
  return { body: { errorCode: "Success", errorMessage: "", showType: 0, data } }
}

describe("transport", () => {
  it("sends credentials and no Authorization header on the cookie transport", async () => {
    const { impl, calls } = fakeFetch([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com/api/v1/core",
      transport: "cookie",
      fetchImpl: impl,
    })

    await client.login("alice@example.com", "hunter2hunter2")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://api.example.com/api/v1/core/auth/cookie/login")
    // The cookie is the credential; without this the browser withholds it.
    expect(calls[0].init.credentials).toBe("include")
    expect(headerOf(calls[0], "Authorization")).toBeUndefined()
  })

  it("sends Authorization and omits credentials on the bearer transport", async () => {
    const storage = createMemoryTokenStorage()
    const { impl, calls } = fakeFetch([
      { body: { accessToken: "tok-123", tokenType: "bearer", expiresAt: "2026-09-01T00:00:00Z" } },
      ok(USER),
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com/api/v1/core",
      transport: "bearer",
      storage,
      fetchImpl: impl,
    })

    const user = await client.login("alice@example.com", "hunter2hunter2")

    expect(user.email).toBe("alice@example.com")
    expect(storage.read()).toBe("tok-123")
    expect(calls[0].url).toBe("https://api.example.com/api/v1/core/auth/jwt/login")
    // Omitting credentials is what allows the API to answer a Toy iframe with a
    // wildcard CORS origin.
    expect(calls[0].init.credentials).toBe("omit")
    // The follow-up /users/me call must carry the token just stored.
    expect(headerOf(calls[1], "Authorization")).toBe("Bearer tok-123")
  })

  it("refuses to construct a bearer client with nowhere to put the token", () => {
    expect(
      () => new CoreClient({ baseUrl: "https://api.example.com", transport: "bearer" }),
    ).toThrow(/requires a TokenStorage/)
  })

  it("discards the stored token even when logout fails on the server", async () => {
    const storage = createMemoryTokenStorage()
    storage.write("tok-123")
    const { impl } = fakeFetch([{ status: 500, body: { errorCode: "InternalServerError" } }])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "bearer",
      storage,
      fetchImpl: impl,
    })

    await expect(client.logout()).rejects.toBeInstanceOf(AuthError)
    // Keeping a token after the user asked to sign out is the worse failure.
    expect(storage.read()).toBeNull()
  })
})

describe("envelope handling", () => {
  it("unwraps the data field", async () => {
    const { impl } = fakeFetch([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })
    await expect(client.getCurrentUser()).resolves.toMatchObject({ name: "alice" })
  })

  it("turns an error envelope into an AuthError carrying the server's code", async () => {
    const { impl } = fakeFetch([
      {
        status: 401,
        body: {
          errorCode: "UserBadCredentialsError",
          errorMessage: "incorrect email or password",
          showType: 2,
          data: null,
        },
      },
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })

    await expect(client.login("a@b.com", "wrong")).rejects.toMatchObject({
      code: "UserBadCredentialsError",
      status: 401,
    })
  })

  it("reports an anonymous visitor as null rather than an error", async () => {
    const { impl } = fakeFetch([
      { status: 401, body: { errorCode: "UnauthorizedError", errorMessage: "", showType: 2, data: null } },
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })
    // Session restore runs through this on every page load; being signed out
    // is the expected case, not a failure to surface.
    await expect(client.currentUserOrNull()).resolves.toBeNull()
  })

  it("does not mistake a proxy error page for an API response", async () => {
    const impl = (async () =>
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })) as unknown as typeof fetch
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })

    await expect(client.getCurrentUser()).rejects.toMatchObject({ status: 502 })
  })

  it("distinguishes an unreachable server from a rejected request", async () => {
    const impl = (async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as typeof fetch
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })

    await expect(client.getCurrentUser()).rejects.toMatchObject({ code: "NetworkError" })
  })

  it("passes the altcha solution as a query parameter, escaped", async () => {
    const { impl, calls } = fakeFetch([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      fetchImpl: impl,
    })

    await client.register({
      name: "alice",
      email: "alice@example.com",
      password: "hunter2hunter2",
      altcha: "abc+def/ghi=",
    })

    // Base64 contains +, / and =, all of which change meaning in a query string.
    expect(calls[0].url).toContain("altcha=abc%2Bdef%2Fghi%3D")
  })
})

describe("normaliseCode", () => {
  it("prefers the server's code", () => {
    expect(normaliseCode("UserBadCredentialsError", 401)).toBe("UserBadCredentialsError")
  })

  it("falls back to the status when the code is unknown or absent", () => {
    expect(normaliseCode(undefined, 401)).toBe("UnauthorizedError")
    expect(normaliseCode(undefined, 403)).toBe("PermissionError")
    expect(normaliseCode(undefined, 429)).toBe("RateLimitExceededError")
    expect(normaliseCode(undefined, 422)).toBe("ValidationError")
    expect(normaliseCode("SomeCodeAddedLater", 500)).toBe("UnknownError")
  })
})

function headerOf(call: Call, name: string): string | undefined {
  const headers = call.init.headers as Record<string, string> | undefined
  if (!headers) return undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}
