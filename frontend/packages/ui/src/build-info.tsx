import { GitHubIcon } from "./github-icon"
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
  /** Repository link opened by the icon. Defaults to the monorepo. */
  repoUrl?: string
  /** Injectable labels so apps can localize; the package stays i18n-free. */
  labels?: {
    commit?: string
    buildTime?: string
    gameVersion?: string
    /** Accessible name for the icon link. */
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
 * Top-bar build badge shared by every app: a GitHub icon linking to the repo,
 * with a hovercard showing the commit hash (linked to the commit page) and the
 * build time in ISO 8601 format.
 *
 * Pass `dev={import.meta.env.DEV}` to show "dev" + last page-load time in dev mode.
 */
function BuildInfo({
  commit,
  buildTime,
  dev = false,
  gameVersion,
  repoUrl = "https://github.com/arkive-games/arkive",
  labels,
  className,
}: BuildInfoProps) {
  const displayCommit = dev ? "dev" : commit.slice(0, 7)
  const displayTime = dev ? toISO(Date.now()) : toISO(Number(buildTime))

  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="build-info"
          aria-label={labels?.repo ?? "GitHub repository"}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
            className,
          )}
        >
          <GitHubIcon className="size-5" />
        </a>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="end" className="w-auto p-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">{labels?.commit ?? "Commit"}</dt>
          <dd>
            {dev ? (
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
