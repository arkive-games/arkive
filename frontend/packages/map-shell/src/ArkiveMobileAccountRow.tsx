import { IconChevronRight, IconUserCircle } from "@tabler/icons-react"
import { ArkiveEmailLoginDialog, type ArkiveEmailLoginCredentials } from "./ArkiveEmailLoginDialog"

export interface ArkiveMobileAccountRowProps {
  locale: string
  label: string
  onSubmit?: (credentials: ArkiveEmailLoginCredentials) => void | Promise<void>
  onRegister?: () => void
}

/** Login entry sized and composed for the mobile More sheet. */
export function ArkiveMobileAccountRow({
  locale,
  label,
  onSubmit,
  onRegister,
}: ArkiveMobileAccountRowProps) {
  return (
    <ArkiveEmailLoginDialog
      locale={locale}
      onSubmit={onSubmit}
      onRegister={onRegister}
      trigger={(
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-semibold text-card-foreground transition-colors active:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconUserCircle className="size-5 shrink-0 text-muted-foreground" stroke={1.8} />
            <span className="truncate">{label}</span>
          </span>
          <IconChevronRight className="size-4 shrink-0 text-muted-foreground" stroke={1.8} />
        </button>
      )}
    />
  )
}
