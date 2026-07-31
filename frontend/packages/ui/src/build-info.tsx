import * as React from "react"

import { GitCommitHorizontal } from "lucide-react"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card"
import { cn } from "./utils"

export interface BuildInfoProps {
  /** Full git commit hash of the build (wire to a Vite `define` constant). */
  commit: string
  /** Build time as epoch milliseconds (wire to a Vite `define` constant). */
  buildTime: string | number
  /** When true (pass `import.meta.env.DEV`): commit shows "dev", time shows last page-load. */
  dev?: boolean
  /** Game version the site's data was built from (from the data artifact's `version.json` or `VITE_GAME_VERSION`). Row is hidden when unset. */
  gameVersion?: string
  /**
   * Site version link, e.g. `<Link to="/changelog">v1.8.0</Link>`. Row is hidden
   * when unset. A slot, not an href, so the app supplies its own router link.
   */
  siteVersion?: React.ReactNode
  /** Force the hovercard open. Test-only escape hatch; Radix hover never fires in jsdom. */
  defaultOpen?: boolean
  /**
   * Repository the commit link inside the hovercard points at. Defaults to the
   * monorepo. The icon trigger itself does not navigate anywhere. Pass `null`
   * to render the hash as plain text — a build with no route to the public web
   * (a Bilibili toy) would otherwise show a dead link.
   */
  repoUrl?: string | null
  /** Injectable labels so apps can localize; the package stays i18n-free. */
  labels?: {
    commit?: string
    buildTime?: string
    gameVersion?: string
    siteVersion?: string
    /** Accessible name for the badge trigger. */
    repo?: string
  }
  className?: string
}

function toISO(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? "+" : "-"
  const hh = p(Math.floor(Math.abs(off) / 60))
  const mm = p(Math.abs(off) % 60)
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ` +
    `${sign}${hh}:${mm}`
  )
}

/**
 * Top-bar build badge shared by every app: a commit icon whose hovercard shows
 * the commit hash (linked to the commit page), the build time in ISO 8601 format
 * and, when supplied, the site/game versions.
 *
 * The trigger is a deliberately inert `<button>`: it is a disclosure affordance
 * for the hovercard, not a link. It used to be an anchor to the repository, which
 * meant a stray click on a badge that only *looks* informational threw the
 * visitor off the site to GitHub. Everything worth reaching from here — the
 * commit, the changelog — is a real link inside the card, so the trigger itself
 * navigates nowhere.
 *
 * Pass `dev={import.meta.env.DEV}` to show "dev" + last page-load time in dev mode.
 */
function BuildInfo({
  commit,
  buildTime,
  dev = false,
  gameVersion,
  siteVersion,
  defaultOpen,
  repoUrl = "https://github.com/arkive-games/arkive",
  labels,
  className,
}: BuildInfoProps) {
  const displayCommit = dev ? "dev" : commit.slice(0, 7)
  const displayTime = dev ? toISO(Date.now()) : toISO(Number(buildTime))

  return (
    <HoverCard openDelay={100} defaultOpen={defaultOpen}>
      {/* One child only, as `asChild` requires. `type="button"` so the badge can
          never submit a surrounding form, and no onClick at all — the click is a
          no-op by design; only hover/focus matter here. */}
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="build-info"
          aria-label={labels?.repo ?? "Build info"}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
        >
          <GitCommitHorizontal className="size-5" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="end" className="w-auto p-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {siteVersion && (
            <>
              <dt className="text-muted-foreground">{labels?.siteVersion ?? "Version"}</dt>
              <dd className="font-mono">{siteVersion}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{labels?.commit ?? "Commit"}</dt>
          <dd>
            {dev || !repoUrl ? (
              <span className="font-mono">{displayCommit}</span>
            ) : (
              <a
                href={`${repoUrl.replace(/\/$/, "")}/commit/${commit}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline-offset-4 hover:underline"
              >
                {displayCommit}
              </a>
            )}
          </dd>
          <dt className="text-muted-foreground">{labels?.buildTime ?? "Built"}</dt>
          <dd className="font-mono">{displayTime}</dd>
          {gameVersion && (
            <>
              <dt className="text-muted-foreground">{labels?.gameVersion ?? "Game"}</dt>
              <dd className="font-mono">{gameVersion}</dd>
            </>
          )}
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}

export { BuildInfo }
