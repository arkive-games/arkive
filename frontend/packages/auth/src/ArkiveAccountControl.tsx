import { useState, type ReactNode } from "react"
import { IconSettings } from "@tabler/icons-react"
import { Button } from "@gamemap/ui"
import {
  ArkiveMobileAccountButton,
  ArkiveSettingsDialog,
  localDataStringsFor,
  settingsStringsFor,
  ShellAccountMenu,
  useOptionalTheme,
  type ArkiveMapTopBarAccountItem,
  type ArkiveSettingsConfig,
  type ArkiveSettingsThemeConfig,
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
  const theme = useOptionalTheme()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // The config may carry its own locale (it is shared with the phone sheet,
  // which has no `language` prop); fall back to this control's.
  const settingsLocale = settings?.locale ?? language
  const settingsStrings = settingsStringsFor(settingsLocale)
  const themeConfig: ArkiveSettingsThemeConfig | undefined =
    settings && theme?.supportsThemeLayers && settings.themeOptions
      ? {
          options: settings.themeOptions,
          generalValue: theme.globalTheme ?? theme.defaultTheme,
          override: theme.overrideTheme,
          onSetGeneral: theme.setGlobalTheme,
          onSetOverride: theme.setThemeOverride,
          onFollowGeneral: theme.clearThemeOverride,
        }
      : undefined

  const settingsPanel = settings ? (
    <ArkiveSettingsDialog
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      strings={settingsStrings}
      localData={localDataStringsFor(settingsLocale)}
      site={settings.site}
      theme={themeConfig}
      language={settings.language}
      siteExtras={settings.siteExtras}
    />
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
            aria-label={settingsStrings.title}
            title={settingsStrings.title}
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
      ? { label: settingsStrings.title, onSelect: () => setSettingsOpen(true) }
      : undefined,
  }

  const anonymousTrigger = auth.status === "anonymous" && variant === "mobileHeader"
    ? <ArkiveMobileAccountButton label={strings.signIn} onClick={() => setOpen(true)} />
    : <ShellAccountMenu account={account} />

  return (
    <>
      {anonymousTrigger}
      <AccountDialog open={open} onOpenChange={setOpen} strings={strings} />
      {settingsPanel}
    </>
  )
}
