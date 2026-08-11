import {
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type FocusEvent,
  type ReactNode,
} from "react"
import { IconLogout, IconSettings, IconUserCircle } from "@tabler/icons-react"
import { Button, cn } from "@gamemap/ui"
import {
  ShellTopBar,
  TOP_BAR_MENU_CLASS,
  TOP_BAR_MENU_ITEM_CLASS,
  type ShellTopBarNav,
  type ShellTopBarProps,
} from "./ShellTopBar"

type HomeLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "children" | "className" | "href" | "title"
>

export interface ArkiveMapTopBarProps {
  homeUrl: string
  homeLinkProps?: HomeLinkProps
  homeLabel: string
  brandName: string
  brandSlogan: string
  nav: Omit<ShellTopBarNav, "classNames">
  languageSwitcher: NonNullable<ShellTopBarProps["languageSwitcher"]>
  themeSwitcher: {
    current: ArkiveMapTheme
    onChange: (value: ArkiveMapTheme) => void
    labels: Record<ArkiveMapTheme, string>
    menuLabel: string
    shortLabel?: string
  }
  loginLabel: string
  onLogin?: () => void
  /**
   * Session-aware account control. When supplied it replaces the bare
   * `loginLabel`/`onLogin` button, which remains for hosts that have not
   * adopted auth yet — sts2 and lostark still use the raw ShellTopBar, and a
   * required prop here would break every existing caller at once.
   *
   * Purely presentational: the shell is grep-gated against fetch, storage,
   * env and i18n, so state and strings both arrive from the host.
   */
  account?: ArkiveMapTopBarAccount
  /**
   * Rendered in the right-hand cluster instead of any built-in login control.
   *
   * This is how hosts pass @gamemap/auth's ArkiveAccountControl, which owns the
   * trigger, the dialog and the session state together. The shell cannot import
   * that package itself without dragging network access into a package whose
   * whole point is not having any, so the composition happens at the host.
   */
  accountSlot?: ReactNode
  className?: string
}

/** An extra entry in the signed-in menu, e.g. a link to a profile page. */
export interface ArkiveMapTopBarAccountItem {
  key: string
  label: string
  onSelect: () => void
}

export interface ArkiveMapTopBarAccount {
  /**
   * `loading` renders a neutral placeholder rather than "Sign in". Showing the
   * signed-out state during the session probe makes a returning user believe
   * they have been logged out, and they click it.
   */
  status: "loading" | "anonymous" | "authenticated"
  /** Shown on the trigger when signed in. */
  userName?: string
  signInLabel: string
  signOutLabel: string
  accountLabel: string
  onSignIn: () => void
  onSignOut: () => void
  items?: ArkiveMapTopBarAccountItem[]
  /**
   * Opens the settings panel. Offered in every state, signed out included --
   * the local-data controls it holds matter most to a visitor whose data exists
   * only in this browser, and requiring an account to reach them would be the
   * bug this panel was built to close.
   */
  settings?: { label: string; onSelect: () => void }
}

export type ArkiveMapTheme = "auto" | "light" | "dark"

const ARKIVE_MAP_THEMES: ArkiveMapTheme[] = ["auto", "light", "dark"]

/**
 * Canonical Arkive desktop navigation for interactive-map applications.
 * Hosts own routes and localized labels; the shell owns brand and control
 * composition so every game presents the same navigation geometry.
 */
