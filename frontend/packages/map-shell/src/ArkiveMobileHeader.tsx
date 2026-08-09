import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react"
import { IconUserCircle } from "@tabler/icons-react"
import { cn } from "@gamemap/ui"
import { ArkiveMark } from "./ArkiveMapTopBar"

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
  onLogin?: () => void
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
  onLogin,
  className,
}: ArkiveMobileHeaderProps) {
  return (
    <header
      data-testid="arkive-mobile-header"
      className={cn(
        "sticky top-0 z-[1800] flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] text-card-foreground shadow-[0_0.25rem_1rem_rgba(8,33,51,0.06)] backdrop-blur md:hidden",
        className,
      )}
    >
      <a
        href={homeUrl}
        {...homeLinkProps}
        aria-label={homeLabel}
        title={homeLabel}
        data-testid="mobile-brand-link"
        className="flex min-w-0 shrink items-center gap-2 text-[color:var(--arkive-nav-active)]"
      >
        <span className="shrink-0 [&>svg]:size-8"><ArkiveMark /></span>
        <strong className="max-w-20 truncate text-sm font-bold">{brandName}</strong>
      </a>

      {pageTitle ? (
        <div className="min-w-0 flex-1 border-l border-border pl-2.5 text-sm font-semibold">
          <span className="block truncate">{pageTitle}</span>
        </div>
      ) : <span className="flex-1" />}

      {actions}

      {accountControl ?? (
        <ArkiveMobileAccountButton label={loginLabel} onClick={onLogin} />
      )}
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
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--arkive-nav-active)] transition-colors active:bg-accent"
    >
      <IconUserCircle className="size-6" stroke={1.8} />
    </button>
  )
}
