import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { CORE_OPERATIONS } from "./client"

/**
 * Guards the hand-written client against the backend moving underneath it.
 *
 * The design calls for a generated client (`@hey-api/openapi-ts`). Until that
 * exists, this test buys the property that actually matters: if the backend
 * renames an operation, moves a path or changes a method, CI fails here rather
 * than a user's sign-in failing in production. Without it, hand-writing the
 * client would be a silent-drift hazard.
 *
 * When the generated client lands, delete this file — the generator provides the
 * same guarantee by construction.
 */
const SPEC_PATH = fileURLToPath(
  new URL("../../../../backend-go/openapi/core.json", import.meta.url),
)

interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId?: string }>>
}

function loadSpec(): OpenApiDocument {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiDocument
}

describe("core client matches the committed OpenAPI document", () => {
  it("finds the specification where the backend writes it", () => {
    expect(() => loadSpec()).not.toThrow()
  })

  it("declares every operation it calls with the same path and method", () => {
    const spec = loadSpec()

    const missing: string[] = []
    for (const [operationId, { method, path }] of Object.entries(CORE_OPERATIONS)) {
      const item = spec.paths[path]
      if (!item) {
        missing.push(`${operationId}: path ${path} is absent from the specification`)
        continue
      }
      const operation = item[method.toLowerCase()]
      if (!operation) {
        missing.push(`${operationId}: ${method} ${path} is absent from the specification`)
        continue
      }
      if (operation.operationId !== operationId) {
        missing.push(
          `${operationId}: ${method} ${path} is declared as "${operation.operationId}" instead`,
        )
      }
    }

    expect(missing).toEqual([])
  })

  it("does not silently miss an auth operation the backend has added", () => {
    const spec = loadSpec()

    // Every /auth/* operation is expected to be handled by this client; a new
    // one appearing in the specification means the UI has a gap. /users/* is
    // deliberately excluded, since most of it is administrative.
    const specAuthOps = new Set<string>()
    for (const [path, item] of Object.entries(spec.paths)) {
      if (!path.startsWith("/auth/")) continue
      for (const operation of Object.values(item)) {
        if (operation.operationId) specAuthOps.add(operation.operationId)
      }
    }

    const handled = new Set(Object.keys(CORE_OPERATIONS))
    const unhandled = [...specAuthOps].filter((id) => !handled.has(id)).sort()

    expect(unhandled).toEqual([])
  })
})
