import { versionUrl, type ChangeKind, type ResolvedEntry } from "./changelog"
import { cn } from "./utils"

export interface VersionHistoryLabels {
  /** Badge on the newest entry. Omitted → no badge. */
  current?: string
  /** Per-kind badge text. A kind with no label falls back to the raw key. */
  kinds?: Partial<Record<ChangeKind, string>>
  /** Shown instead of the list when `entries` is empty. */
  empty?: string
}

export interface VersionHistoryProps {
  /** Locale-resolved entries, newest first (see `resolveChangelog`). */
  entries: ResolvedEntry[]
  /** Injectable labels so the package stays i18n-free. */
  labels?: VersionHistoryLabels
  /** Repository the version links point into. Defaults to the monorepo. */
  repoUrl?: string
  className?: string
}

/** Badge tint per change kind, so `feature` reads as the headline of a release. */
const KIND_CLASS: Record<ChangeKind, string> = {
  feature: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  improvement: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  fix: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  data: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

/**
 * Version-history list shared by every app: one section per released version,
 * newest first, each change tagged with a coloured kind badge.
 *
 * Presentational only — it takes already-resolved text and injected labels, so
 * the package needs no i18n runtime and no router.
 */
function VersionHistory({
  entries,
  labels,
  repoUrl = "https://github.com/arkive-games/arkive",
  className,
}: VersionHistoryProps) {
  if (entries.length === 0) {
    return (
      <p data-testid="changelog-empty" className={cn("text-sm text-muted-foreground", className)}>
        {labels?.empty ?? ""}
      </p>
    )
  }

  return (
    <ol className={cn("space-y-8", className)}>
      {entries.map((entry, i) => (
        <li
          key={entry.version}
          data-testid="changelog-entry"
          data-version={entry.version}
          className="relative border-l border-border pl-5"
        >
          <span
            aria-hidden
            className={cn(
              "absolute -left-[5px] top-1.5 size-2.5 rounded-full",
              i === 0 ? "bg-primary" : "bg-border",
            )}
          />
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Links to the compare range against the previous release — which is
                the NEXT array element, since entries run newest-first. */}
            <h2 className="font-mono text-lg font-semibold">
              <a
                href={versionUrl(repoUrl, entry, entries[i + 1])}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                v{entry.version}
              </a>
            </h2>
            <time dateTime={entry.date} className="text-sm text-muted-foreground">
              {entry.date}
            </time>
            <a
              href={`${repoUrl.replace(/\/$/, "")}/commit/${entry.commit}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {entry.commit.slice(0, 7)}
            </a>
            {i === 0 && labels?.current ? (
              <span
                data-testid="changelog-current"
                className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {labels.current}
              </span>
            ) : null}
          </div>
          <ul className="space-y-2">
            {entry.changes.map((change, j) => (
              <li key={j} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    KIND_CLASS[change.kind],
                  )}
                >
                  {labels?.kinds?.[change.kind] ?? change.kind}
                </span>
                <span className="min-w-0 flex-1">{change.text}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export { VersionHistory }
