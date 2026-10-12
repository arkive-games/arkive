import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { cn, FilterDisclosure, SiteFooter } from '@gamemap/ui'
import { ArkiveMobileHeader, getArkiveBrandName } from '@gamemap/map-shell'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'
import { ARKIVE_HOME_URL } from '../lib/brand'

export interface ContentPageProps {
  active: NavKey
  /** Mobile header text, and the desktop <h1> when `heading` is set. */
  title: ReactNode
  heading?: boolean
  /** Widen past the default for dense grids. */
  wide?: boolean
  /**
   * Catalogue controls stay outside the results scroller. Phones can fold them
   * away behind the shared `FilterDisclosure` toggle; desktop shows no toggle.
   */
  toolbar?: ReactNode
  /** `true` while the toolbar holds a non-default selection; dots the phone toggle. */
  filtersActive?: boolean
  /** Only result-scope changes reset reading position, not edits inside cards. */
  resultsKey?: string
  children: ReactNode
}

export function ContentPage({ active, title, heading = false, wide = false, toolbar, filtersActive = false, resultsKey, children }: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const contentWidth = wide ? 'max-w-[var(--arkive-content-wide-data)]' : 'max-w-[var(--arkive-content-standard)]'
  const resultsRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTop = 0
  }, [resultsKey])

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} />
      <ArkiveMobileHeader
        homeUrl={ARKIVE_HOME_URL}
        homeLabel={t('brandHome')}
        brandName={brandName}
        pageTitle={title}
        loginLabel={t('login')}
        accountControl={<ArkiveAccountControl language={lng} variant="mobileHeader" />}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar != null ? <div data-content-toolbar className="max-h-[50%] shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-background">
          <div className={cn('arkive-content-page mx-auto w-full pb-3', contentWidth)}>
            {heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
            <FilterDisclosure label={t('filterToggle')} active={filtersActive} testId="content-toolbar-filters">
              {toolbar}
            </FilterDisclosure>
          </div>
        </div> : null}
        {/* Keep absolute descendants contained by the results scroller. */}
        <div ref={resultsRef} data-content-scroll className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div className={cn('arkive-content-page mx-auto w-full flex-1 pb-6', contentWidth)}>
              {heading && toolbar == null ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
              {children}
            </div>
            <SiteFooter
              className="pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-4"
              homeUrl={ARKIVE_HOME_URL}
              githubUrl={import.meta.env.VITE_GITHUB_URL}
              icpBeian={import.meta.env.VITE_ICP_BEIAN}
              versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
