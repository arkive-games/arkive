import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { trackPageview } from '@gamemap/map-shell'
import {
  Button,
  resolveChangelog,
  VersionHistory,
  type ChangelogFile,
} from '@gamemap/ui'
import { CatalogLayout, Chip, DetailSection, FilterRow, Notice, Panel, SearchField, Tab, TabRow } from './components/wiki'
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
import { ContentPage } from './components/ContentPage'
import { loadDataVersion, resourceUrl } from './lib/urls'
import {
  hrefFor,
  hrefForKey,
  locationForKey,
  navigateOnClick,
  navKeyFor,
  readLocation,
  WIKI_VIEWS,
  type Location,
  type NavKey,
  type WikiView,
} from './navigation'
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

// The home page lists what exists and nothing else: the build manual and the
// seven tables. A grid promising pages that are not built is worse than a
// short honest list.
const HOME_SECTIONS: Array<{ key: NavKey; title: string; body: string }> = [
  { key: 'builds', title: content.builds.title, body: content.builds.homeDescription },
  ...WIKI_VIEWS.map((view) => ({
    key: `wiki-${view}` as NavKey,
    title: content.wiki.tabs[view],
    body: content.home.sections[view],
  })),
]

function pageTitle({ page, view }: Location): string {
  if (page === 'wiki') return content.wiki.tabs[view]
  if (page === 'builds') return content.builds.title
  if (page === 'changelog') return content.changelog.title
  return content.pageTitle
}

