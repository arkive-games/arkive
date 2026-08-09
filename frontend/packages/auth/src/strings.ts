import type { AuthErrorCode } from "./types"

/**
 * Every piece of text the auth UI renders.
 *
 * Strings are injected rather than translated in place, matching the
 * convention the other shared packages follow (ArkiveSiteInfoStrings,
 * SearchPanelLabels). It keeps this package free of i18next, lets each app use
 * whichever catalogue it already has, and lets lostark — which has no i18n at
 * all — pass literals.
 */
export interface AuthStrings {
  signIn: string
  signOut: string
  signUp: string
  account: string

  emailLabel: string
  emailPlaceholder: string
  passwordLabel: string
  passwordPlaceholder: string
  showPassword: string
  hidePassword: string
  nameLabel: string
  namePlaceholder: string

  loginTitle: string
  loginSubmit: string
  registerTitle: string
  registerSubmit: string
  switchToRegister: string
  switchToLogin: string

  forgotPassword: string
  forgotTitle: string
  forgotDescription: string
  forgotSubmit: string
  forgotSent: string

  resetTitle: string
  resetTokenLabel: string
  newPasswordLabel: string
  resetSubmit: string
  resetDone: string

  verifyPending: string
  verifyResend: string
  verifySent: string
  verifyDone: string

  challengeLoading: string
  challengeSolving: string
  challengeReady: string
  challengeFailed: string

  working: string
  cancel: string
  close: string
  dismiss: string

  /** Message per error code, plus a fallback for anything unrecognised. */
  errors: Record<AuthErrorCode, string>
}

/**
 * English defaults, so an app can ship the feature before its catalogue is
 * translated and spread over only the keys it has localised.
 */
export const DEFAULT_AUTH_STRINGS: AuthStrings = {
  signIn: "Sign in",
  signOut: "Sign out",
  signUp: "Create account",
  account: "Account",

  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  passwordPlaceholder: "At least 8 characters",
  showPassword: "Show password",
  hidePassword: "Hide password",
  nameLabel: "Display name",
  namePlaceholder: "How others will see you",

  loginTitle: "Sign in to Arkive",
  loginSubmit: "Sign in",
  registerTitle: "Create an Arkive account",
  registerSubmit: "Create account",
  switchToRegister: "No account yet? Create one",
  switchToLogin: "Already have an account? Sign in",

  forgotPassword: "Forgot your password?",
  forgotTitle: "Reset your password",
  forgotDescription: "Enter your address and we will send a reset link.",
  forgotSubmit: "Send reset link",
  forgotSent: "If that address is registered, a reset link is on its way.",

  resetTitle: "Choose a new password",
  resetTokenLabel: "Reset code",
  newPasswordLabel: "New password",
  resetSubmit: "Update password",
  resetDone: "Your password has been updated. You can sign in now.",

  verifyPending: "Your email address is not confirmed yet.",
  verifyResend: "Resend confirmation",
  verifySent: "Confirmation sent. Check your inbox.",
  verifyDone: "Your email address is confirmed.",

  challengeLoading: "Preparing verification…",
  challengeSolving: "Verifying you are human…",
  challengeReady: "Verification complete",
  challengeFailed: "Verification failed. Please try again.",

  working: "Working…",
  cancel: "Cancel",
  close: "Close",
  dismiss: "Dismiss",

  errors: {
    UnauthorizedError: "Please sign in to continue.",
    PermissionError: "You do not have access to that.",
    UserBadCredentialsError: "Incorrect email or password.",
    UserAlreadyExistsError: "That display name is already taken.",
    UserEmailAlreadyExistsError: "That email address is already registered.",
    UserInvalidPasswordError: "Please choose a longer, less obvious password.",
    UserInactiveError: "This account has been disabled.",
    UserAlreadyVerifiedError: "That address is already confirmed.",
    AltchaChallengeError: "Verification failed. Please try again.",
    RateLimitExceededError: "Too many attempts. Please wait a minute.",
    InvalidTokenError: "That link is invalid or has expired.",
    ValidationError: "Please check the details you entered.",
    NetworkError: "Could not reach the server. Check your connection.",
    UnknownError: "Something went wrong. Please try again.",
  },
}

/** Merges an app's partial overrides onto the English defaults. */
export function resolveAuthStrings(overrides?: Partial<AuthStrings>): AuthStrings {
  if (!overrides) return DEFAULT_AUTH_STRINGS
  return {
    ...DEFAULT_AUTH_STRINGS,
    ...overrides,
    errors: { ...DEFAULT_AUTH_STRINGS.errors, ...overrides.errors },
  }
}
