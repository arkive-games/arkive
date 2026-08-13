import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios"
import { beforeEach, describe, expect, it } from "vitest"

import { type ApiClient, createApiClient, result, type TokenStorage } from "./client"
import { ApiError } from "./envelope"
import { getCurrentUser, loginJwt, searchUsers, updateCurrentUser } from "./generated"

/** What the stub adapter was asked to send, so a test can assert on the request. */
interface Seen {
  url?: string
  method?: string
  headers: Record<string, unknown>
  data?: unknown
  withCredentials?: boolean
}

/**
 * Builds a client whose axios instance answers from a canned reply instead of the
 * network, which is the only way to exercise the generated functions and the
 * interceptors together — the thing that had to be proven before committing to
 * this design.
 */
function harness(
  reply: { status: number; body: unknown },
  options: { transport?: "cookie" | "bearer"; storage?: TokenStorage } = {},
): { api: ApiClient; seen: Seen } {
  const seen: Seen = { headers: {} }
  // Deliberately does not set `withCredentials`: an injected instance is exactly
  // the case where createApiClient used to skip it, so leaving it unset is what
  // proves the interceptor now sets it.
  const instance = axios.create({
    baseURL: "https://api.example.test",
    adapter: async (config: InternalAxiosRequestConfig) => {
      seen.url = config.url
      seen.method = config.method
      seen.headers = { ...config.headers }
      seen.data = config.data
      seen.withCredentials = config.withCredentials
      const response: AxiosResponse = {
        data: reply.body,
        status: reply.status,
        statusText: reply.status === 200 ? "OK" : "Error",
        headers: {},
        config,
      }
      if (reply.status >= 400) {
        // What axios itself does for a failing status: reject with an AxiosError
        // that carries the response, so the error interceptor can read the body.
        throw new AxiosError(
          `Request failed with status code ${reply.status}`,
          "ERR_BAD_REQUEST",
          config,
          {},
          response,
        )
      }
      return response
    },
  })

  return {
    api: createApiClient({
      baseUrl: "https://api.example.test",
      transport: options.transport,
      storage: options.storage,
      axiosInstance: instance,
    }),
    seen,
  }
}

function envelope(data: unknown, errorCode = "Success", errorMessage = "") {
  return { errorCode, errorMessage, showType: 0, data }
}

const alice = {
  id: "11111111-1111-1111-1111-111111111111",
  uid: 10001,
  specialUid: null,
  name: "alice",
  email: "alice@example.test",
  avatarUrl: null,
  isActive: true,
  isSuperuser: false,
  isVerified: true,
}

describe("a generated operation over the envelope interceptor", () => {
  it("hands back the payload, not the wrapper", async () => {
    const { api } = harness({ status: 200, body: envelope(alice) })

    const user = await result(getCurrentUser({ client: api.client, throwOnError: true }))

    // The assertion that matters: `user.name`, not `user.data.name`.
    expect(user.name).toBe("alice")
    expect(user.uid).toBe(10001)
    expect(user).not.toHaveProperty("errorCode")
  })

  it("resolves the path against the base URL", async () => {
    const { api, seen } = harness({ status: 200, body: envelope(alice) })

    await result(getCurrentUser({ client: api.client, throwOnError: true }))

    expect(seen.url).toBe("https://api.example.test/users/me")
    expect(seen.method).toBe("get")
  })

  it("serialises query parameters", async () => {
    const { api, seen } = harness({ status: 200, body: envelope({ items: [], total: 0 }) })

    await result(
      searchUsers({
        client: api.client,
        throwOnError: true,
        query: { name: "ali ce", pageSize: 5 },
      }),
    )

    expect(seen.url).toBe("https://api.example.test/users/search?name=ali%20ce&pageSize=5")
  })

  it("sends a JSON body", async () => {
    const { api, seen } = harness({ status: 200, body: envelope(alice) })

    await result(
      updateCurrentUser({ client: api.client, throwOnError: true, body: { name: "alice2" } }),
    )

    expect(JSON.parse(seen.data as string)).toEqual({ name: "alice2" })
  })

  it("throws the backend's code, so a caller can tell two 409s apart", async () => {
    const { api } = harness({
      status: 409,
      body: envelope(null, "UserAlreadyExistsError", "that name is taken"),
    })

    await expect(
      result(updateCurrentUser({ client: api.client, throwOnError: true, body: { name: "bob" } })),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "UserAlreadyExistsError",
      message: "that name is taken",
      status: 409,
    })
  })

  it("throws when a 200 carries a failing envelope", async () => {
    const { api } = harness({ status: 200, body: envelope(null, "ValidationError", "no") })

    await expect(
      result(getCurrentUser({ client: api.client, throwOnError: true })),
    ).rejects.toBeInstanceOf(ApiError)
  })

  // Not enveloped, and the one operation that is not: unwrapping it would return
  // undefined for the access token and break sign-in for the bearer transport
  // only — the Bilibili Toy, where a regression is slowest to be noticed.
  it("leaves the bearer login response alone", async () => {
    const token = { accessToken: "eyJhbGciOi", expiresAt: 1786000000, tokenType: "bearer" }
    const { api } = harness({ status: 200, body: token })

    const got = await result(
      loginJwt({
        client: api.client,
        throwOnError: true,
        body: { email: "alice@example.test", password: "hunter2" },
      }),
    )

    expect(got.accessToken).toBe("eyJhbGciOi")
  })
})

