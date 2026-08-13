import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios"
import { describe, expect, it } from "vitest"

import { CoreClient, normaliseCode } from "./client"
import { createMemoryTokenStorage } from "./storage"
import { AuthError } from "./types"

const USER = {
  id: "11111111-2222-3333-4444-555555555555",
  uid: 10001,
  specialUid: null,
  name: "alice",
  email: "alice@example.com",
  avatarUrl: "https://cdn.example.com/avatars/presets/01.webp",
  isActive: true,
  isSuperuser: false,
  isVerified: false,
  createdAt: "2026-08-09T00:00:00Z",
  updatedAt: "2026-08-09T00:00:00Z",
}

interface Call {
  url: string
  method?: string
  headers: Record<string, unknown>
  withCredentials?: boolean
  body?: unknown
}

/**
 * Records requests and replays canned responses.
 *
 * An axios adapter rather than a `fetch` stub: the client now reaches the network
 * through the generated client's axios instance, so this is the seam that exists.
 */
function fakeTransport(responses: Array<{ status?: number; body: unknown; text?: boolean }>) {
  const calls: Call[] = []
  const queue = [...responses]

  const instance = axios.create({
    adapter: async (config: InternalAxiosRequestConfig) => {
      calls.push({
        url: config.url ?? "",
        method: config.method,
        headers: { ...config.headers },
        withCredentials: config.withCredentials,
        body: config.data,
      })

      const next = queue.shift() ?? { status: 500, body: {} }
      const status = next.status ?? 200
      const response: AxiosResponse = {
        data: next.body,
        status,
        statusText: status === 200 ? "OK" : "Error",
        headers: {},
        config,
      }
      if (status >= 400) {
        throw new AxiosError(
          `Request failed with status code ${status}`,
          "ERR_BAD_REQUEST",
          config,
          {},
          response,
        )
      }
      return response
    },
  })

  return { instance, calls }
}

function ok<T>(data: T) {
  return { body: { errorCode: "Success", errorMessage: "", showType: 0, data } }
}

describe("transport", () => {
  it("sends credentials and no Authorization header on the cookie transport", async () => {
    const { instance, calls } = fakeTransport([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com/api/v1/core",
      transport: "cookie",
      axiosInstance: instance,
    })

    await client.login("alice@example.com", "hunter2hunter2")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://api.example.com/api/v1/core/auth/cookie/login")
    // The cookie is the credential; without this the browser withholds it.
    expect(calls[0].withCredentials).toBe(true)
    expect(headerOf(calls[0], "Authorization")).toBeUndefined()
  })

  it("sends Authorization and omits credentials on the bearer transport", async () => {
    const storage = createMemoryTokenStorage()
    const { instance, calls } = fakeTransport([
      { body: { accessToken: "tok-123", tokenType: "bearer", expiresAt: "2026-09-01T00:00:00Z" } },
      ok(USER),
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com/api/v1/core",
      transport: "bearer",
      storage,
      axiosInstance: instance,
    })

    const user = await client.login("alice@example.com", "hunter2hunter2")

    expect(user.email).toBe("alice@example.com")
    expect(storage.read()).toBe("tok-123")
    expect(calls[0].url).toBe("https://api.example.com/api/v1/core/auth/jwt/login")
    // Omitting credentials is what allows the API to answer a Toy iframe with a
    // wildcard CORS origin.
    expect(calls[0].withCredentials).toBe(false)
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
    const { instance } = fakeTransport([
      { status: 500, body: { errorCode: "InternalServerError", errorMessage: "", showType: 2, data: null } },
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "bearer",
      storage,
      axiosInstance: instance,
    })

    await expect(client.logout()).rejects.toBeInstanceOf(AuthError)
    // Keeping a token after the user asked to sign out is the worse failure.
    expect(storage.read()).toBeNull()
  })
})

describe("envelope handling", () => {
  it("unwraps the data field", async () => {
    const { instance } = fakeTransport([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })
    await expect(client.getCurrentUser()).resolves.toMatchObject({ name: "alice" })
  })

  it("turns an error envelope into an AuthError carrying the server's code", async () => {
    const { instance } = fakeTransport([
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
      axiosInstance: instance,
    })

    await expect(client.login("a@b.com", "wrong")).rejects.toMatchObject({
      name: "AuthError",
      code: "UserBadCredentialsError",
      status: 401,
    })
  })

  it("reports an anonymous visitor as null rather than an error", async () => {
    const { instance } = fakeTransport([
      {
        status: 401,
        body: { errorCode: "UnauthorizedError", errorMessage: "", showType: 2, data: null },
      },
    ])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })
    // Session restore runs through this on every page load; being signed out is
    // the expected case, not a failure to surface.
    await expect(client.currentUserOrNull()).resolves.toBeNull()
  })

  it("does not mistake a proxy error page for an API response", async () => {
    const { instance } = fakeTransport([{ status: 502, body: "<html>502 Bad Gateway</html>" }])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })

    await expect(client.getCurrentUser()).rejects.toMatchObject({ status: 502 })
  })

  it("does not mistake a proxy page that answered 200 for a user", async () => {
    const { instance } = fakeTransport([{ status: 200, body: "<html>hello</html>" }])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })

    // An edge cache can serve a 200 that never reached the API. Passing it
    // through would hand the UI an HTML document typed as a User.
    await expect(client.getCurrentUser()).rejects.toMatchObject({ code: "UnknownError" })
  })

  it("distinguishes an unreachable server from a rejected request", async () => {
    const instance = axios.create({
      adapter: async () => {
        throw new AxiosError("Network Error", "ERR_NETWORK")
      },
    })
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })

    await expect(client.getCurrentUser()).rejects.toMatchObject({ code: "NetworkError" })
  })

  it("passes the altcha solution as a query parameter, escaped", async () => {
    const { instance, calls } = fakeTransport([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
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

  it("sends the registration fields as a JSON body", async () => {
    const { instance, calls } = fakeTransport([ok(USER)])
    const client = new CoreClient({
      baseUrl: "https://api.example.com",
      transport: "cookie",
      axiosInstance: instance,
    })

    await client.register({
      name: "alice",
      email: "alice@example.com",
      password: "hunter2hunter2",
      altcha: "abc",
    })

    // The solution belongs in the query string, so it must NOT also appear in the
    // body: the backend reads one of the two, and duplicating it invites drift.
    expect(JSON.parse(calls[0].body as string)).toEqual({
      name: "alice",
      email: "alice@example.com",
      password: "hunter2hunter2",
    })
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
  const key = Object.keys(call.headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? (call.headers[key] as string) : undefined
}
