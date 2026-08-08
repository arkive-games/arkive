import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn, SiteFooter } from '@gamemap/ui'
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
  children: ReactNode
}

export function ContentPage({ active, title, heading = false, wide = false, children }: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopNav active={active} />
      <ArkiveMobileHeader
        homeUrl={ARKIVE_HOME_URL}
        homeLabel={t('brandHome')}
        brandName={brandName}
        pageTitle={title}
        loginLabel={t('login')}
        locale={lng}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className={cn('mx-auto w-full flex-1 px-4 py-6', wide ? 'max-w-7xl' : 'max-w-6xl')}>
            {heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null}
            {children}
          </div>
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={ARKIVE_HOME_URL}
            githubUrl={import.meta.env.VITE_GITHUB_URL}
            icpBeian={import.meta.env.VITE_ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        </div>
      </div>
    </div>
  )
}
