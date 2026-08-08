import type { AltchaChallenge } from "./types"

/**
 * Solves an Altcha proof-of-work challenge and encodes the payload the server
 * expects.
 *
 * The protocol is a brute-force search: find the `n` in `[0, maxNumber]` whose
 * `sha256(salt + n)` hex digest equals the published challenge. Implemented
 * directly rather than via the `altcha` widget package because the search is
 * eight lines, and owning it means controlling the two things that matter for
 * UX — yielding to the event loop so the page does not freeze, and aborting
 * when the dialog closes mid-search.
 */
export interface SolveOptions {
  /** Called with a 0..1 fraction so the UI can show progress. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  /** Iterations between yields. Lower is smoother but slower overall. */
  chunkSize?: number
}

export class AltchaAbortError extends Error {
  constructor() {
    super("Altcha solving was aborted")
    this.name = "AltchaAbortError"
  }
}

export class AltchaUnsolvableError extends Error {
  constructor(maxNumber: number) {
    super(`No solution found within maxNumber=${maxNumber}`)
    this.name = "AltchaUnsolvableError"
  }
}

export async function solveAltcha(
  challenge: AltchaChallenge,
  options: SolveOptions = {},
): Promise<string> {
  const { onProgress, signal, chunkSize = 500 } = options

  if (challenge.algorithm !== "SHA-256") {
    throw new Error(`Unsupported Altcha algorithm: ${challenge.algorithm}`)
  }

  const encoder = new TextEncoder()
  const max = Math.max(0, challenge.maxNumber)

  for (let n = 0; n <= max; n++) {
    if (signal?.aborted) throw new AltchaAbortError()

    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(challenge.salt + n))
    if (toHex(digest) === challenge.challenge) {
      onProgress?.(1)
      return encodePayload(challenge, n)
    }

    // Yield periodically. Without this the loop monopolises the main thread and
    // the "verifying" indicator never paints, which looks like a hang.
    if (n % chunkSize === 0) {
      onProgress?.(max === 0 ? 1 : n / max)
      await yieldToEventLoop()
    }
  }

  throw new AltchaUnsolvableError(max)
}

/** Base64-encodes the solution in the shape the server verifies. */
export function encodePayload(challenge: AltchaChallenge, number: number): string {
  const json = JSON.stringify({
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    number,
    salt: challenge.salt,
    signature: challenge.signature,
  })
  // btoa is byte-oriented; the payload is ASCII (hex digests and a base64-ish
  // salt) so no UTF-8 escaping is needed, but guard anyway in case a future
  // server adds a non-ASCII field.
  return btoa(unescape(encodeURIComponent(json)))
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0")
  }
  return out
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
