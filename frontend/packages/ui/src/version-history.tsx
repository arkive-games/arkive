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
  /**
   * Repository the version / commit links point at. Defaults to the monorepo.
   * Pass `null` to render both as plain text — a build with no route to the
   * public web (a Bilibili toy) would otherwise fill the page with dead links.
   */
  repoUrl?: string | null
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

  const lastIndex = entries.length - 1

  return (
    <ol className={cn("relative", className)}>
      {entries.map((entry, i) => (
        <li
          key={entry.version}
          data-testid="changelog-entry"
          data-version={entry.version}
          // Vertical rhythm is padding, not margin, so consecutive spine
          // segments abut instead of being broken up by collapsed gaps.
          className={cn("relative pl-8", i === lastIndex ? "pb-0" : "pb-8")}
        >
          {/* Spine segment: starts inside this marker and ends at the top edge of
              the next one, so the whole list reads as a single line. Skipped on
              the last entry, which is where the timeline terminates. */}
          {i !== lastIndex ? (
            <span
              aria-hidden
              data-testid="changelog-spine"
              // left-1.5 is the marker's centre (size-3 at left-0); the
              // translate centres the 1px rule on it instead of leaving it a
              // half-pixel to the right.
              className="absolute left-1.5 top-2 -bottom-2 w-px -translate-x-1/2 bg-border"
            />
          ) : null}
          {/* Rendered after the spine so it paints over it: a hollow marker with
              the page background masks the line, giving dot–line–dot. */}
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-2 size-3 rounded-full border-2 bg-background",
              i === 0 ? "border-primary" : "border-border",
            )}
          />
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Links to the compare range against the previous release — which is
                the NEXT array element, since entries run newest-first. With no
                repo (a Bilibili toy, which cannot reach GitHub) the version and
                hash stay as plain text rather than becoming dead links. */}
            <h2 className="font-mono text-lg font-semibold">
              {repoUrl ? (
                <a
                  href={versionUrl(repoUrl, entry, entries[i + 1])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  v{entry.version}
                </a>
              ) : (
                <>v{entry.version}</>
              )}
            </h2>
            <time dateTime={entry.date} className="text-sm text-muted-foreground">
              {entry.date}
            </time>
            {repoUrl ? (
              <a
                href={`${repoUrl.replace(/\/$/, "")}/commit/${entry.commit}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {entry.commit.slice(0, 7)}
              </a>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {entry.commit.slice(0, 7)}
              </span>
            )}
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
