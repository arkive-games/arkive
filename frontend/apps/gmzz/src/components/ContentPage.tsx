import type { ReactNode } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveAccountControl } from '@gamemap/auth'
import { SiteFooter } from '@gamemap/ui'
import { ArkiveContentPage, ArkiveMobileHeader, getArkiveBrandName, useEncyclopediaDesktop } from '@gamemap/map-shell'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'
import { ARKIVE_HOME_URL } from '../lib/brand'
import { useSettingsConfig } from '../lib/settings'
import { useSessionScroll, type SessionScrollContext } from '@gamemap/state-memory'
import { catalogScroll } from '../features/catalog/memory'
import { EncyclopediaLayout } from './EncyclopediaLayout'
import { isEncyclopediaSection } from './navGroups'

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
  /**
   * Toolbar content that must stay visible when the phone filters are folded
   * away: section tabs, the page description, the search box.
   */
  toolbarLead?: ReactNode
  /** `true` while the toolbar holds a non-default selection; dots the phone toggle. */
  filtersActive?: boolean
  /** Only result-scope changes reset reading position, not edits inside cards. */
  resultsKey?: string
  browsing?: SessionScrollContext
  /** Full-bleed banner above the content column. */
  hero?: ReactNode
  children: ReactNode
}

/** This game's navigation, strings and links, in the shared page shell. */
export function ContentPage({ active, title, heading = false, wide = false, toolbar, toolbarLead, filtersActive = false, resultsKey, browsing, hero, children }: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  const settings = useSettingsConfig()
  const scrollRestoration = useSessionScroll(catalogScroll.record, browsing ? { ...browsing, resultsKey: browsing.resultsKey ?? resultsKey } : undefined)
  const search = useSearch({ strict: false }) as { tab?: string }
  const encyclopedia = isEncyclopediaSection(active, search.tab)
  const desktop = useEncyclopediaDesktop()
  const inlineToolbar = encyclopedia && desktop

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
      toolbar={inlineToolbar ? undefined : toolbar}
      toolbarLead={inlineToolbar ? undefined : toolbarLead}
      filterLabel={t('filterToggle')}
      filtersActive={filtersActive}
      resultsKey={resultsKey}
      scrollRestoration={scrollRestoration}
      hero={hero}
    >
      {encyclopedia ? <EncyclopediaLayout active={active}>
        {inlineToolbar && (toolbar != null || toolbarLead != null) && <div className="mb-4" data-encyclopedia-toolbar>{toolbarLead}{toolbar}</div>}
        {children}
      </EncyclopediaLayout> : children}
    </ArkiveContentPage>
  )
}
