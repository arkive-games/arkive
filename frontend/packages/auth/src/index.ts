export { AccountDialog, type AccountDialogMode, type AccountDialogProps } from "./AccountDialog"
export {
  AltchaAbortError,
  AltchaUnsolvableError,
  encodePayload,
  solveAltcha,
  type SolveOptions,
} from "./altcha"
export {
  AuthProvider,
  useAuth,
  useOptionalAuth,
  type AuthContextValue,
  type AuthProviderProps,
  type AuthStatus,
} from "./AuthProvider"
export { CoreClient, CORE_OPERATIONS, normaliseCode, type CoreClientOptions } from "./client"
export {
  CORE_API_PREFIX,
  resolveAuthConfig,
  type ResolveAuthConfigInput,
  type ResolvedAuthConfig,
} from "./config"
export { AUTH_LOCALES, authStringsFor } from "./locales"
export { createLocalTokenStorage, createMemoryTokenStorage } from "./storage"
export { DEFAULT_AUTH_STRINGS, resolveAuthStrings, type AuthStrings } from "./strings"
export {
  AuthError,
  type AltchaChallenge,
  type AuthErrorCode,
  type AuthTransport,
  type Envelope,
  type TokenResponse,
  type TokenStorage,
  type User,
} from "./types"
