import type { ReactNode } from 'react'
import { cn } from '@gamemap/ui'
import { TopNav, type NavKey } from './TopNav'

export interface ContentPageProps {
  /** Active nav key, drives desktop top-nav highlight + is used by tests. */
  active: NavKey
  /** Page title shown in the mobile-only header. */
  title: ReactNode
  /** Tailwind max-width class for the centered content column (e.g. "max-w-5xl"). */
  maxWidth?: string
  children: ReactNode
}

/**
 * Shared page shell for every non-map page. Desktop (md+) renders the top nav +
 * scroll area + max-width column exactly as before. Mobile hides the top nav
 * (the bottom tab bar handles navigation), shows a compact title header, and
 * pads the bottom so content clears the fixed bottom tab bar + safe area.
 */
export function ContentPage({ active, title, maxWidth = 'max-w-5xl', children }: ContentPageProps) {
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
        <div
          className={cn('mx-auto w-full px-4 py-6', maxWidth)}
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
