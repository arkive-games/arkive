import type { AnchorHTMLAttributes, ReactNode } from "react"
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
  feedbackTitle: string
  feedbackHint?: string
}

export interface ArkiveSiteInfoProps {
  strings: ArkiveSiteInfoStrings
  arkiveName: string
  arkiveHomeUrl: string
  arkiveHomeLinkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">
  gameName: string
  developerName: string
  version: string
  /** In-app destination for this game's complete version history. */
  gameUpdatesUrl: string
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

export function platformUpdatesUrl(homeUrl: string): string {
  return `${homeUrl.split("#", 1)[0]}#updates`
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
  gameUpdatesUrl,
  feedbackGroup,
  gameContact,
  className,
}: ArkiveSiteInfoProps) {
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
      body: (
        <div className="flex flex-col items-start gap-1.5">
          <a data-testid="site-info-game-updates-link" href={gameUpdatesUrl} className="font-medium">
            {strings.viewVersionTemplate.replace("{version}", version)}
          </a>
          <a
            data-testid="site-info-platform-updates-link"
            href={platformUpdatesUrl(arkiveHomeUrl)}
            {...arkiveHomeLinkProps}
            className="font-medium"
          >
            {arkiveName} · {strings.versionTitle}
          </a>
        </div>
      ),
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
