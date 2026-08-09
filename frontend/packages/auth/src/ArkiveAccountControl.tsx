import { useState, type ReactNode } from "react"
import { ShellAccountMenu, type ArkiveMapTopBarAccountItem } from "@gamemap/map-shell"

import { AccountDialog } from "./AccountDialog"
import { useAuth } from "./AuthProvider"
import { authStringsFor } from "./locales"
import type { AuthStrings } from "./strings"

export interface ArkiveAccountControlProps {
  /**
   * The host's current i18next language tag. Passed in rather than read from an
   * i18n instance so this works in lostark, which has no i18n at all and can
   * pass a literal.
   */
  language?: string
  /** Overrides on top of the shared catalogue, for app-specific wording. */
  strings?: Partial<AuthStrings>
  /** Extra entries in the signed-in menu, e.g. a link to a profile page. */
  items?: ArkiveMapTopBarAccountItem[]
  /** Rendered instead of nothing when auth is unavailable. */
  fallback?: ReactNode
}

/**
 * The whole sign-in surface as one drop-in: the top-bar trigger, the menu, the
 * dialog, the strings and the state.
 *
 * Every app otherwise repeats the same twenty lines — dialog state, string
 * resolution, assembling the account object, remembering to render the dialog —
 * six times, and the sixth copy is where they start to diverge. Hosts place this
 * in their right-hand cluster and pass nothing but a language tag.
 *
 * The dialog is rendered here alongside the trigger rather than as a sibling of
 * the top bar. That is safe because the underlying Dialog portals to the body,
 * so it is not laid out inside the header even though it is declared there.
 */
export function ArkiveAccountControl({
  language,
  strings: overrides,
  items,
  fallback = null,
}: ArkiveAccountControlProps) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)

  // Hidden entirely when no API is configured. A sign-in button that cannot
  // complete is worse than no button, and that is the state every build is in
  // until the API is deployed.
  if (!auth.enabled) return <>{fallback}</>

  const base = authStringsFor(language)
  const strings: AuthStrings = overrides
    ? { ...base, ...overrides, errors: { ...base.errors, ...overrides.errors } }
    : base

  return (
    <>
      <ShellAccountMenu
        account={{
          status: auth.status,
          userName: auth.user?.name,
          signInLabel: strings.signIn,
          signOutLabel: strings.signOut,
          accountLabel: strings.account,
          onSignIn: () => setOpen(true),
          onSignOut: () => {
            void auth.logout()
          },
          items,
        }}
      />
      <AccountDialog open={open} onOpenChange={setOpen} strings={strings} />
    </>
  )
}