function App() {
  const [location, setLocation] = useState<Location>(readLocation)
  const [noticeId, setNoticeId] = useState(0)
  const active = navKeyFor(location)

  useEffect(() => {
    document.title = location.page === 'wiki'
      ? content.wiki.documentTitle
      : location.page === 'changelog'
        ? content.changelog.documentTitle
        : content.documentTitle
  }, [location.page])

  useEffect(() => {
    const handlePopState = () => {
      setLocation(readLocation())
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

  const navigate = (key: NavKey) => {
    const next = locationForKey(key)
    if (!next) return
    const href = hrefFor(next.page, next.view)
    if (href !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({}, '', href)
      trackPageview()
    }
    setLocation(next)
  }

  return (
    <>
      <ContentPage
        active={active}
        onNavigate={navigate}
        title={pageTitle(location)}
        // The home page carries its own heading, visible on phones as well.
        heading={location.page !== 'overview'}
        wide={location.page === 'wiki' || location.page === 'builds'}
        version={SITE_VERSION}
      >
        {location.page === 'wiki' ? (
          <WikiPage view={location.view} />
        ) : location.page === 'builds' ? (
          <BuildPlanner onUnavailable={showUnavailable} />
        ) : location.page === 'changelog' ? (
          <ChangelogPage />
        ) : (
          <HomePage onNavigate={navigate} />
        )}
      </ContentPage>

      {noticeId > 0 ? (
        <div key={noticeId} className="ro3-toast" role="status" aria-live="polite">
          <span><Sparkles aria-hidden="true" /></span>
          <div>
            <strong>{content.notice.title}</strong>
            <small>{content.notice.description}</small>
          </div>
        </div>
      ) : null}
    </>
  )
}

function HomePage({ onNavigate }: { onNavigate: (key: NavKey) => void }) {
  const [gameVersion, setGameVersion] = useState<string>()

  useEffect(() => {
    let active = true
    loadDataVersion()
      .then((version) => { if (active) setGameVersion(version.gameVersion) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{content.home.title}</h1>
        <p className="mt-1 text-muted-foreground">{content.home.tagline}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {HOME_SECTIONS.map((section) => (
          <a
            key={section.key}
            href={hrefForKey(section.key)}
            onClick={navigateOnClick(section.key, onNavigate)}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/60"
          >
            <span className="font-semibold">{section.title}</span>
            <span className="text-sm text-muted-foreground">{section.body}</span>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <a href={hrefForKey('wiki-skills')} onClick={navigateOnClick('wiki-skills', onNavigate)}>{content.home.browse}</a>
        </Button>
      </div>

      {gameVersion ? (
        <p className="text-xs text-muted-foreground">{content.home.dataNote.replace('{version}', gameVersion)}</p>
      ) : null}
    </div>
  )
}

function ChangelogPage() {
  const entries = useMemo(() => resolveChangelog(CHANGELOG, 'zh-CN'), [])

  return (
    <VersionHistory
      entries={entries}
      labels={{
        current: content.changelog.current,
        empty: content.changelog.empty,
        kinds: content.changelog.kinds,
      }}
    />
  )
}

function WikiPage({ view }: { view: WikiView }) {
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
    <div className="wiki-page">
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
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <TabRow label={content.wiki.cards.filterLabel}>
          {categories.map((category) => (
            <Tab key={category.key} active={filters.category === category.key} onClick={() => selectCategory(category.key)}>
              {category.key === 'collection' ? <Sparkles aria-hidden="true" className="size-4" /> : <BookOpen aria-hidden="true" className="size-4" />}
              {category.label}
              <span className="text-xs text-muted-foreground">{category.count}</span>
            </Tab>
          ))}
        </TabRow>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'outline'}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {content.wiki.cards.filters.action}
            {activeFilterCount > 0 ? <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{activeFilterCount}</span> : null}
          </Button>
          <SearchField
            className="min-w-0 flex-1 md:w-72"
            value={query}
            onChange={onQueryChange}
            label={content.wiki.cards.searchLabel}
            placeholder={content.wiki.cards.searchPlaceholder}
          />
        </div>
      </div>

      {showFilters ? (
        <Panel aria-label={content.wiki.cards.filters.panelTitle} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{content.wiki.cards.filters.panelTitle}</h2>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={activeFilterCount === 0}>{content.wiki.cards.filters.clear}</Button>
              <Button type="button" variant="ghost" size="icon" aria-label={content.wiki.cards.filters.close} onClick={() => setShowFilters(false)}><X aria-hidden="true" /></Button>
            </div>
          </div>
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
        </Panel>
      ) : null}

      <CatalogLayout
        detailLabel={activeCard ? localizedText(activeCard.name) : content.wiki.cards.title}
        open={Boolean(selectedCard && data)}
        onClose={() => onSelect(null)}
        detail={activeCard && data ? <CardWorkspaceDetail card={activeCard} data={data} /> : <Notice>{dataError ? content.wiki.dataError : content.wiki.loading}</Notice>}
        list={<div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{content.wiki.cards.resultCount.replace('{count}', String(cards.length))}</p>
          {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : cards.length > 0 ? (
            // The faces are the game's own card art; the class carries their rules.
            <div className="card-catalog-grid" aria-label={content.wiki.cards.title}>
              {cards.map((card) => <CardTile key={card.id} card={card} collection={filters.category === 'collection'} active={activeCard?.id === card.id} onSelect={onSelect} />)}
            </div>
          ) : <Notice>{content.wiki.cards.empty}</Notice>}
        </div>}
      />
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
    <FilterRow label={label}>
      {options.map((option) => (
        <Chip
          key={option.value}
          active={selected.includes(option.value)}
          disabled={option.count === 0}
          count={option.count}
          onClick={() => onToggle(option.value)}
        >
          {selected.includes(option.value) ? <Check aria-hidden="true" className="size-3.5" /> : null}
          {option.label}
        </Chip>
      ))}
    </FilterRow>
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
      <header className="flex flex-col gap-0.5 border-b border-border pb-3">
        <h3 className="text-lg font-semibold">{localizedText(card.name)}</h3>
        <span className="text-xs text-muted-foreground">{content.wiki.cards.quality.replace('{quality}', String(card.quality))} · {cardPartLabel(card.part)}</span>
      </header>
      <DetailSection title={content.wiki.cards.attributesTitle}>
        <div className="flex flex-col divide-y divide-border">
          {card.tiers.map((tier) => (
            <section key={tier.configId} className="flex flex-col gap-1.5 py-2.5 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="text-sm font-semibold">{content.wiki.cards.tier.replace('{tier}', String(tier.tier + 1))}</strong>
                <span className="text-xs text-muted-foreground">{content.wiki.cards.power.replace('{power}', String(tier.power))}</span>
              </div>
              <span className="text-xs text-muted-foreground">{content.wiki.cards.requiredLevel.replace('{level}', String(tier.level))}</span>
              <div className="flex flex-wrap gap-1.5">
                {tier.attributes.map(([attributeId, value]) => {
                  const attribute = attributeById.get(attributeId)
                  return (
                    <span key={attributeId} className="rounded bg-[color:var(--arkive-filter-active)] px-1.5 py-0.5 text-xs">
                      {localizedText(attribute?.name) || content.wiki.cards.attributeId.replace('{id}', String(attributeId))}{' '}
                      <b className="font-semibold text-[color:var(--arkive-nav-active)]">+{value}</b>
                    </span>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </DetailSection>
      {effectIds.length > 0 ? (
        <DetailSection title={content.wiki.cards.specialEffects}>
          {effectIds.map((effectId) => (
            <p key={effectId} className="text-sm leading-relaxed text-muted-foreground">
              {stripGameMarkup(localizedText(effectById.get(effectId)?.description) || content.wiki.cards.effectId.replace('{id}', String(effectId)))}
            </p>
          ))}
        </DetailSection>
      ) : null}
    </>
  )
}

export default App
