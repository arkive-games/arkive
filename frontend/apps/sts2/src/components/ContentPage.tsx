import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { SiteFooter } from '@gamemap/ui'
import { ArkiveContentPage, ArkiveMobileHeader, getArkiveBrandName } from '@gamemap/map-shell'
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

/** This game's navigation, strings and links, in the shared page shell. */
export function ContentPage({ active, title, heading = false, wide = false, children }: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))

  return (
    <ArkiveContentPage
      topBar={<TopNav active={active} />}
      mobileHeader={
        <ArkiveMobileHeader
          homeUrl={ARKIVE_HOME_URL}
          homeLabel={t('brandHome')}
          brandName={brandName}
          pageTitle={title}
          loginLabel={t('login')}
          accountControl={<ArkiveAccountControl language={lng} variant="mobileHeader" />}
        />
      }
      footer={
        <SiteFooter
          className="pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-4"
          homeUrl={ARKIVE_HOME_URL}
          githubUrl={import.meta.env.VITE_GITHUB_URL}
          icpBeian={import.meta.env.VITE_ICP_BEIAN}
          versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
        />
      }
      title={title}
      heading={heading}
      width={wide ? 'wide' : 'standard'}
    >
      {children}
    </ArkiveContentPage>
  )
}