export function ArkiveMapTopBar({
  homeUrl,
  homeLinkProps,
  homeLabel,
  brandName,
  brandSlogan,
  nav,
  languageSwitcher,
  themeSwitcher,
  loginLabel,
  onLogin,
  account,
  accountSlot,
  className,
}: ArkiveMapTopBarProps) {
  return (
    <ShellTopBar
      classNames={{
        root: `arkive-map-topbar hidden h-14 border-b border-border bg-card text-card-foreground md:flex ${className ?? ""}`,
        left: "gap-7",
        nav: "gap-7",
        right: "gap-1 lg:gap-2",
        trigger:
          "h-9 gap-2 rounded-lg border border-border bg-card px-3 text-foreground shadow-none hover:bg-accent",
        menu: "rounded-lg border-border bg-popover text-popover-foreground shadow-lg",
      }}
      leftSlot={
        <a
          href={homeUrl}
          {...homeLinkProps}
          data-testid="brand-link"
          aria-label={homeLabel}
          title={homeLabel}
          className="flex h-14 w-fit shrink-0 items-center gap-[0.6rem] whitespace-nowrap border-r border-border pr-3 text-foreground xl:gap-[0.7rem] xl:pr-4"
        >
          <ArkiveMark className="size-[2.125rem] text-[color:var(--arkive-nav-active)] xl:size-9" />
          <span className="grid min-w-0 gap-[0.12rem] leading-none">
            <strong data-testid="brand-name" className="text-sm font-bold leading-none">{brandName}</strong>
            <small
              data-testid="brand-slogan"
              className="text-[0.7rem] font-medium leading-none text-[color:var(--arkive-brand-slogan)]"
            >
              {brandSlogan}
            </small>
          </span>
        </a>
      }
      nav={{
        ...nav,
        classNames: {
          item:
            "arkive-nav-item group relative inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-sm px-1 text-sm font-semibold text-foreground/70 hover:text-[color:var(--arkive-nav-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]",
          itemActive:
            "arkive-nav-item arkive-nav-item--highlighted group relative inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-sm px-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]",
          label: "arkive-nav-item-label relative inline-flex h-full items-center whitespace-nowrap",
          labelActive: "text-[color:var(--arkive-nav-active)]",
        },
      }}
      languageSwitcher={languageSwitcher}
      themeSwitcher={{
        options: ARKIVE_MAP_THEMES.map((value) => ({
          value,
          label: themeSwitcher.labels[value],
        })),
        current: themeSwitcher.current,
        onChange: (value) => themeSwitcher.onChange(value as ArkiveMapTheme),
        menuLabel: themeSwitcher.menuLabel,
        shortLabel: themeSwitcher.shortLabel,
      }}
      rightExtras={
        accountSlot ? (
          accountSlot
        ) : account ? (
          <ShellAccountMenu account={account} />
        ) : (
          <Button
            type="button"
            className={ACCOUNT_TRIGGER_CLASS}
            aria-label={loginLabel}
            onClick={onLogin}
          >
            <IconUserCircle className="size-5" stroke={1.8} />
            <span className="text-sm font-semibold">{loginLabel}</span>
          </Button>
        )
      }
    />
  )
}

const ACCOUNT_TRIGGER_CLASS =
  "h-9 gap-2 rounded-lg bg-[color:var(--arkive-nav-active)] px-4 text-[color:var(--arkive-nav-on-active)] hover:brightness-95"

/**
 * Signed-out button, or signed-in name with a menu.
 *
 * Exported so the apps that compose `ShellTopBar` directly rather than through
 * `ArkiveMapTopBar` — sts2 and lostark — can drop the same control into their
 * own `rightExtras` instead of reimplementing it.
 *
 * The menu is hover-driven with the same open/close semantics as the language
 * and theme menus beside it, rather than a Radix DropdownMenu. Mixing a
 * portalled overlay into this cluster is a known hit-testing and z-index trap:
 * portalled content rendered inside a sheet has its pointer events swallowed by
 * the overlay and goes dead rather than merely looking wrong.
 */
