import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn, SiteFooter } from '@gamemap/ui'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'

export interface ContentPageProps {
  active: NavKey
  /** Mobile header text, and the desktop <h1> when `heading` is set. */
  title: ReactNode
  heading?: boolean
  /** Widen past the default for dense grids. */
  wide?: boolean
  children: ReactNode
}

export function ContentPage({ active, title, heading = false, wide = false, children }: ContentPageProps) {
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
          <div className={cn('mx-auto w-full flex-1 px-4 py-6', wide ? 'max-w-7xl' : 'max-w-6xl')}>
            {heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
            {children}
          </div>
          <SiteFooter
            className="pb-4"
            homeUrl={import.meta.env.VITE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      </div>
    </div>
  )
}