describe("credentials", () => {
  it("asks for the cookie and sends no Authorization header", async () => {
    const { api, seen } = harness({ status: 200, body: envelope(alice) })

    await result(getCurrentUser({ client: api.client, throwOnError: true }))

    expect(seen.withCredentials).toBe(true)
    expect(seen.headers.Authorization).toBeUndefined()
  })

  it("sends the bearer token and does not ask for the cookie", async () => {
    let stored: string | null = "eyJhbGciOi"
    const storage: TokenStorage = {
      read: () => stored,
      write: (t) => {
        stored = t
      },
      clear: () => {
        stored = null
      },
    }
    const { api, seen } = harness({ status: 200, body: envelope(alice) }, {
      transport: "bearer",
      storage,
    })

    await result(getCurrentUser({ client: api.client, throwOnError: true }))

    expect(seen.headers.Authorization).toBe("Bearer eyJhbGciOi")
    expect(seen.withCredentials).toBe(false)
  })

  it("omits the header when there is no token, so an anonymous call stays anonymous", async () => {
    const storage: TokenStorage = { read: () => null, write: () => {}, clear: () => {} }
    const { api, seen } = harness({ status: 200, body: envelope(alice) }, {
      transport: "bearer",
      storage,
    })

    await result(getCurrentUser({ client: api.client, throwOnError: true }))

    expect(seen.headers.Authorization).toBeUndefined()
  })

  it("refuses to build a bearer client with nowhere to read the token from", () => {
    expect(() => createApiClient({ baseUrl: "https://api.example.test", transport: "bearer" })).toThrow(
      /requires a TokenStorage/,
    )
  })
})

describe("omitting throwOnError", () => {
  // Pinned rather than fixed: the generated client's default mode returns a
  // rejection instead of propagating it, so `data` is undefined and only the
  // thrown ApiError's own fields survive. This is why `result()` requires
  // `throwOnError: true`, and this test exists so the trap is documented in
  // executable form rather than in a comment nobody reads.
  it("yields no data, which is why result() demands the flag", async () => {
    const { api } = harness({
      status: 409,
      body: envelope(null, "UserAlreadyExistsError", "that name is taken"),
    })

    const returned = (await updateCurrentUser({
      client: api.client,
      body: { name: "bob" },
    })) as unknown as ApiError & { data?: unknown }

    expect(returned).toBeInstanceOf(ApiError)
    expect(returned.code).toBe("UserAlreadyExistsError")
    expect(returned.data).toBeUndefined()
  })
})

describe("a failure with no response at all", () => {
  let api: ApiClient

  beforeEach(() => {
    const instance = axios.create({
      baseURL: "https://api.example.test",
      adapter: async () => {
        throw new AxiosError("Network Error", "ERR_NETWORK")
      },
    })
    api = createApiClient({ baseUrl: "https://api.example.test", axiosInstance: instance })
  })

  it("propagates the original error rather than inventing a code", async () => {
    // Offline, DNS, TLS or a refused preflight carries no errorCode. Reporting one
    // would claim the server said something it never said.
    await expect(
      result(getCurrentUser({ client: api.client, throwOnError: true })),
    ).rejects.toMatchObject({ code: "ERR_NETWORK" })
  })
})
