import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  Check,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  MapPinned,
  Ghost,
  Gem,
  PawPrint,
  Search,
  SlidersHorizontal,
  Sparkles,
  Shield,
  Swords,
  Wrench,
  X,
} from 'lucide-react'
import { ArkiveMapTopBar, ArkiveMobileHeader, trackPageview, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import { SiteFooter, VersionHistory, resolveChangelog, type ChangelogFile } from '@gamemap/ui'
import {
  cardFrameVariant,
  countCardsByCategory,
  countCardsByQuality,
  filterCards,
  localizedText,
  stripGameMarkup,
  type CardCategory,
  type CardFilters,
  type CardFrameVariant,
  type WikiCard,
} from './cardCatalog'
import { loadWikiData, type WikiData } from './wikiData'
import { MonsterWiki, PetWiki } from './CreatureWiki'
import { ProfessionWiki } from './ProfessionWiki'
import { TalentWiki } from './TalentWiki'
import { EquipmentWiki } from './EquipmentWiki'
import { SoulWiki } from './SoulWiki'
import { BuildPlanner } from './BuildPlanner'
import { resourceUrl } from './lib/urls'
import heroImage from './assets/ro3-hero.webp'
import cardFrame01 from './assets/native-ui/card_img_item_01_01.webp'
import cardFrame02 from './assets/native-ui/card_img_item_02_01.webp'
import cardFrame03 from './assets/native-ui/card_img_item_03_01.webp'
import cardFrame04 from './assets/native-ui/card_img_item_04_01.webp'
import cardFrame05 from './assets/native-ui/card_img_item_05_01.webp'
import cardFrame06 from './assets/native-ui/card_img_item_06_01.webp'
import cardFrame07 from './assets/native-ui/card_img_item_07_01.webp'
import cardFrame08 from './assets/native-ui/card_img_item_08_01.webp'
import collectionNamePurple from './assets/native-ui/card_img_item_name_01.webp'
import collectionNameYellow from './assets/native-ui/card_img_item_name_02.webp'
import collectionNameRed from './assets/native-ui/card_img_item_name_03.webp'
import content from './locales/zh-CN.json'
import changelogRaw from './changelog.json'

const HOME_URL = import.meta.env.VITE_HOME_URL
  ?? (import.meta.env.DEV ? 'http://localhost:15172' : 'https://tc-imba.com')

const DESTINATIONS = {
  map: import.meta.env.VITE_RO3_MAP_URL,
  gameplay: import.meta.env.VITE_RO3_GAMEPLAY_URL,
  tools: import.meta.env.VITE_RO3_TOOLS_URL,
}

const WIKI_URL = import.meta.env.VITE_RO3_WIKI_URL
const CHANGELOG = changelogRaw as ChangelogFile
const SITE_VERSION = CHANGELOG.entries[0].version

const CARD_PART_ASSETS: Record<number, string | null> = {
  1: 'icons/other/icon_equip_weapon_02.webp',
  2: 'icons/other/icon_equip_offhand_02.webp',
  3: 'icons/other/icon_equip_armor_02.webp',
  4: 'icons/other/icon_equip_cloak_02.webp',
  5: 'icons/other/icon_equip_shoes_02.webp',
  6: 'icons/other/icon_equip_accessory_02.webp',
  7: 'icons/other/icon_equip_headwear_02.webp',
  8: null,
  9: null,
}

const CARD_FRAME_ASSETS: Record<CardFrameVariant, string> = {
  '01': cardFrame01,
  '02': cardFrame02,
  '03': cardFrame03,
  '04': cardFrame04,
  '05': cardFrame05,
  '06': cardFrame06,
  '07': cardFrame07,
  '08': cardFrame08,
}

const COLLECTION_CARD_NAME_ASSETS: Partial<Record<CardFrameVariant, string>> = {
  '06': collectionNamePurple,
  '07': collectionNameYellow,
  '08': collectionNameRed,
}

const INITIAL_CARD_FILTERS: CardFilters = {
  category: 'ordinary',
  parts: [],
  qualities: [],
  baseAttributes: [],
  primaryAttributes: [],
}

type DestinationKey = keyof typeof DESTINATIONS
type IconComponent = ComponentType<{ 'aria-hidden'?: boolean | 'true' }>
type Page = 'overview' | 'wiki' | 'builds' | 'changelog'
type WikiView = 'skills' | 'talents' | 'cards' | 'pets' | 'monsters' | 'equipment' | 'souls'

// The landing page and the encyclopedia navigation advertise the same seven
// tables, so they read one list rather than two that drift apart.
const WIKI_SECTIONS: Array<{ view: WikiView; icon: IconComponent }> = [
  { view: 'skills', icon: Swords },
  { view: 'talents', icon: Sparkles },
  { view: 'cards', icon: BookOpen },
  { view: 'pets', icon: PawPrint },
  { view: 'monsters', icon: Ghost },
  { view: 'equipment', icon: Shield },
  { view: 'souls', icon: Gem },
]

// Bare `/` opens the encyclopedias rather than the landing page, which is where
// a visitor who typed the address wants to end up: the tables are the content,
// and the landing page exists to introduce them. It still needs a URL of its
// own, or reload and deep links would silently bounce back to the wiki.
function getInitialPage(): Page {
  if (window.location.pathname.replace(/\/$/, '').endsWith('/changelog')) return 'changelog'
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'overview' ? 'overview' : view === 'builds' ? 'builds' : 'wiki'
}

function getInitialWikiView(): WikiView {
  const value = new URLSearchParams(window.location.search).get('wiki')
  return value === 'talents' || value === 'cards' || value === 'pets' || value === 'monsters' || value === 'equipment' || value === 'souls' ? value : 'skills'
}

function App() {
  const { theme, setTheme } = useTheme()
  const [page, setPage] = useState<Page>(getInitialPage)
  const [wikiView, setWikiView] = useState<WikiView>(getInitialWikiView)
  const [noticeId, setNoticeId] = useState(0)

  const navItems: ShellNavItem[] = useMemo(() => [{ key: 'builds', label: content.builds.title, active: page === 'builds' }, ...content.navigation.map((item) => {
    if (item.key !== 'wiki') {
      return { key: item.key, label: item.label, active: item.key === page }
    }
    return {
      key: item.key,
      label: item.label,
      active: page === 'wiki',
      children: [
        {
          key: 'wiki-skills',
          label: content.wiki.tabs.skills,
          active: page === 'wiki' && wikiView === 'skills',
        },
        {
          key: 'wiki-talents',
          label: content.wiki.tabs.talents,
          active: page === 'wiki' && wikiView === 'talents',
        },
        {
          key: 'wiki-cards',
          label: content.wiki.tabs.cards,
          active: page === 'wiki' && wikiView === 'cards',
        },
        {
          key: 'wiki-pets',
          label: content.wiki.tabs.pets,
          active: page === 'wiki' && wikiView === 'pets',
        },
        {
          key: 'wiki-monsters',
          label: content.wiki.tabs.monsters,
          active: page === 'wiki' && wikiView === 'monsters',
        },
        {
          key: 'wiki-equipment',
          label: content.wiki.tabs.equipment,
          active: page === 'wiki' && wikiView === 'equipment',
        },
        {
          key: 'wiki-souls',
          label: content.wiki.tabs.souls,
          active: page === 'wiki' && wikiView === 'souls',
        },
      ],
    }
  })], [page, wikiView])

  useEffect(() => {
    document.title = page === 'wiki'
      ? content.wiki.documentTitle
      : page === 'changelog'
        ? content.changelog.documentTitle
        : content.documentTitle
  }, [page])

  useEffect(() => {
    const handlePopState = () => {
      setPage(getInitialPage())
      setWikiView(getInitialWikiView())
      // The browser has already swapped the URL by the time popstate fires, so
      // the default (read location) is the page the visitor just went back to.
      trackPageview()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!noticeId) return
    const timeout = window.setTimeout(() => setNoticeId(0), 3600)
    return () => window.clearTimeout(timeout)
  }, [noticeId])

  const showUnavailable = () => setNoticeId((value) => value + 1)

  const openDestination = (key: DestinationKey) => {
    const href = DESTINATIONS[key]
    if (href) {
      window.location.assign(href)
      return
    }
    showUnavailable()
  }

  const navigateToPage = (nextPage: Page, nextWikiView: WikiView = wikiView) => {
    const url = new URL(window.location.href)
    url.pathname = nextPage === 'changelog' ? '/changelog' : '/'
    if (nextPage === 'wiki' && nextWikiView === 'skills') {
      // Bare `/` already resolves to wiki/skills (see getInitialPage and
      // getInitialWikiView), so spelling the default out gives one page two
      // URLs: two links to share for the same view, and two rows in the traffic
      // report. Strip the params instead — the state round-trips either way.
      url.searchParams.delete('view')
      url.searchParams.delete('wiki')
    } else if (nextPage === 'wiki') {
      url.searchParams.set('view', 'wiki')
      url.searchParams.set('wiki', nextWikiView)
    } else if (nextPage === 'builds') {
      url.searchParams.set('view', 'builds')
      url.searchParams.delete('wiki')
    } else if (nextPage === 'overview') {
      url.searchParams.set('view', 'overview')
      url.searchParams.delete('wiki')
    } else {
      url.searchParams.delete('view')
      url.searchParams.delete('wiki')
    }
    window.history.pushState({}, '', url)
    trackPageview()
    setPage(nextPage)
    setWikiView(nextWikiView)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openWiki = (nextWikiView: WikiView = 'skills') => {
    if (WIKI_URL) {
      const url = new URL(WIKI_URL, window.location.href)
      // Same rule as navigateToPage. The destination is another instance of
      // this app -- `view` and `wiki` are parameters only getInitialPage and
      // getInitialWikiView read -- so it resolves a bare URL to wiki/skills
      // too, and spelling the default out would hand it the second address for
      // one page that this app just stopped producing for itself.
      if (nextWikiView !== 'skills') {
        url.searchParams.set('view', 'wiki')
        url.searchParams.set('wiki', nextWikiView)
      }
      window.location.assign(url)
      return
    }
    navigateToPage('wiki', nextWikiView)
  }

  const handleNavigation = (key: string) => {
    if (key === 'overview') {
      navigateToPage('overview')
      return
    }
    if (key === 'builds') {
      navigateToPage('builds')
      return
    }
    if (key === 'wiki' || key === 'wiki-skills') {
      openWiki('skills')
      return
    }
    if (key === 'wiki-cards') {
      openWiki('cards')
      return
    }
    if (key === 'wiki-talents') {
      openWiki('talents')
      return
    }
    if (key === 'wiki-pets') {
      openWiki('pets')
      return
    }
    if (key === 'wiki-monsters') {
      openWiki('monsters')
      return
    }
    if (key === 'wiki-equipment') {
      openWiki('equipment')
      return
    }
    if (key === 'wiki-souls') {
      openWiki('souls')
      return
    }
    if (key in DESTINATIONS) openDestination(key as DestinationKey)
  }

  return (
    <div className="ro3-app">
      <ArkiveMobileHeader
        homeUrl={HOME_URL}
        homeLabel={content.homeLabel}
        brandName={content.brandName}
        pageTitle={content.pageTitle}
        loginLabel={content.login}
        onLogin={showUnavailable}
      />

      <ArkiveMapTopBar
        homeUrl={HOME_URL}
        homeLabel={content.homeLabel}
        brandName={content.brandName}
        brandSlogan={content.brandSlogan}
        nav={{
          items: navItems,
          onDropdownTriggerClick: (item) => {
            if (item.key === 'wiki') openWiki('skills')
          },
          renderItem: (item, className, labelClassName) => (
            <button type="button" className={className} onClick={() => handleNavigation(item.key)}>
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            </button>
          ),
        }}
        languageSwitcher={{
          languages: [{ code: 'zh-CN', label: content.language }],
          current: 'zh-CN',
          onChange: () => undefined,
          menuLabel: content.language,
          shortLabel: content.languageShort,
        }}
        themeSwitcher={{
          labels: content.theme,
          current: theme,
          onChange: setTheme,
          menuLabel: content.themeMenu,
          shortLabel: content.themeMenu,
        }}
        loginLabel={content.login}
        onLogin={showUnavailable}
      />

      <nav className="ro3-mobile-nav" aria-label={content.navigationLabel}>
        {navItems.flatMap((item) => item.children ?? [item]).map((item) => (
          <button
            type="button"
            key={item.key}
            className={item.active ? 'is-active' : undefined}
            onClick={() => handleNavigation(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {page === 'wiki' ? (
        <WikiPage view={wikiView} onViewChange={openWiki} />
      ) : page === 'builds' ? (
        <main className="ro3-builds-page"><BuildPlanner onUnavailable={showUnavailable} /></main>
      ) : page === 'changelog' ? (
        <ChangelogPage onBack={() => navigateToPage('wiki')} />
      ) : (
      <main className="ro3-home">
        <section className="ro3-hero" aria-labelledby="ro3-title">
          <img src={heroImage} alt="" />
          <div className="ro3-hero-shade" />
          <div className="ro3-shell ro3-hero-inner">
            <div className="ro3-identity">
              <span>{content.hero.eyebrow}</span>
              <h1 id="ro3-title">{content.hero.title}</h1>
              <p>{content.hero.description}</p>
            </div>
            <div className="ro3-hero-actions">
              <HeroAction
                icon={BookOpen}
                title={content.hero.actions.wiki.title}
                description={content.hero.actions.wiki.description}
                onClick={() => openWiki('skills')}
                primary
              />
              <HeroAction
                icon={Swords}
                title={content.hero.actions.builds.title}
                description={content.hero.actions.builds.description}
                onClick={() => navigateToPage('builds')}
              />
            </div>
          </div>
        </section>

        <div className="ro3-shell ro3-home-body">
          <section className="ro3-catalog" aria-labelledby="ro3-catalog-title">
            <div className="ro3-section-heading">
              <span>{content.home.catalogEyebrow}</span>
              <h2 id="ro3-catalog-title">{content.home.catalogTitle}</h2>
              <p>{content.home.catalogDescription}</p>
            </div>
            <div className="ro3-catalog-grid">
              {WIKI_SECTIONS.map(({ view, icon: Icon }) => (
                <button type="button" key={view} className="ro3-catalog-card" onClick={() => openWiki(view)}>
                  <span className="ro3-catalog-card-icon"><Icon aria-hidden="true" /></span>
                  <strong>{content.wiki.tabs[view]}</strong>
                  <p>{content.home.sections[view]}</p>
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="ro3-home-aside" aria-labelledby="ro3-destinations-title">
            <h2 id="ro3-destinations-title" className="sr-only">{content.sidebar.title}</h2>
            <DestinationPanel
              icon={MapPinned}
              eyebrow={content.sidebar.map.eyebrow}
              title={content.sidebar.map.title}
              description={content.sidebar.map.description}
              action={content.sidebar.map.action}
              available={Boolean(DESTINATIONS.map)}
              onClick={() => openDestination('map')}
              featured
            />
            {/* The gameplay notes and the tool set have no page yet. One shared
                note says so once, rather than a row each repeating the same
                "coming soon" badge down the column. */}
            <section className="ro3-upcoming">
              <strong>{content.home.upcoming.title}</strong>
              <p>{content.home.upcoming.description}</p>
              <div>
                <span><Gamepad2 aria-hidden="true" />{content.entries.gameplay}</span>
                <span><Wrench aria-hidden="true" />{content.entries.tools}</span>
              </div>
            </section>
          </section>
        </div>
      </main>
      )}

      <SiteFooter
        className={page === 'wiki' ? 'ro3-footer ro3-footer--wiki' : 'ro3-footer'}
        homeUrl={HOME_URL}
        githubUrl={import.meta.env.VITE_GITHUB_URL}
        icpBeian={import.meta.env.VITE_ICP_BEIAN}
        versionLink={(
          <a
            href="/changelog"
            onClick={(event) => {
              event.preventDefault()
              navigateToPage('changelog')
            }}
          >
            v{SITE_VERSION}
          </a>
        )}
      />

      {noticeId > 0 ? (
        <div key={noticeId} className="ro3-toast" role="status" aria-live="polite">
          <span><Sparkles aria-hidden="true" /></span>
          <div>
            <strong>{content.notice.title}</strong>
            <small>{content.notice.description}</small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ChangelogPage({ onBack }: { onBack: () => void }) {
  const entries = useMemo(() => resolveChangelog(CHANGELOG, 'zh-CN'), [])

  return (
    <main className="ro3-changelog">
      <div className="ro3-shell">
        <button type="button" className="wiki-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {content.changelog.back}
        </button>
        <header>
          <span>{content.changelog.eyebrow}</span>
          <h1>{content.changelog.title}</h1>
          <p>{content.changelog.description}</p>
        </header>
        <VersionHistory
          entries={entries}
          labels={{
            current: content.changelog.current,
            empty: content.changelog.empty,
            kinds: content.changelog.kinds,
          }}
        />
      </div>
    </main>
  )
}

function WikiPage({ view, onViewChange }: { view: WikiView; onViewChange: (view: WikiView) => void }) {
  const [cardQuery, setCardQuery] = useState('')
  const [cardFilters, setCardFilters] = useState<CardFilters>(INITIAL_CARD_FILTERS)
  const [wikiData, setWikiData] = useState<WikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [selectedCard, setSelectedCard] = useState<WikiCard | null>(null)
  const collectionCardIds = useMemo(
    () => new Set(wikiData?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? []),
    [wikiData],
  )
  const cards = useMemo(
    () => filterCards(wikiData?.cards.cards ?? [], cardQuery, cardFilters, collectionCardIds),
    [cardFilters, cardQuery, collectionCardIds, wikiData],
  )

  useEffect(() => {
    if (view !== 'cards' || wikiData) return
    let active = true
    loadWikiData()
      .then((data) => {
        if (!active) return
        setWikiData(data)
        setDataError(false)
      })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [view, wikiData])

  useEffect(() => {
    if (!selectedCard) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCard(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCard])

  return (
    <main className="wiki-page">
      <nav className="ro3-shell wiki-section-nav" aria-label={content.wiki.tabsLabel}>
        <button type="button" className={view === 'skills' ? 'is-active' : undefined} aria-current={view === 'skills' ? 'page' : undefined} onClick={() => onViewChange('skills')}><Swords aria-hidden="true" />{content.wiki.tabs.skills}</button>
        <button type="button" className={view === 'talents' ? 'is-active' : undefined} aria-current={view === 'talents' ? 'page' : undefined} onClick={() => onViewChange('talents')}><Sparkles aria-hidden="true" />{content.wiki.tabs.talents}</button>
        <button type="button" className={view === 'cards' ? 'is-active' : undefined} aria-current={view === 'cards' ? 'page' : undefined} onClick={() => onViewChange('cards')}><BookOpen aria-hidden="true" />{content.wiki.tabs.cards}</button>
        <button type="button" className={view === 'pets' ? 'is-active' : undefined} aria-current={view === 'pets' ? 'page' : undefined} onClick={() => onViewChange('pets')}><PawPrint aria-hidden="true" />{content.wiki.tabs.pets}</button>
        <button type="button" className={view === 'monsters' ? 'is-active' : undefined} aria-current={view === 'monsters' ? 'page' : undefined} onClick={() => onViewChange('monsters')}><Ghost aria-hidden="true" />{content.wiki.tabs.monsters}</button>
        <button type="button" className={view === 'equipment' ? 'is-active' : undefined} aria-current={view === 'equipment' ? 'page' : undefined} onClick={() => onViewChange('equipment')}><Shield aria-hidden="true" />{content.wiki.tabs.equipment}</button>
        <button type="button" className={view === 'souls' ? 'is-active' : undefined} aria-current={view === 'souls' ? 'page' : undefined} onClick={() => onViewChange('souls')}><Gem aria-hidden="true" />{content.wiki.tabs.souls}</button>
      </nav>
      {view === 'skills' ? <ProfessionWiki /> : view === 'talents' ? <TalentWiki /> : view === 'cards' ? (
        <CardWiki
          query={cardQuery}
          filters={cardFilters}
          cards={cards}
          data={wikiData}
          dataError={dataError}
          selectedCard={selectedCard}
          onQueryChange={setCardQuery}
          onFiltersChange={setCardFilters}
          onSelect={setSelectedCard}
        />
      ) : view === 'pets' ? <PetWiki /> : view === 'monsters' ? <MonsterWiki /> : view === 'equipment' ? <EquipmentWiki /> : <SoulWiki />}
    </main>
  )
}

function CardWiki({
  query,
  filters,
  cards,
  data,
  dataError,
  selectedCard,
  onQueryChange,
  onFiltersChange,
  onSelect,
}: {
  query: string
  filters: CardFilters
  cards: WikiCard[]
  data: WikiData | null
  dataError: boolean
  selectedCard: WikiCard | null
  onQueryChange: (query: string) => void
  onFiltersChange: (filters: CardFilters) => void
  onSelect: (card: WikiCard | null) => void
}) {
  const [showFilters, setShowFilters] = useState(false)
  const allCards = data?.cards.cards ?? []
  const collectionCardIds = new Set(data?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? [])
  const categories: Array<{ key: CardCategory; label: string; count: number }> = [
    { key: 'ordinary', label: content.wiki.cards.categories.ordinary, count: countCardsByCategory(allCards, 'ordinary', collectionCardIds) },
    { key: 'collection', label: content.wiki.cards.categories.collection, count: countCardsByCategory(allCards, 'collection', collectionCardIds) },
  ]
  const categoryCards = filters.category === 'ordinary' ? allCards : allCards.filter((card) => collectionCardIds.has(card.id))
  const baseAttributes = data?.cards.attributes.filter((attribute) => attribute.type === 1) ?? []
  const primaryAttributes = data?.cards.attributes.filter((attribute) => attribute.type === 2) ?? []
  const activeFilterCount = filters.parts.length + filters.qualities.length + filters.baseAttributes.length + filters.primaryAttributes.length
  const activeCard = selectedCard && cards.some((card) => card.id === selectedCard.id) ? selectedCard : cards[0] ?? null

  const toggleFilterValue = (key: 'parts' | 'qualities' | 'baseAttributes' | 'primaryAttributes', value: number) => {
    const current = filters[key]
    onFiltersChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((candidate) => candidate !== value) : [...current, value],
    })
  }

  const selectCategory = (category: CardCategory) => {
    onSelect(null)
    onFiltersChange({ ...filters, category })
  }

  const clearFilters = () => onFiltersChange({ ...INITIAL_CARD_FILTERS, category: filters.category })

  return (
    <div className="ro3-shell wiki-card-workspace" role="tabpanel">
      <div className="card-native-layout">
        <section className="card-native-center" aria-labelledby="wiki-cards-title">
          <div className="card-native-center-head">
            <h2 id="wiki-cards-title">{content.wiki.cards.title}</h2>
          </div>
          <div className="card-catalog-toolbar">
            <div className="card-category-tabs" role="tablist" aria-label={content.wiki.cards.filterLabel}>
              {categories.map((category) => (
                <button type="button" role="tab" key={category.key} className={filters.category === category.key ? 'is-active' : undefined} aria-selected={filters.category === category.key} onClick={() => selectCategory(category.key)}>
                  {category.key === 'collection' ? <Sparkles aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
                  <strong>{category.label}</strong>
                  <small>{category.count}</small>
                </button>
              ))}
            </div>
            <div className="card-native-toolbar">
              <button type="button" className={`card-filter-trigger${showFilters ? ' is-active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((visible) => !visible)}>
                <SlidersHorizontal aria-hidden="true" />
                <span>{content.wiki.cards.filters.action}</span>
                {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
              </button>
              <label className="wiki-search">
                <Search aria-hidden="true" />
                <span className="sr-only">{content.wiki.cards.searchLabel}</span>
                <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={content.wiki.cards.searchPlaceholder} />
                {query ? <button type="button" aria-label={content.search.clear} onClick={() => onQueryChange('')}><X aria-hidden="true" /></button> : null}
              </label>
            </div>
          </div>
          {showFilters ? (
            <section className="card-filter-panel" aria-label={content.wiki.cards.filters.panelTitle}>
              <header>
                <strong>{content.wiki.cards.filters.panelTitle}</strong>
                <div>
                  <button type="button" onClick={clearFilters} disabled={activeFilterCount === 0}>{content.wiki.cards.filters.clear}</button>
                  <button type="button" aria-label={content.wiki.cards.filters.close} onClick={() => setShowFilters(false)}><X aria-hidden="true" /></button>
                </div>
              </header>
              <CardFilterGroup
                label={content.wiki.cards.filters.part}
                options={Object.keys(CARD_PART_ASSETS).map(Number).map((part) => ({ value: part, label: cardPartLabel(part), count: categoryCards.filter((card) => card.part === part).length }))}
                selected={filters.parts}
                onToggle={(value) => toggleFilterValue('parts', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.quality}
                options={[1, 2, 3, 4, 5, 6].map((quality) => ({ value: quality, label: content.wiki.cards.quality.replace('{quality}', String(quality)), count: countCardsByQuality(categoryCards, quality) }))}
                selected={filters.qualities}
                onToggle={(value) => toggleFilterValue('qualities', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.baseAttribute}
                options={baseAttributes.map((attribute) => ({ value: attribute.id, label: localizedText(attribute.name) }))}
                selected={filters.baseAttributes}
                onToggle={(value) => toggleFilterValue('baseAttributes', value)}
              />
              <CardFilterGroup
                label={content.wiki.cards.filters.primaryAttribute}
                options={primaryAttributes.map((attribute) => ({ value: attribute.id, label: localizedText(attribute.name) }))}
                selected={filters.primaryAttributes}
                onToggle={(value) => toggleFilterValue('primaryAttributes', value)}
              />
            </section>
          ) : null}
          <div className="card-catalog-grid" aria-label={content.wiki.cards.title}>
            {dataError ? <div className="wiki-empty">{content.wiki.dataError}</div> : !data ? <div className="wiki-empty">{content.wiki.loading}</div> : cards.length > 0 ? cards.map((card) => <CardTile key={card.id} card={card} collection={filters.category === 'collection'} active={activeCard?.id === card.id} onSelect={onSelect} />) : <div className="wiki-empty">{content.wiki.cards.empty}</div>}
          </div>
        </section>

        <aside className="card-native-detail" aria-label={content.wiki.cards.title}>
          {activeCard && data ? <CardWorkspaceDetail card={activeCard} data={data} /> : <div className="card-detail-empty">{dataError ? content.wiki.dataError : content.wiki.loading}</div>}
        </aside>
      </div>
      {selectedCard && data ? (
        <div className="card-mobile-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null)
        }}>
          <aside className="card-mobile-dialog" role="dialog" aria-modal="true" aria-label={localizedText(selectedCard.name)}>
            <button type="button" className="wiki-dialog-close" aria-label={content.wiki.cards.closeDetail} onClick={() => onSelect(null)}><X aria-hidden="true" /></button>
            <CardWorkspaceDetail card={selectedCard} data={data} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function CardFilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Array<{ value: number; label: string; count?: number }>
  selected: number[]
  onToggle: (value: number) => void
}) {
  return (
    <div className="card-filter-group">
      <strong>{label}</strong>
      <div>
        {options.map((option) => (
          <button type="button" key={option.value} className={selected.includes(option.value) ? 'is-active' : undefined} aria-pressed={selected.includes(option.value)} disabled={option.count === 0} onClick={() => onToggle(option.value)}>
            <span>{selected.includes(option.value) ? <Check aria-hidden="true" /> : null}</span>
            {option.label}
            {option.count !== undefined ? <small>{option.count}</small> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function cardPartLabel(part: number): string {
  return (content.wiki.cards.parts as Record<string, string>)[String(part)] ?? content.wiki.cards.part.replace('{part}', String(part))
}

function CardFrame({ card, collection }: { card: WikiCard; collection: boolean }) {
  const variant = cardFrameVariant(card.quality, collection)
  const frameAsset = variant ? CARD_FRAME_ASSETS[variant] : null
  const collectionNameAsset = variant ? COLLECTION_CARD_NAME_ASSETS[variant] : null
  const cardName = localizedText(card.name)
  const cardNameLength = [...cardName].length
  const cardNameClass = cardNameLength >= 9 ? 'is-extra-long-name' : cardNameLength >= 8 ? 'is-long-name' : undefined

  return (
    <span className={`card-game-frame${collection ? ' is-collection' : ''}`}>
      <span className="card-game-frame-art"><img src={resourceUrl(card.icon)} alt="" loading="lazy" /></span>
      {frameAsset ? <img className="card-game-frame-rarity" src={frameAsset} alt="" aria-hidden="true" /> : null}
      {collectionNameAsset ? (
        <>
          <span className="card-game-frame-nameplate-fill" aria-hidden="true" />
          <img className="card-game-frame-nameplate" src={collectionNameAsset} alt="" aria-hidden="true" />
        </>
      ) : null}
      <strong className={cardNameClass}>{cardName}</strong>
    </span>
  )
}

function CardTile({ card, collection, active, onSelect }: { card: WikiCard; collection: boolean; active: boolean; onSelect: (card: WikiCard) => void }) {
  return (
    <button type="button" className={`card-tile${active ? ' is-active' : ''}`} aria-label={`${localizedText(card.name)}, ${content.wiki.cards.quality.replace('{quality}', String(card.quality))}, ${cardPartLabel(card.part)}`} onClick={() => onSelect(card)}>
      <CardFrame card={card} collection={collection} />
    </button>
  )
}

function CardWorkspaceDetail({ card, data }: { card: WikiCard; data: WikiData }) {
  const attributeById = new Map(data.cards.attributes.map((attribute) => [attribute.id, attribute]))
  const effectById = new Map(data.cards.specialEffects.map((effect) => [effect.id, effect]))
  const effectIds = [...new Set(card.tiers.flatMap((tier) => tier.specialEffects))]
  return (
    <>
      <header className="card-detail-heading">
        <h3>{localizedText(card.name)}</h3>
        <span>{content.wiki.cards.quality.replace('{quality}', String(card.quality))} · {cardPartLabel(card.part)}</span>
      </header>
      <h4 className="card-detail-section-title">{content.wiki.cards.attributesTitle}</h4>
      <div className="card-detail-tiers">
        {card.tiers.map((tier) => (
          <section key={tier.configId}>
            <header><strong>{content.wiki.cards.tier.replace('{tier}', String(tier.tier + 1))}</strong><span>{content.wiki.cards.power.replace('{power}', String(tier.power))}</span></header>
            <small>{content.wiki.cards.requiredLevel.replace('{level}', String(tier.level))}</small>
            <div>{tier.attributes.map(([attributeId, value]) => {
              const attribute = attributeById.get(attributeId)
              return <span key={attributeId}>{localizedText(attribute?.name) || content.wiki.cards.attributeId.replace('{id}', String(attributeId))} +{value}</span>
            })}</div>
          </section>
        ))}
      </div>
      {effectIds.length > 0 ? <div className="card-detail-series"><strong>{content.wiki.cards.specialEffects}</strong>{effectIds.map((effectId) => <span key={effectId}>{stripGameMarkup(localizedText(effectById.get(effectId)?.description) || content.wiki.cards.effectId.replace('{id}', String(effectId)))}</span>)}</div> : null}
    </>
  )
}

function HeroAction({
  icon: Icon,
  title,
  description,
  onClick,
  primary = false,
}: {
  icon: IconComponent
  title: string
  description: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button type="button" className={primary ? 'ro3-hero-action is-primary' : 'ro3-hero-action'} onClick={onClick}>
      <span className="ro3-hero-action-icon"><Icon aria-hidden="true" /></span>
      <span className="ro3-hero-action-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

function DestinationPanel({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  available,
  onClick,
  featured = false,
}: {
  icon: IconComponent
  eyebrow: string
  title: string
  description: string
  action: string
  available: boolean
  onClick: () => void
  featured?: boolean
}) {
  return (
    <section className={featured ? 'destination-panel is-featured' : 'destination-panel'}>
      <span className="destination-eyebrow"><Icon aria-hidden="true" />{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {/* An unavailable destination keeps its button -- it explains itself when
          clicked -- but drops the call-to-action colour, which otherwise reads
          as "open this" on the one panel that cannot be opened. */}
      <button type="button" className={available ? undefined : 'is-unavailable'} onClick={onClick}>
        {available ? action : content.unavailable}
        {available ? <ExternalLink aria-hidden="true" /> : null}
      </button>
    </section>
  )
}

export default App
