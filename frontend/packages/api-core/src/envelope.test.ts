import { describe, expect, it } from "vitest"

import { ApiError, isEnvelope, normaliseCode, unwrap } from "./envelope"

describe("recognising the envelope", () => {
  it("accepts a wrapped body", () => {
    expect(isEnvelope({ errorCode: "Success", errorMessage: "", showType: 0, data: { a: 1 } })).toBe(
      true,
    )
  })

  it("accepts a wrapped body whose payload is null, as an empty response is", () => {
    expect(isEnvelope({ errorCode: "Success", errorMessage: "", showType: 0, data: null })).toBe(
      true,
    )
  })

  // This is the case the whole structural test exists for: POST /auth/jwt/login
  // answers with the token itself, not an envelope. Treating it as wrapped would
  // return undefined for accessToken and break sign-in for the bearer transport.
  it("rejects the bearer login response, which is not wrapped", () => {
    expect(isEnvelope({ accessToken: "abc", expiresAt: 1, tokenType: "bearer" })).toBe(false)
  })

  it("rejects primitives and null", () => {
    expect(isEnvelope(null)).toBe(false)
    expect(isEnvelope("Success")).toBe(false)
    expect(isEnvelope(42)).toBe(false)
  })
})

describe("unwrapping", () => {
  it("returns the payload from a successful envelope", () => {
    const body = { errorCode: "Success", errorMessage: "", showType: 0, data: { name: "alice" } }
    expect(unwrap<{ name: string }>(body, 200, "OK")).toEqual({ name: "alice" })
  })

  it("returns an unwrapped body untouched, so the token survives", () => {
    const token = { accessToken: "abc", expiresAt: 1, tokenType: "bearer" }
    expect(unwrap<typeof token>(token, 200, "OK")).toEqual(token)
  })

  it("throws the backend's own code, not just the status", () => {
    const body = {
      errorCode: "UserEmailAlreadyExistsError",
      errorMessage: "that email address is already registered",
      showType: 2,
      data: null,
    }
    try {
      unwrap(body, 409, "Conflict")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      const api = error as ApiError
      // 409 alone cannot distinguish a taken name from a taken email; the code can.
      expect(api.code).toBe("UserEmailAlreadyExistsError")
      expect(api.message).toBe("that email address is already registered")
      expect(api.status).toBe(409)
    }
  })

  // The envelope is authoritative even when the status disagrees, which matters
  // because a proxy can rewrite a status but not the body.
  it("throws when the envelope reports a failure despite a 200", () => {
    const body = { errorCode: "ValidationError", errorMessage: "no", showType: 2, data: null }
    expect(() => unwrap(body, 200, "OK")).toThrow(ApiError)
  })

  // axios represents an absent body as the empty string. Reported as undefined,
  // which the generated client then turns into `{}` -- the shape a caller of an
  // empty operation expects.
  it("reads an absent body as absent rather than as text", () => {
    expect(unwrap("", 204, "No Content")).toBeUndefined()
    expect(unwrap("", 200, "OK")).toBeUndefined()
  })

  it("throws for text on a successful status, which is a proxy page", () => {
    expect(() => unwrap("<html>hello</html>", 200, "OK")).toThrow(/unexpected response/)
  })

  it("throws for an unwrapped error body, which carries no code", () => {
    try {
      unwrap("<html>502 Bad Gateway</html>", 502, "Bad Gateway")
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as ApiError).code).toBe("InternalServerError")
      expect((error as ApiError).status).toBe(502)
    }
  })
})

describe("normalising a missing code", () => {
  it("prefers the code the backend sent", () => {
    expect(normaliseCode("UserNotFoundError", 404)).toBe("UserNotFoundError")
  })

  it.each([
    [401, "UnauthorizedError"],
    [403, "PermissionError"],
    [404, "NotFoundError"],
    [409, "IntegrityError"],
    [422, "ValidationError"],
    [429, "RateLimitExceededError"],
    [503, "StorageUnavailableError"],
    [500, "InternalServerError"],
    [418, "Error"],
  ])("maps a bare %i to %s", (status, expected) => {
    expect(normaliseCode(undefined, status)).toBe(expected)
  })
})
