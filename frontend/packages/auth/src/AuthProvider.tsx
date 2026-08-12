import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { CoreClient } from "./client"
import { consumeResetToken } from "./resetLink"
import { createLocalTokenStorage } from "./storage"
import { AuthError, type AuthTransport, type TokenStorage, type User } from "./types"

/**
 * loading  — the initial session probe has not finished. Distinct from
 *            anonymous so the top bar can avoid flashing "Sign in" at a user
 *            who is in fact signed in.
 * anonymous — probe finished, nobody signed in.
 * authenticated — probe finished, `user` is populated.
 */
export type AuthStatus = "loading" | "anonymous" | "authenticated"

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** Last failure, for surfaces that render errors outside the dialog. */
  error: AuthError | null
  client: CoreClient

  /**
   * Token from an emailed reset link, or null.
   *
   * Read here rather than in the account control for three reasons the control
   * cannot satisfy: the provider is always mounted, so the token is stripped
   * from the URL even for a visitor who is already signed in and therefore
   * renders no control at all; several controls can mount at once (meta renders
   * a mobile and a desktop one, hidden from each other by CSS, so both effects
   * run), and whichever happened to run first would otherwise consume the token
   * from under the others; and claiming becomes explicit rather than a race.
   */
  pendingResetToken: string | null
  /** Clears the pending token, e.g. once the reset dialog has been dismissed. */
  clearPendingResetToken(): void
  /**
   * False when no API is configured. Exposed so the account control can hide
   * itself rather than every host repeating the check at the call site.
   */
  enabled: boolean

  login(email: string, password: string): Promise<User>
  register(input: { name: string; email: string; password: string; altcha: string }): Promise<User>
  logout(): Promise<void>
  refresh(): Promise<void>
  clearError(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export interface AuthProviderProps {
  /**
   * Origin plus module prefix, e.g. `https://api.tc-imba.com/api/v1/core`.
   * Passed in rather than read from import.meta.env so this package stays
   * environment-agnostic and testable, matching how the other shared packages
   * take injected adapters.
   */
  baseUrl: string
  /**
   * `cookie` on the *.tc-imba.com sites, where an httpOnly cookie gives SSO
   * across every game and cannot be read by script. `bearer` inside a Bilibili
   * Toy, where that cookie is third-party and blocked.
   */
  transport?: AuthTransport
  storage?: TokenStorage
  /**
   * When false the provider stays anonymous and performs no requests. Lets a
   * host disable auth entirely — a Toy build without a configured API, say —
   * without conditionally mounting the provider and breaking hook order.
   */
  enabled?: boolean
  fetchImpl?: typeof fetch
  children: ReactNode
}

export function AuthProvider({
  baseUrl,
  transport = "cookie",
  storage,
  enabled = true,
  fetchImpl,
  children,
}: AuthProviderProps) {
  const client = useMemo(
    () =>
      new CoreClient({
        baseUrl,
        transport,
        storage: transport === "bearer" ? (storage ?? createLocalTokenStorage()) : storage,
        fetchImpl,
      }),
    [baseUrl, transport, storage, fetchImpl],
  )

  const [status, setStatus] = useState<AuthStatus>(enabled ? "loading" : "anonymous")
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<AuthError | null>(null)

  // Read once, on the first render of the provider, so the credential leaves the
  // address bar immediately whatever the page goes on to render.
  const [pendingResetToken, setPendingResetToken] = useState<string | null>(() =>
    enabled ? consumeResetToken() : null,
  )

  // Guards against a resolved probe writing state after unmount, and against
  // an older probe overwriting a newer one when baseUrl changes.
  const generation = useRef(0)

  const probe = useCallback(async () => {
    if (!enabled) {
      setStatus("anonymous")
      setUser(null)
      return
    }
    const mine = ++generation.current
    try {
      const found = await client.currentUserOrNull()
      if (mine !== generation.current) return
      setUser(found)
      setStatus(found ? "authenticated" : "anonymous")
    } catch (caught) {
      if (mine !== generation.current) return
      // A failed probe is not a failed login. The visitor is treated as
      // anonymous and no error is surfaced, because an unreachable API should
      // not put a red banner in front of someone who never tried to sign in.
      setUser(null)
      setStatus("anonymous")
    }
  }, [client, enabled])

  useEffect(() => {
    void probe()
    return () => {
      // Invalidate any in-flight probe so it cannot set state after unmount.
      generation.current++
    }
  }, [probe])

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null)
      try {
        const signedIn = await client.login(email, password)
        generation.current++
        setUser(signedIn)
        setStatus("authenticated")
        return signedIn
      } catch (caught) {
        const failure = asAuthError(caught)
        setError(failure)
        throw failure
      }
    },
    [client],
  )

  const register = useCallback(
    async (input: { name: string; email: string; password: string; altcha: string }) => {
      setError(null)
      try {
        const created = await client.register(input)
        // Registration does not open a session, so sign in with the credentials
        // just used. Otherwise the user completes a form and is still anonymous,
        // which reads as a failure.
        await client.login(input.email, input.password)
        generation.current++
        setUser(created)
        setStatus("authenticated")
        return created
      } catch (caught) {
        const failure = asAuthError(caught)
        setError(failure)
        throw failure
      }
    },
    [client],
  )

  const logout = useCallback(async () => {
    setError(null)
    // Cleared before the request resolves: the user asked to sign out, and the
    // UI should reflect that immediately rather than after a round trip.
    generation.current++
    setUser(null)
    setStatus("anonymous")
    try {
      await client.logout()
    } catch {
      // Already signed out locally; a failed server call changes nothing the
      // user can act on.
    }
  }, [client])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      client,
      enabled,
      login,
      register,
      logout,
      refresh: probe,
      pendingResetToken,
      clearPendingResetToken: () => setPendingResetToken(null),
      clearError: () => setError(null),
    }),
    [status, user, error, client, enabled, pendingResetToken, login, register, logout, probe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>")
  }
  return context
}

/** Returns null instead of throwing, for chrome that may render without auth. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}

function asAuthError(caught: unknown): AuthError {
  if (caught instanceof AuthError) return caught
  return new AuthError("UnknownError", caught instanceof Error ? caught.message : String(caught))
}
