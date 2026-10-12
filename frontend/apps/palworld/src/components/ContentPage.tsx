import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArkiveAccountControl } from '@gamemap/auth'
import { FilterDisclosure, SiteFooter } from '@gamemap/ui'
import { ArkiveContentPage, ArkiveMobileHeader, getArkiveBrandName } from '@gamemap/map-shell'
import { TopNav, type NavKey } from './TopNav'
import { SITE_VERSION } from '../lib/siteVersion'
import {
  ARKIVE_HOME_LINK_PROPS,
  ARKIVE_HOME_URL,
  GITHUB_ORG_URL,
  ICP_BEIAN,
} from '../lib/brand'

export interface ContentPageProps {
  /** Active nav key, drives desktop top-nav highlight + is used by tests. */
  active: NavKey
  /** Page title shown in the mobile-only header. */
  title: ReactNode
  /**
   * Render `title` as a full-width desktop heading line above the content.
   * List/catalog pages opt in; detail pages keep their own entity header.
   */
  heading?: boolean
  /**
   * The page's filter controls (chip rows). Handed to the shell instead of
   * rendered directly so ONE place decides how they render: drop a
   * `<ContentPageFilters />` marker where they sit. Desktop shows them as-is;
   * phones get the shared `FilterDisclosure` toggle so they can be folded away.
   */
  filters?: ReactNode
  /**
   * `true` while `filters` holds a non-default selection. Dots the mobile filter
   * toggle so an active filter is still visible with the panel collapsed.
   */
  filtersActive?: boolean
  /** Hide the site footer on phones while keeping it on desktop. */
  hideMobileFooter?: boolean
  children: ReactNode
}


/** The page's filter node plus whether it holds a non-default selection. */
const FiltersContext = createContext<{ node: ReactNode; active: boolean }>({ node: null, active: false })

/**
 * Inline slot for {@link ContentPageProps.filters}: renders the filter node
 * exactly where the page puts this marker, inside the shared
 * `FilterDisclosure` so phones can collapse it (desktop shows no toggle).
 *
 * `className` is the spacing/layout wrapper the page used to have around its
 * chip rows.
 */
export function ContentPageFilters({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { node, active } = useContext(FiltersContext)
  if (!node) return null
  return (
    <FilterDisclosure label={t('filter')} active={active} bodyClassName={className} testId="content-page-filters">
      {node}
    </FilterDisclosure>
  )
}

/**
 * This game's navigation, strings and links in the shared page shell. Phones
 * get the compact title header, the back-to-top button, and bottom padding
 * that clears the fixed bottom tab bar; the content width is the standard one.
 */
export function ContentPage({
  active,
  title,
  heading = false,
  filters,
  filtersActive = false,
  hideMobileFooter = false,
  children,
}: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))

  return (
    <FiltersContext.Provider value={{ node: filters ?? null, active: filtersActive }}>
      <ArkiveContentPage
        topBar={<TopNav active={active} />}
        mobileHeader={
          <ArkiveMobileHeader
            homeUrl={ARKIVE_HOME_URL}
            homeLabel={t('brandHome')}
            brandName={brandName}
            pageTitle={title}
            loginLabel={t('auth.login')}
            accountControl={<ArkiveAccountControl language={lng} variant="mobileHeader" />}
          />
        }
        // Every outbound link goes through lib/brand, so a toy build points the
        // brand at the sibling portal toy and drops the links it cannot reach,
        // rather than falling back to the public-web defaults.
        footer={
          <SiteFooter
            className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
            homeUrl={ARKIVE_HOME_URL}
            homeLinkProps={ARKIVE_HOME_LINK_PROPS}
            githubUrl={GITHUB_ORG_URL}
            icpBeian={ICP_BEIAN}
            versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
          />
        }
        title={title}
        heading={heading}
        backToTopLabel={t('backToTop')}
        hideMobileFooter={hideMobileFooter}
      >
        {children}
      </ArkiveContentPage>
    </FiltersContext.Provider>
  )
}
