import { GitHubIcon } from "./github-icon"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card"
import { cn } from "./utils"

export interface BuildInfoProps {
  /** Full git commit hash of the build (wire to a Vite `define` constant). */
  commit: string
  /** Build time as epoch milliseconds (wire to a Vite `define` constant). */
  buildTime: string | number
  /** Repository link opened by the icon. Defaults to the monorepo. */
  repoUrl?: string
  /** Injectable labels so apps can localize; the package stays i18n-free. */
  labels?: {
    commit?: string
    buildTime?: string
    /** Accessible name for the icon link. */
    repo?: string
  }
  className?: string
}

/**
 * Top-bar build badge shared by every app: a GitHub icon linking to the repo,
 * with a hovercard showing the commit hash (linked to the commit page) and the
 * build time.
 */
function BuildInfo({
  commit,
  buildTime,
  repoUrl = "https://github.com/arkive-games/arkive",
  labels,
  className,
}: BuildInfoProps) {
  const shortCommit = commit.slice(0, 7)
  const builtAt = new Date(Number(buildTime))
  const builtAtText = Number.isNaN(builtAt.getTime())
    ? String(buildTime)
    : builtAt.toLocaleString()

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
            <a
              href={`${repoUrl.replace(/\/$/, "")}/commit/${commit}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline-offset-4 hover:underline"
            >
              {shortCommit}
            </a>
          </dd>
          <dt className="text-muted-foreground">{labels?.buildTime ?? "Built"}</dt>
          <dd>{builtAtText}</dd>
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}

export { BuildInfo }
