import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react"
import { IconUserCircle } from "@tabler/icons-react"
import { cn } from "@gamemap/ui"

type HomeLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "children" | "className" | "href" | "title"
>

export interface ArkiveMobileHeaderProps {
  homeUrl: string
  homeLinkProps?: HomeLinkProps
  /** Accessible name of the wordmark link. */
  homeLabel: string
  /** Kept for existing hosts; the header shows the "Arkive" wordmark alone. */
  brandName?: string
  pageTitle?: ReactNode
  actions?: ReactNode
  accountControl?: ReactNode
  /** False omits the account control, for a page whose `actions` already carry it. */
  showAccount?: boolean
  loginLabel: string
  onLogin?: () => void
  className?: string
}

/**
 * Compact mobile header for scrollable Arkive content pages. Interactive maps
 * deliberately omit it to preserve the playfield. A page with the shared menu
 * button (ShellBottomNav) leaves room for it at the right edge, see
 * arkive-map-theme.css.
 */
export function ArkiveMobileHeader({
  homeUrl,
  homeLinkProps,
  homeLabel,
  pageTitle,
  actions,
  accountControl,
  showAccount = true,
  loginLabel,
  onLogin,
  className,
}: ArkiveMobileHeaderProps) {
  return (
    <header
      data-testid="arkive-mobile-header"
      className={cn(
        "arkive-mobile-header sticky top-0 z-[var(--arkive-layer-sticky)] flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border bg-background/98 px-4 pt-[env(safe-area-inset-top)] text-foreground md:hidden",
        className,
      )}
    >
      <a
        href={homeUrl}
        {...homeLinkProps}
        aria-label={homeLabel}
        title={homeLabel}
        data-testid="mobile-brand-link"
        className="flex shrink-0 items-center"
      >
        <span className="arkive-wordmark text-2xl">Arkive</span>
      </a>

      {pageTitle ? (
        <div className="min-w-0 flex-1 border-l border-border pl-3 text-sm font-semibold">
          <span className="block truncate">{pageTitle}</span>
        </div>
      ) : <span className="flex-1" />}

      {actions}

      {showAccount && (accountControl ?? (
        <ArkiveMobileAccountButton label={loginLabel} onClick={onLogin} />
      ))}
    </header>
  )
}

export interface ArkiveMobileAccountButtonProps extends Omit<
  ComponentProps<"button">,
  "aria-label" | "children" | "className" | "title" | "type"
> {
  label: string
}

export function ArkiveMobileAccountButton({
  label,
  ...buttonProps
}: ArkiveMobileAccountButtonProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      title={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground transition-colors active:bg-foreground/10"
    >
      <IconUserCircle className="size-6" stroke={1.8} />
    </button>
  )
}
