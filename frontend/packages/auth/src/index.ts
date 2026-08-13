export {
  ArkiveAccountControl,
  type ArkiveAccountControlProps,
} from "./ArkiveAccountControl"
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
export { CoreClient, asAuthError, normaliseCode, type CoreClientOptions } from "./client"
export {
  ARKIVE_PRODUCTION_API_URL,
  CORE_API_PREFIX,
  resolveAuthConfig,
  type ResolveAuthConfigInput,
  type ResolvedAuthConfig,
} from "./config"
export { AUTH_LOCALES, authStringsFor } from "./locales"
export {
  RESET_PATH,
  RESET_QUERY_PARAM,
  consumeResetToken,
  readResetLink,
  type ResetLink,
} from "./resetLink"
export { createLocalTokenStorage, createMemoryTokenStorage } from "./storage"
export { DEFAULT_AUTH_STRINGS, resolveAuthStrings, type AuthStrings } from "./strings"
export {
  AuthError,
  type AltchaChallenge,
  type AuthErrorCode,
  type AuthTransport,
  type TokenResponse,
  type TokenStorage,
  type User,
} from "./types"
