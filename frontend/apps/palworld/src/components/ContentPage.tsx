import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowUp } from 'lucide-react'
import { ArkiveAccountControl } from '@gamemap/auth'
import { cn, FilterDisclosure, useIsMobile, SiteFooter } from '@gamemap/ui'
import { ArkiveMobileHeader, getArkiveBrandName } from '@gamemap/map-shell'
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

// Single content width for all non-map pages: the `standard` content-width role.
// Was max-w-6xl (72rem), which matched the Paldeck rather than any spec role.
const CONTENT_MAX_WIDTH = 'max-w-[var(--arkive-content-standard)]'

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
 * Shared page shell for every non-map page. Desktop (md+) renders the top nav +
 * scroll area + max-width column; mobile hides the top nav (the bottom tab bar
 * handles navigation), shows a compact title header — with the filter icon when
 * the page has filters — and pads the bottom so content clears the fixed bottom
 * tab bar + safe area. The content column width is unified across all pages.
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
  const isMobile = useIsMobile()
  const [showBackToTop, setShowBackToTop] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))

  useEffect(() => {
    if (!isMobile) {
      setShowBackToTop(false)
      return
    }
    const scroller = scrollRef.current
    if (!scroller) return
    const onScroll = () => setShowBackToTop(scroller.scrollTop > 500)
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [isMobile])

  const scrollToTop = () => {
    const scroller = scrollRef.current
    if (!scroller) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <FiltersContext.Provider value={{ node: filters ?? null, active: filtersActive }}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <TopNav active={active} />
        <ArkiveMobileHeader
          homeUrl={ARKIVE_HOME_URL}
          homeLabel={t('brandHome')}
          brandName={brandName}
          pageTitle={title}
          loginLabel={t('auth.login')}
          accountControl={<ArkiveAccountControl language={lng} variant="mobileHeader" />}
        />
        <div ref={scrollRef} data-content-scroll className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div
              className={cn(
                'arkive-content-page mx-auto w-full flex-1 pb-6',
                hideMobileFooter && 'pb-[calc(env(safe-area-inset-bottom)+7rem)] md:pb-6',
                CONTENT_MAX_WIDTH,
              )}
            >
              {heading ? (
                <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1>
              ) : null}
              {children}
            </div>
            {/* On mobile the footer (last scroll element) clears the fixed bottom tab bar. */}
            {/* Every outbound link goes through lib/brand, so a toy build points
                the brand at the sibling portal toy and drops the links it cannot
                reach — rather than falling back to the public-web defaults. */}
            <SiteFooter
              className={cn(
                'pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4',
                hideMobileFooter && 'hidden md:block',
              )}
              homeUrl={ARKIVE_HOME_URL}
              homeLinkProps={ARKIVE_HOME_LINK_PROPS}
              githubUrl={GITHUB_ORG_URL}
              icpBeian={ICP_BEIAN}
              versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
            />
          </div>
        </div>
        {showBackToTop ? (
          <button
            type="button"
            data-testid="content-back-to-top"
            aria-label={t('backToTop')}
            title={t('backToTop')}
            onClick={scrollToTop}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-[var(--arkive-layer-map-control)] flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
          >
            <ArrowUp className="size-5" />
          </button>
        ) : null}
      </div>

    </FiltersContext.Provider>
  )
}
