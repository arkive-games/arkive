import { createContext, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, cn, useIsMobile, SiteFooter } from '@gamemap/ui'
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
   * @deprecated Ignored — every non-map page shares one width (the Paldeck
   * width, `max-w-6xl`). Kept only so existing call sites still type-check.
   */
  maxWidth?: string
  /**
   * Render `title` as a full-width desktop heading line above the content.
   * List/catalog pages opt in; detail pages keep their own entity header.
   */
  heading?: boolean
  /**
   * The page's filter controls (chip rows). Handed to the shell instead of
   * rendered directly so ONE place decides where they live: desktop keeps them
   * in the page flow — drop a `<ContentPageFilters />` marker where they used to
   * sit — while phones move them behind the mobile header's filter icon into a
   * bottom sheet, the same gesture as the map's filter FAB.
   */
  filters?: ReactNode
  /**
   * `true` while `filters` holds a non-default selection. Dots the mobile filter
   * icon so an active filter is still visible with the sheet closed (the chips
   * themselves are then off-screen).
   */
  filtersActive?: boolean
  children: ReactNode
}

// Single content width for all non-map pages (matches the Paldeck).
const CONTENT_MAX_WIDTH = 'max-w-6xl'

/**
 * The filter node plus who owns it this breakpoint. `inSheet` is the single
 * boolean deciding the mount point, so the inline slot and the sheet can never
 * disagree.
 */
const FiltersContext = createContext<{ node: ReactNode; inSheet: boolean }>({
  node: null,
  inSheet: false,
})

/**
 * Inline slot for {@link ContentPageProps.filters}: renders the filter node
 * exactly where the page puts this marker on desktop, and nothing on phones
 * (where the header's filter sheet mounts it instead).
 *
 * The node is mounted in exactly ONE place per breakpoint — never rendered twice
 * with one copy hidden by CSS — because the filter controls carry React state of
 * their own (open comboboxes, tooltip state); a second copy would duplicate it
 * and reset whichever copy the breakpoint flip unmounts.
 */
export function ContentPageFilters({ className }: { className?: string }) {
  const { node, inSheet } = useContext(FiltersContext)
  if (inSheet || !node) return null
  // `className` is the spacing/layout wrapper the page used to have around its
  // chip rows; without one the node is rendered bare so pages whose filter node
  // already carries its own wrapper keep byte-identical desktop markup.
  return className ? <div className={className}>{node}</div> : <>{node}</>
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
  children,
}: ContentPageProps) {
  const { t, i18n } = useTranslation()
  const isMobile = useIsMobile()
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const brandName = getArkiveBrandName(lng, t('brand'))
  // Phones only: on desktop the filters stay in the page flow, so no icon and no
  // sheet — and the pages without filters keep the plain title header.
  const inSheet = isMobile && filters != null

  return (
    <FiltersContext.Provider value={{ node: filters ?? null, inSheet }}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <TopNav active={active} />
        <ArkiveMobileHeader
          homeUrl={ARKIVE_HOME_URL}
          homeLinkProps={ARKIVE_HOME_LINK_PROPS}
          homeLabel={t('brandHome')}
          brandName={brandName}
          pageTitle={title}
          loginLabel={t('auth.login')}
          locale={lng}
          actions={inSheet ? (
            <button
              type="button"
              data-testid="mobile-filter-button"
              aria-label={t('filter')}
              aria-expanded={filterSheetOpen}
              onClick={() => setFilterSheetOpen(true)}
              className="relative flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-accent"
            >
              <SlidersHorizontal className="size-5" />
              {filtersActive ? (
                <span
                  data-testid="mobile-filter-active-dot"
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-card"
                />
              ) : null}
            </button>
          ) : undefined}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div className={cn('mx-auto w-full flex-1 px-4 py-6', CONTENT_MAX_WIDTH)}>
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
              className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-4"
              homeUrl={ARKIVE_HOME_URL}
              homeLinkProps={ARKIVE_HOME_LINK_PROPS}
              githubUrl={GITHUB_ORG_URL}
              icpBeian={ICP_BEIAN}
              versionLink={<Link to="/changelog">v{SITE_VERSION}</Link>}
            />
          </div>
        </div>
      </div>

      {inSheet ? (
        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="bottom" data-testid="mobile-filter-sheet" className="max-h-[85dvh]">
            <SheetTitle>{t('filter')}</SheetTitle>
            {/* Long chip lists scroll inside the sheet; the extra bottom padding
                keeps the last row clear of the home indicator. */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
              {filters}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </FiltersContext.Provider>
  )
}
