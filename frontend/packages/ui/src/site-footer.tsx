import * as React from "react"
import { FooterVoyage } from "./footer-voyage"

import { GitHubIcon } from "./github-icon"
import { cn } from "./utils"

export interface SiteFooterProps extends React.ComponentProps<"footer"> {
  /** Main-site link for the brand name. Wire to VITE_HOME_URL in each app. */
  homeUrl?: string
  /**
   * Extra attributes for the brand link, spread last so it can clear the
   * new-tab default: a same-origin target (a sibling Bilibili toy) should
   * navigate in place, so that app passes `{ target: undefined, rel: undefined }`.
   */
  homeLinkProps?: React.ComponentProps<"a">
  /**
   * GitHub organization link. Wire to VITE_GITHUB_URL in each app. Pass `null`
   * to omit the link — a build that cannot reach the public web (a Bilibili
   * toy) must not render a dead icon.
   */
  githubUrl?: string | null
  /**
   * ICP filing record (China). Wire to VITE_ICP_BEIAN in each app. Pass `null`
   * to omit it: the filing describes OUR hosting, so showing it on a page
   * served by somebody else is simply wrong.
   */
  icpBeian?: string | null
  /**
   * Site version link, e.g. `<Link to="/changelog">v1.8.0</Link>`. A slot rather
   * than an href so each app supplies its own router link (client-side nav).
   */
  versionLink?: React.ReactNode
  /** Localized, host-owned navigation and dialog actions. */
  navigation?: React.ReactNode
}

/**
 * The filing record, defined once.
 *
 * Both the page footer and the About panel show it -- the map workspace has no
 * page footer, so on a map route the panel is the only surface that can carry
 * it. A second copy of the string is a second thing to update when it changes.
 */
export const ARKIVE_ICP_RECORD = "沪ICP备2025152827号-1"

/**
 * The Arkive player feedback QQ group. One number for every site: it is the
 * same group behind the footer link, the About panel and the meta portal, and
 * a per-app copy of it is how they drift apart.
 */
export const ARKIVE_FEEDBACK_QQ_GROUP = "1091411026"

function SiteFooter({
  homeUrl = "https://arkive.games",
  homeLinkProps,
  githubUrl = "https://github.com/arkive-games",
  icpBeian = ARKIVE_ICP_RECORD,
  versionLink,
  navigation,
  className,
  ...props
}: SiteFooterProps) {
  const footerRef = React.useRef<HTMLElement>(null)
  return (
    <footer
      ref={footerRef}
      data-slot="site-footer"
      className={cn(
        "mt-auto bg-card px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground md:px-8 md:py-10",
        className
      )}
      {...props}
    >
      <FooterVoyage footerRef={footerRef} />
      <div className="mx-auto flex max-w-[85rem] flex-wrap items-center gap-x-6 gap-y-4">
        <span className="mr-auto inline-flex items-center">
          <a
            href={homeUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="site-footer-home"
            className="arkive-wordmark text-2xl font-semibold text-foreground"
            {...homeLinkProps}
          >
            Arkive
          </a>
        </span>
        {navigation && <div className="flex w-full flex-wrap gap-4 text-sm md:w-auto">{navigation}</div>}
        <span>© 2025-2026 Arkive.games</span>
        {versionLink ? (
          <span
            data-testid="site-footer-version"
            className="hidden underline-offset-4 hover:text-foreground md:inline [&_a:hover]:underline"
          >
            {versionLink}
          </span>
        ) : null}
        {githubUrl ? (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            data-testid="site-footer-github"
            className="hover:text-foreground"
          >
            <GitHubIcon className="size-4" />
          </a>
        ) : null}
        {icpBeian ? (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="site-footer-icp"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {icpBeian}
          </a>
        ) : null}
      </div>
    </footer>
  )
}

export { SiteFooter }
