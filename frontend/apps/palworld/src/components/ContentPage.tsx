import type { ReactNode } from 'react'
import { cn, SiteFooter } from '@gamemap/ui'
import { TopNav, type NavKey } from './TopNav'

export interface ContentPageProps {
  /** Active nav key, drives desktop top-nav highlight + is used by tests. */
  active: NavKey
  /** Page title shown in the mobile-only header. */
  title: ReactNode
  /**
   * @deprecated Ignored — every non-map page shares one width (the Paldeck
   * width, `max-w-6xl`). Kept only so existing call sites still type-check.
   */
  maxWidth?: string
  /**
   * Render `title` as a full-width desktop heading line above the content.
   * List/catalog pages opt in; detail pages keep their own entity header.
   */
  heading?: boolean
  children: ReactNode
}

// Single content width for all non-map pages (matches the Paldeck).
const CONTENT_MAX_WIDTH = 'max-w-6xl'

/**
 * Shared page shell for every non-map page. Desktop (md+) renders the top nav +
 * scroll area + max-width column; mobile hides the top nav (the bottom tab bar
 * handles navigation), shows a compact title header, and pads the bottom so
 * content clears the fixed bottom tab bar + safe area. The content column width
 * is unified across all pages.
 */
export function ContentPage({ active, title, heading = false, children }: ContentPageProps) {
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} />
      <header
        className="flex h-12 shrink-0 items-center border-b border-border bg-card px-4 text-base font-semibold text-card-foreground md:hidden"
        data-testid="mobile-header"
      >
        {title}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className={cn('mx-auto w-full flex-1 px-4 py-6', CONTENT_MAX_WIDTH)}>
            {heading ? (
              <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1>
            ) : null}
            {children}
          </div>
          {/* On mobile the footer (last scroll element) clears the fixed bottom tab bar. */}
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
          />
        </div>
      </div>
    </div>
  )
}