export function ShellAccountMenu({ account }: { account: ArkiveMapTopBarAccount }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const settingsEntry: ArkiveMapTopBarAccountItem[] = account.settings
    ? [
        {
          key: "settings",
          label: account.settings.label,
          onSelect: account.settings.onSelect,
        },
      ]
    : []

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }

  const menu = (entries: ArkiveMapTopBarAccountItem[], header?: string) => (
    <div
      ref={menuRef}
      role="menu"
      aria-label={account.accountLabel}
      className={cn("absolute right-0 min-w-40", TOP_BAR_MENU_CLASS)}
    >
      {header && (
        <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">{header}</p>
      )}
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          role="menuitem"
          data-testid={`account-${entry.key}`}
          className={TOP_BAR_MENU_ITEM_CLASS}
          onClick={() => {
            setOpen(false)
            entry.onSelect()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false)
              triggerRef.current?.focus()
            }
          }}
        >
          {entry.key === "settings" && <IconSettings className="size-4" stroke={1.8} />}
          {entry.key === "sign-out" && <IconLogout className="size-4" stroke={1.8} />}
          <span className="flex-1">{entry.label}</span>
        </button>
      ))}
    </div>
  )

  if (account.status === "loading") {
    return (
      <Button
        type="button"
        disabled
        aria-busy="true"
        aria-label={account.accountLabel}
        data-testid="account-loading"
        className={cn(ACCOUNT_TRIGGER_CLASS, "opacity-60")}
      >
        <IconUserCircle className="size-5" stroke={1.8} />
      </Button>
    )
  }

  if (account.status === "anonymous") {
    const signInButton = (
      <Button
        ref={triggerRef}
        type="button"
        className={ACCOUNT_TRIGGER_CLASS}
        aria-label={account.signInLabel}
        aria-haspopup={settingsEntry.length > 0 ? "menu" : undefined}
        aria-expanded={settingsEntry.length > 0 ? open : undefined}
        data-testid="account-sign-in"
        onClick={account.onSignIn}
      >
        <IconUserCircle className="size-5" stroke={1.8} />
        <span className="text-sm font-semibold">{account.signInLabel}</span>
      </Button>
    )

    if (settingsEntry.length === 0) return signInButton

    // The menu is revealed by hover and focus, and the button keeps its own
    // click action, so signing in stays one click while settings become
    // reachable without an account. A split trigger would cost that click.
    return (
      <div
        className="relative inline-flex items-center"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={closeWhenFocusLeaves}
      >
        {signInButton}
        {open && menu(settingsEntry)}
      </div>
    )
  }

  const entries: ArkiveMapTopBarAccountItem[] = [
    ...settingsEntry,
    ...(account.items ?? []),
    { key: "sign-out", label: account.signOutLabel, onSelect: account.onSignOut },
  ]

  return (
    <div
      className="relative inline-flex items-center"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={closeWhenFocusLeaves}
    >
      <Button
        ref={triggerRef}
        type="button"
        className={ACCOUNT_TRIGGER_CLASS}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={account.accountLabel}
        title={account.userName ?? account.accountLabel}
        data-testid="account-menu"
        onClick={() => setOpen(true)}
        onPointerUp={(event) => event.currentTarget.blur()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            event.currentTarget.blur()
          }
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setOpen(true)
            window.setTimeout(() => {
              menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus()
            }, 0)
          }
        }}
      >
        <IconUserCircle className="size-5" stroke={1.8} />
        {/* A long display name must not push the nav around, so it is clamped
            rather than allowed to size the trigger. */}
        <span className="max-w-28 truncate text-sm font-semibold">
          {account.userName ?? account.accountLabel}
        </span>
      </Button>
      {open && menu(entries, account.userName)}
    </div>
  )
}

export function ArkiveMark({ className }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 320 285" className={cn("size-9 shrink-0", className)} aria-hidden="true">
      <path
        fill="currentColor"
        d="M160 24C95 24 47 70 47 136c0 30 10 54 31 71 55 16 109 16 164 0 21-18 31-41 31-71 0-66-48-112-113-112Z"
      />
      <path fill="currentColor" d="M63 207c35-13 68-13 97 0 30 13 63 13 99-1-28 29-61 37-99 25-38-11-70-19-97-24Z" />
      <path fill="currentColor" d="M75 235c33-10 61-10 85 1 24 11 53 9 87-4-24 32-53 41-87 27-34-12-62-20-85-24Z" />
      <path
        fill="var(--arkive-mark-cutout, #F9F9F9)"
        d="M73 72c10-13 24-20 41-20h92c17 0 31 7 41 20l14 37c7 18 4 25-10 29l-22-13c-7-4-13-5-19-4l-10 56c-3 14-9 23-19 28h-42c-10-5-16-14-19-28l-10-56c-6-1-12 0-19 4l-22 13c-14-4-17-11-10-29l14-37Z"
      />
      <path fill="currentColor" d="M92 105h12V93h12v12h12v12h-12v12h-12v-12H92Z" />
      <circle fill="currentColor" cx="205" cy="101" r="7" />
      <circle fill="currentColor" cx="222" cy="117" r="7" />
      <path fill="currentColor" d="m160 91 35 98h-35ZM154 82h12v119h-12Z" />
    </svg>
  )
}
