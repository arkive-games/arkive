import type { CSSProperties, ReactNode } from "react"
import { cn } from "@gamemap/ui"

export interface ShellGameHeaderProps {
  backgroundUrl: string
  backgroundPosition?: CSSProperties["backgroundPosition"]
  logo: ReactNode
  gameName: ReactNode
  subtitle: ReactNode
  className?: string
  shadeClassName?: string
}

/**
 * Shared game identity panel for map sidebars. Hosts provide only the game art,
 * logo, copy, and theme colour; its dimensions and typography stay identical.
 */
export function ShellGameHeader({
  backgroundUrl,
  backgroundPosition = "center",
  logo,
  gameName,
  subtitle,
  className,
  shadeClassName,
}: ShellGameHeaderProps) {
  return (
    <section
      data-testid="game-map-header"
      className={cn(
        "relative min-h-32 w-full select-none overflow-hidden border-b border-border bg-cover text-white",
        className,
      )}
      style={{ backgroundImage: `url(${backgroundUrl})`, backgroundPosition }}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-[linear-gradient(180deg,rgba(4,28,38,0.18),rgba(4,28,38,0.9))]",
          shadeClassName,
        )}
      />
      <div className="relative flex min-h-32 flex-col items-start justify-end px-4 py-4">
        <div className="flex h-12 max-w-full items-end">{logo}</div>
        <p className="mt-2 flex max-w-full items-center truncate text-sm font-semibold text-white/90 drop-shadow-sm">
          <span className="font-bold">{gameName}</span>
          <span className="mx-2 font-semibold text-white/55" aria-hidden>·</span>
          <span>{subtitle}</span>
        </p>
      </div>
    </section>
  )
}
