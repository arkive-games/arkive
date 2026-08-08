import type { AnchorHTMLAttributes, ReactNode } from "react"
import { IconUserCircle } from "@tabler/icons-react"
import { cn } from "@gamemap/ui"
import {
  ArkiveEmailLoginDialog,
  type ArkiveEmailLoginCredentials,
} from "./ArkiveEmailLoginDialog"
import { ArkiveMark } from "./ArkiveMark"

type HomeLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-label" | "children" | "className" | "href" | "title"
>

export interface ArkiveMobileHeaderProps {
  homeUrl: string
  homeLinkProps?: HomeLinkProps
  homeLabel: string
  brandName: string
  pageTitle?: ReactNode
  actions?: ReactNode
  accountControl?: ReactNode
  loginLabel: string
  locale: string
  onLoginSubmit?: (credentials: ArkiveEmailLoginCredentials) => void | Promise<void>
  onRegister?: () => void
  className?: string
}

/**
 * Compact mobile header for scrollable Arkive content pages. Interactive maps
 * deliberately omit it to preserve the playfield and expose the same account
 * action from their bottom navigation sheet instead.
 */
export function ArkiveMobileHeader({
  homeUrl,
  homeLinkProps,
  homeLabel,
  brandName,
  pageTitle,
  actions,
  accountControl,
  loginLabel,
  locale,
  onLoginSubmit,
  onRegister,
  className,
}: ArkiveMobileHeaderProps) {
  return (
    <header
      data-testid="arkive-mobile-header"
      className={cn(
        "sticky top-0 z-[1800] flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] text-card-foreground backdrop-blur md:hidden",
        className,
      )}
    >
      <a
        href={homeUrl}
        {...homeLinkProps}
        aria-label={homeLabel}
        title={homeLabel}
        data-testid="mobile-brand-link"
        className="flex min-w-0 flex-1 items-center gap-2 text-[color:var(--arkive-nav-active)]"
      >
        <span className="shrink-0 [&>svg]:size-8"><ArkiveMark /></span>
        <span className="min-w-0 leading-tight">
          <strong className="block truncate text-sm font-bold tracking-tight">{brandName}</strong>
          {pageTitle ? (
            <span className="mt-0.5 block truncate text-xs font-medium text-muted-foreground">
              {pageTitle}
            </span>
          ) : null}
        </span>
      </a>

      {actions}

      {accountControl ?? (
        <ArkiveEmailLoginDialog
          locale={locale}
          onSubmit={onLoginSubmit}
          onRegister={onRegister}
          trigger={(
            <button
              type="button"
              aria-label={loginLabel}
              title={loginLabel}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--arkive-nav-active)] transition-colors active:bg-accent"
            >
              <IconUserCircle className="size-6" stroke={1.8} />
            </button>
          )}
        />
      )}
    </header>
  )
}
