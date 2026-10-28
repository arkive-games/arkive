import type { ReactNode } from 'react'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveContentPage, ArkiveMobileHeader } from '@gamemap/map-shell'
import { SiteFooter } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { HOME_URL, SETTINGS } from '../lib/brand'
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
  return (
    <ArkiveContentPage
      topBar={<TopNav active={active} onNavigate={onNavigate} />}
      mobileHeader={
        <ArkiveMobileHeader
          homeUrl={HOME_URL}
          homeLabel={content.homeLabel}
          brandName={content.brandName}
          pageTitle={title}
          loginLabel={content.login}
          accountControl={<ArkiveAccountControl language="zh-CN" variant="mobileHeader" homeUrl={HOME_URL} settings={SETTINGS} />}
        />
      }
      footer={
        <SiteFooter
          className="pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-4"
          homeUrl={HOME_URL}
          githubUrl={import.meta.env.VITE_GITHUB_URL}
          icpBeian={import.meta.env.VITE_ICP_BEIAN}
          versionLink={<a href="/changelog" onClick={navigateOnClick('changelog', onNavigate)}>v{version}</a>}
        />
      }
      bottomNav={<BottomTabBar active={active} onNavigate={onNavigate} />}
      title={title}
      heading={heading}
      width={wide ? 'wide' : 'standard'}
      backToTopLabel={content.backToTop}
      // The column scrolls, not the window, so a new page has to be brought
      // back to the top here -- the browser only does that for the document.
      resultsKey={active}
    >
      {children}
    </ArkiveContentPage>
  )
}
