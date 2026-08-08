import type { TokenStorage } from "./types"

/**
 * Bearer-token storage backed by localStorage.
 *
 * Only for surfaces where the httpOnly cookie cannot reach — in practice the
 * Bilibili Toy iframe. A token in localStorage is readable by any script on the
 * page, so this is a deliberate downgrade accepted because the alternative on
 * that surface is no login at all.
 *
 * Every operation is guarded: storage throws in Safari private browsing and
 * when a third-party iframe has storage access denied, and a thrown exception
 * while reading a token must not take the whole app down.
 */
export function createLocalTokenStorage(key = "arkive.auth.token"): TokenStorage {
  return {
    read() {
      try {
        return globalThis.localStorage?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write(token: string) {
      try {
        globalThis.localStorage?.setItem(key, token)
      } catch {
        // Storage denied: the session lives for this page only. Better than
        // failing the sign-in the user just completed.
      }
    },
    clear() {
      try {
        globalThis.localStorage?.removeItem(key)
      } catch {
        // Nothing to do; the in-memory session is dropped by the caller.
      }
    },
  }
}

/** Keeps the token in memory only. Used when storage is unavailable. */
export function createMemoryTokenStorage(): TokenStorage {
  let token: string | null = null
  return {
    read: () => token,
    write: (value: string) => {
      token = value
    },
    clear: () => {
      token = null
    },
  }
}
