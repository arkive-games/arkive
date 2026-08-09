import type { AnchorHTMLAttributes, ReactNode } from "react"
import type { ResolvedEntry } from "@gamemap/ui"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@gamemap/ui"
import { SiteInfoPanel, type SiteInfoFeedbackGroup, type SiteInfoSection } from "./SiteInfoPanel"

export interface ArkiveSiteInfoStrings {
  aboutTitle: string
  /** Supports the tokens `{arkive}`, `{game}`, and `{developer}`. */
  introTemplate: string
  /** Supports the tokens `{arkive}`, `{game}`, and `{developer}`. */
  disclaimerTemplate: string
  versionTitle: string
  /** Supports the token `{version}`. */
  viewVersionTemplate: string
  recentUpdatesTitle: string
  noRecentUpdates: string
  feedbackTitle: string
  feedbackHint?: string
  close: string
}

export interface ArkiveSiteInfoProps {
  strings: ArkiveSiteInfoStrings
  arkiveName: string
  arkiveHomeUrl: string
  arkiveHomeLinkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">
  gameName: string
  developerName: string
  version: string
  /** Locale-resolved newest-first entries. Every eligible entry is shown. */
  recentEntries: ResolvedEntry[]
  /**
   * First release eligible for this About dialog. Older site history is
   * intentionally omitted; later releases remain visible as they are added.
   */
  historyStartVersion?: string
  feedbackGroup: SiteInfoFeedbackGroup
  /** Optional game-owned channels rendered before the shared feedback group. */
  gameContact?: ReactNode
  className?: string
}

type RichToken = "arkive" | "game" | "developer"

function RichTemplate({
  template,
  arkiveName,
  arkiveHomeUrl,
  arkiveHomeLinkProps,
  gameName,
  developerName,
}: Pick<
  ArkiveSiteInfoProps,
  | "arkiveName"
  | "arkiveHomeUrl"
  | "arkiveHomeLinkProps"
  | "gameName"
  | "developerName"
> & { template: string }) {
  const values: Record<Exclude<RichToken, "arkive">, string> = {
    game: gameName,
    developer: developerName,
  }

  return template.split(/(\{(?:arkive|game|developer)\})/g).map((part, index) => {
    const token = /^\{(arkive|game|developer)\}$/.exec(part)?.[1] as RichToken | undefined
    if (!token) return part
    if (token === "arkive") {
      return (
        <a
          key={`${token}-${index}`}
          href={arkiveHomeUrl}
          {...arkiveHomeLinkProps}
          data-testid="site-info-arkive-link"
          className="font-semibold text-primary underline underline-offset-2"
        >
          {arkiveName}
        </a>
      )
    }
    return (
      <strong key={`${token}-${index}`} className="font-semibold text-foreground">
        {values[token]}
      </strong>
    )
  })
}

function RecentUpdatesDialog({
  strings,
  version,
  entries,
}: Pick<ArkiveSiteInfoProps, "strings" | "version"> & { entries: ResolvedEntry[] }) {
  const label = strings.viewVersionTemplate.replace("{version}", version)

  return (
    <Dialog>
      <DialogTriggerButton label={label} />
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[2999]"
        className="z-[3000] max-h-[min(70dvh,40rem)] grid-rows-[auto_minmax(0,1fr)_auto]"
        data-testid="site-info-version-dialog"
      >
        <DialogHeader>
          <DialogTitle>{strings.recentUpdatesTitle}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          {entries.length > 0 ? (
            <ol className="space-y-4">
              {entries.map((entry) => (
                <li key={entry.version}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {entry.version}
                    </span>
                    <time dateTime={entry.date} className="text-xs text-muted-foreground">
                      {entry.date}
                    </time>
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {entry.changes.map((change, index) => (
                      <li key={index}>{change.text}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{strings.noRecentUpdates}</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{strings.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogTriggerButton({ label }: { label: string }) {
  return (
    <DialogTrigger asChild>
      <button
        type="button"
        data-testid="site-info-version-trigger"
        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {label}
      </button>
    </DialogTrigger>
  )
}

/**
 * Canonical Arkive About content shared by every game page. Games only supply
 * localized copy, identity, release data, and optional game-owned channels.
 */
export function ArkiveSiteInfo({
  strings,
  arkiveName,
  arkiveHomeUrl,
  arkiveHomeLinkProps,
  gameName,
  developerName,
  version,
  recentEntries,
  historyStartVersion,
  feedbackGroup,
  gameContact,
  className,
}: ArkiveSiteInfoProps) {
  const historyStartIndex = historyStartVersion
    ? recentEntries.findIndex((entry) => entry.version === historyStartVersion)
    : recentEntries.length - 1
  const eligibleEntries = historyStartIndex >= 0
    ? recentEntries.slice(0, historyStartIndex + 1)
    : []
  const templateProps = {
    arkiveName,
    arkiveHomeUrl,
    arkiveHomeLinkProps,
    gameName,
    developerName,
  }
  const sections: SiteInfoSection[] = [
    {
      title: strings.aboutTitle,
      body: (
        <>
          <p className="mb-2">
            <RichTemplate template={strings.introTemplate} {...templateProps} />
          </p>
          <p>
            <RichTemplate template={strings.disclaimerTemplate} {...templateProps} />
          </p>
        </>
      ),
    },
    {
      title: strings.versionTitle,
      body: <RecentUpdatesDialog strings={strings} version={version} entries={eligibleEntries} />,
    },
    {
      title: strings.feedbackTitle,
      body: (
        <>
          {gameContact}
          {strings.feedbackHint ? <p className={gameContact ? "mt-2" : undefined}>{strings.feedbackHint}</p> : null}
        </>
      ),
    },
  ]

  return <SiteInfoPanel className={className} sections={sections} feedbackGroup={feedbackGroup} />
}
