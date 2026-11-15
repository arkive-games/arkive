import { ArkiveSiteFooter as SiteFooter } from '@gamemap/map-shell'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveContentPage, ArkiveMobileHeader, getArkiveBrandName } from '@gamemap/map-shell'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'
import { useSessionScroll, type SessionScrollContext } from '@gamemap/state-memory'
import { catalogScrollRecord } from '../lib/memory'
import { EncyclopediaLayout } from './EncyclopediaLayout'
import { isEncyclopediaSection, type KnowledgeDirectory } from './encyclopediaNavigation'

export interface ContentPageProps {
  active: NavKey
  /** Mobile header text, and the desktop <h1> when `heading` is set. */
  title: ReactNode
  heading?: boolean
  /** Widen past the default for dense grids. */
  wide?: boolean
  browsing?: SessionScrollContext
  directory?: KnowledgeDirectory
  children: ReactNode
}

/** This game's navigation, strings and links, in the shared page shell. */
export function ContentPage({ active, title, heading = false, wide = false, browsing, directory, children }: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()
  const scrollRestoration = useSessionScroll(catalogScrollRecord, browsing)
  const encyclopedia = isEncyclopediaSection(active)

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
          accountControl={<ArkiveAccountControl language={lng} variant="mobileHeader" homeUrl={ARKIVE_HOME_URL} settings={settings} />}
        />
      }
      footer={
        <SiteFooter
          locale={lng}
          settings={settings}
          className="pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-4"
          homeUrl={ARKIVE_HOME_URL}
          githubUrl={import.meta.env.VITE_GITHUB_URL}
          icpBeian={import.meta.env.VITE_ICP_BEIAN}
          versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
        />
      }
      title={title}
      heading={heading}
      headingClassName={encyclopedia ? 'lg:sr-only' : undefined}
      width={wide ? 'wide' : 'standard'}
      scrollRestoration={scrollRestoration}
    >
      {encyclopedia ? <EncyclopediaLayout active={active} directory={directory}>{children}</EncyclopediaLayout> : children}
    </ArkiveContentPage>
  )
}
