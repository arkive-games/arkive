import { useEffect, useState, type ReactNode } from "react"
import { IconSettings } from "@tabler/icons-react"
import { Button } from "@gamemap/ui"
import {
  ArkiveMobileAccountButton,
  ArkiveSettingsDialog,
  ShellAccountMenu,
  useArkiveSettingsProps,
  type ArkiveMapTopBarAccountItem,
  type ArkiveSettingsConfig,
} from "@gamemap/map-shell"

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
  /** Adapts the anonymous trigger to its host surface. */
  variant?: "topbar" | "mobileHeader"
  /** Rendered instead of nothing when auth is unavailable. */
  fallback?: ReactNode
  /**
   * Adds a Settings entry to the account menu and renders the panel it opens.
   *
   * Placed here rather than beside the top bar for the same reason AccountDialog
   * is: the trigger is a row in a menu that closes on selection, so the menu
   * cannot own the dialog's lifetime, and every app would otherwise repeat the
   * same state, strings and assembly.
   */
  settings?: ArkiveSettingsConfig
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
  variant = "topbar",
  fallback = null,
  settings,
}: ArkiveAccountControlProps) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  // The provider owns the token; this only reacts to it. Opening on a token the
  // provider already stripped is what makes the emailed link land on the form.
  const resetToken = auth.pendingResetToken
  useEffect(() => {
    if (resetToken) setOpen(true)
  }, [resetToken])

  const [settingsOpen, setSettingsOpen] = useState(false)

  // The same assembly the phone sheet uses, rather than a second copy of it:
  // two surfaces building the panel independently is precisely how they would
  // drift into offering different rows. The config may carry its own locale
  // (the sheet has no `language` prop), so this control's is only the fallback.
  const settingsProps = useArkiveSettingsProps({
    ...(settings ?? {}),
    locale: settings?.locale ?? language,
  })

  const settingsPanel = settings ? (
    <ArkiveSettingsDialog {...settingsProps} open={settingsOpen} onOpenChange={setSettingsOpen} />
  ) : null

  // Hidden entirely when no API is configured. A sign-in button that cannot
  // complete is worse than no button, and that is the state every build is in
  // until the API is deployed.
  //
  // Settings are not an account feature, though, so when they are configured
  // they still need a trigger here -- otherwise a build with no API has no
  // route to the local-data controls at all. There is no account UI to sit
  // beside in that state, so the gear stands alone rather than hiding in a menu.
  if (!auth.enabled) {
    return (
      <>
        {settings ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="settings-trigger"
            aria-label={settingsProps.strings.title}
            title={settingsProps.strings.title}
            onClick={() => setSettingsOpen(true)}
          >
            <IconSettings className="size-5" stroke={1.8} />
          </Button>
        ) : (
          fallback
        )}
        {settingsPanel}
      </>
    )
  }

  const base = authStringsFor(language)
  const strings: AuthStrings = overrides
    ? { ...base, ...overrides, errors: { ...base.errors, ...overrides.errors } }
    : base

  const account = {
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
    settings: settings
      ? { label: settingsProps.strings.title, onSelect: () => setSettingsOpen(true) }
      : undefined,
  }

  const anonymousTrigger = auth.status === "anonymous" && variant === "mobileHeader"
    ? <ArkiveMobileAccountButton label={strings.signIn} onClick={() => setOpen(true)} />
    : <ShellAccountMenu account={account} />

  return (
    <>
      {anonymousTrigger}
      <AccountDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // Otherwise the dialog stays in reset mode for the rest of the
          // session: reopening it from the account menu would land back on the
          // reset form, prefilled with a token that has already been spent.
          if (!next) auth.clearPendingResetToken()
        }}
        strings={strings}
        initialMode={resetToken ? "reset" : "login"}
        resetToken={resetToken ?? undefined}
      />
      {settingsPanel}
    </>
  )
}
