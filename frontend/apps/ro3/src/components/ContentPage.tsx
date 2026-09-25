import { useEffect, useRef, type ReactNode } from 'react'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMobileHeader } from '@gamemap/map-shell'
import { cn, SiteFooter } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { HOME_URL } from '../lib/brand'
import { navigateOnClick, type NavigationProps } from '../navigation'
import { TopNav } from './TopNav'
import { BottomTabBar } from './BottomTabBar'

export interface ContentPageProps extends NavigationProps {
  /** Mobile header text, and the desktop <h1> when `heading` is set. */
  title: ReactNode
  heading?: boolean
  /** Widen past the default for dense grids. */
  wide?: boolean
  /** The site version, linked from the footer. */
  version: string
  children: ReactNode
}

/**
 * The page shell every Arkive game uses outside its map: top bar, a scrolling
 * column of one of the two named content widths, the site footer, and on a
 * phone the compact header plus the bottom strip in place of the bar.
 */
export function ContentPage({ active, onNavigate, title, heading = false, wide = false, version, children }: ContentPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // The column scrolls, not the window, so a new page has to be brought back
  // to the top here -- the browser only does that for the document.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [active])

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} onNavigate={onNavigate} />
      <ArkiveMobileHeader
        homeUrl={HOME_URL}
        homeLabel={content.homeLabel}
        brandName={content.brandName}
        pageTitle={title}
        loginLabel={content.login}
        accountControl={<ArkiveAccountControl language="zh-CN" variant="mobileHeader" />}
      />
      {/* `relative` so anything positioned inside -- a screen-reader-only label
          is `position: absolute` -- is contained by this scroller, rather than
          giving the window a second scrollbar into blank space. */}
      <div ref={scrollRef} data-content-scroll className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <main
            className={cn(
              'arkive-content-page mx-auto w-full flex-1 pb-6',
              wide ? 'max-w-[var(--arkive-content-wide-data)]' : 'max-w-[var(--arkive-content-standard)]',
            )}
          >
            {heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
            {children}
          </main>
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-4"
            homeUrl={HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<a href="/changelog" onClick={navigateOnClick('changelog', onNavigate)}>v{version}</a>}
          />
        </div>
      </div>
      <BottomTabBar active={active} onNavigate={onNavigate} />
    </div>
  )
}
