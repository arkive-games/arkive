import * as React from "react"
import { Heart } from "lucide-react"

import { GitHubIcon } from "./github-icon"
import { cn } from "./utils"

export interface SiteFooterProps extends React.ComponentProps<"footer"> {
  /** Main-site link for the brand name. Wire to VITE_HOME_URL in each app. */
  homeUrl?: string
  /** GitHub organization link. Wire to VITE_GITHUB_URL in each app. */
  githubUrl?: string
  /** ICP filing record (China). Wire to VITE_ICP_BEIAN in each app. */
  icpBeian?: string
}

function SiteFooter({
  homeUrl = "https://tc-imba.com",
  githubUrl = "https://github.com/arkive-games",
  icpBeian = "沪ICP备2025152827号-1",
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
            className="font-medium underline-offset-4 hover:text-foreground hover:underline"
          >
            Arkive Games (藏舟攻略网)
          </a>
        </span>
        <span>© 2025-2026</span>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="hover:text-foreground"
        >
          <GitHubIcon className="size-4" />
        </a>
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {icpBeian}
        </a>
      </div>
    </footer>
  )
}

export { SiteFooter }
