import * as React from "react"
import { Heart } from "lucide-react"

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
}

/**
 * The filing record, defined once.
 *
 * Both the page footer and the About panel show it -- the map workspace has no
 * page footer, so on a map route the panel is the only surface that can carry
 * it. A second copy of the string is a second thing to update when it changes.
 */
export const ARKIVE_ICP_RECORD = "沪ICP备2025152827号-1"

function SiteFooter({
  homeUrl = "https://tc-imba.com",
  homeLinkProps,
  githubUrl = "https://github.com/arkive-games",
  icpBeian = ARKIVE_ICP_RECORD,
  versionLink,
  className,
  ...props
}: SiteFooterProps) {
  return (
    <footer
      data-slot="site-footer"
      className={cn(
        "border-t border-border px-4 py-4 text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1">
          Made with
          <Heart aria-label="love" className="size-3 fill-red-500 text-red-500" />
          by
          <a
            href={homeUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="site-footer-home"
            className="font-medium underline-offset-4 hover:text-foreground hover:underline"
            {...homeLinkProps}
          >
            Arkive Games (藏舟攻略网)
          </a>
        </span>
        <span>© 2025-2026</span>
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
