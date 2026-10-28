import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BookOpen, LayoutGrid, PenTool, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction } from './components/SectionNav'
import { GameText } from './components/GameText'
import { LevelStepper } from './components/LevelStepper'
import { Badge, CostList, DetailPanel, UnderlineTab, ValueList } from './components/Board'
import { useFit, usePointer } from './components/boardHooks'
import {
  cardFrameVariant,
  filterCards,
  localizedText,
  type CardAttribute,
  type CardCategory,
  type CardFilters,
  type CardFrameVariant,
  type WikiCard,
} from './cardCatalog'
import { loadWikiData, type WikiData } from './wikiData'
import { resourceUrl } from './lib/urls'
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

const text = content.wiki.cards

const PARTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const QUALITIES = [2, 3, 4, 5, 6]

// The game's own slot glyphs; the two sketch slots have none, so a pen stands in.
const PART_ICONS: Record<number, string> = {
  1: 'icons/other/icon_equip_weapon_02.webp',
  2: 'icons/other/icon_equip_offhand_02.webp',
  3: 'icons/other/icon_equip_armor_02.webp',
  4: 'icons/other/icon_equip_cloak_02.webp',
  5: 'icons/other/icon_equip_shoes_02.webp',
  6: 'icons/other/icon_equip_accessory_02.webp',
  7: 'icons/other/icon_equip_headwear_02.webp',
}

// The rarity colours of the game's frames, as dots beside the quality names.
const QUALITY_COLORS: Record<number, string> = {
  2: '#3f9d4f',
  3: '#3a7bd5',
  4: '#9a5bd3',
  5: '#dc9a1e',
  6: '#d8463a',
}

const FRAMES: Record<CardFrameVariant, string> = {
  '01': cardFrame01,
  '02': cardFrame02,
  '03': cardFrame03,
  '04': cardFrame04,
  '05': cardFrame05,
  '06': cardFrame06,
  '07': cardFrame07,
  '08': cardFrame08,
}

const NAMEPLATES: Partial<Record<CardFrameVariant, string>> = {
  '06': collectionNamePurple,
  '07': collectionNameYellow,
  '08': collectionNameRed,
}

const NO_FILTERS: Omit<CardFilters, 'category'> = { parts: [], qualities: [], baseAttributes: [], primaryAttributes: [] }

// Attribute types: 1 the six base stats, 2 the primary ones.
const BASE_TYPE = 1
const PRIMARY_TYPE = 2
// Special effect kind that adds an attribute: `[1, attribute id, value]`.
const ATTRIBUTE_EFFECT = 1

/** Matches the sidebar's breakpoint: beside the grid from `lg`, inside it below. */
const WIDE_QUERY = '(min-width: 64rem)'
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE_QUERY)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  )
}

export function CardWiki() {
  const [data, setData] = useState<WikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [filters, setFilters] = useState<CardFilters>({ category: 'ordinary', ...NO_FILTERS })
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    loadWikiData()
      .then((next) => { if (active) setData(next) })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [])

  const allCards = useMemo(() => data?.cards.cards ?? [], [data])
  const collectionIds = useMemo(() => new Set(data?.cards.flashCardPools.flatMap((pool) => pool.cards) ?? []), [data])
  const collection = filters.category === 'collection'
  const categoryCards = useMemo(
    () => collection ? allCards.filter((card) => collectionIds.has(card.id)) : allCards,
    [allCards, collection, collectionIds],
  )
  const cards = useMemo(() => filterCards(allCards, query, filters, collectionIds), [allCards, query, filters, collectionIds])

  // Facets offer only what the current kind of card can carry, so no chip leads nowhere.
  const attributes = useMemo(() => {
    const carried = new Set(categoryCards.flatMap((card) => card.tiers.flatMap((tier) => tier.attributes.map(([id]) => id))))
    return (data?.cards.attributes ?? []).filter((attribute) => (attribute.type === BASE_TYPE || attribute.type === PRIMARY_TYPE) && carried.has(attribute.id))
  }, [data, categoryCards])
  const countBy = (key: 'part' | 'quality', value: number) => categoryCards.filter((card) => card[key] === value).length
  const facetCount = filters.qualities.length + filters.baseAttributes.length + filters.primaryAttributes.length

  const toggle = (key: 'qualities' | 'baseAttributes' | 'primaryAttributes', value: number) => setFilters((previous) => ({
    ...previous,
    [key]: previous[key].includes(value) ? previous[key].filter((candidate) => candidate !== value) : [...previous[key], value],
  }))

  return (
    <div className="card-wiki flex flex-col gap-3 md:gap-4">
      <HeaderAction>
        <button
          type="button"
          aria-label={text.searchToggle}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
          className={cn(
            'grid size-9 place-items-center rounded-full transition-colors',
            searchOpen
              ? 'bg-foreground text-background'
              : 'bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)]',
          )}
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </HeaderAction>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        {/* The kind of card is the page's main choice: a muted track whose lit pill is filled. */}
        <div role="tablist" aria-label={text.filterLabel} className="grid w-full grid-cols-2 gap-0.5 rounded-full bg-muted p-1 md:flex md:w-fit">
          {(['ordinary', 'collection'] as const).map((category: CardCategory) => {
            const selected = category === filters.category
            const Icon = category === 'collection' ? Sparkles : BookOpen
            const count = category === 'collection' ? collectionIds.size : allCards.length
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilters((previous) => ({ ...previous, category }))}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
                  selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {text.categories[category]}
                {data ? <span className={cn('text-xs tabular-nums', selected ? 'opacity-70' : 'opacity-80')}>{count}</span> : null}
              </button>
            )
          })}
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            searchInput.current?.focus()
          }}
          className={cn(
            'w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-4 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-ring/40 lg:flex lg:w-[23rem]',
            searchOpen ? 'flex' : 'hidden',
          )}
        >
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={text.searchLabel}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)] transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        </form>
      </div>

      <section aria-label={text.title} className="rounded-lg border border-border bg-card">
        {/* The slot is the board's own sub choice, so it reads as tabs on the board's edge. */}
        <div className="flex items-center gap-3 border-b border-border pr-2.5 md:px-1.5 md:pr-3.5">
          <div role="group" aria-label={text.partLabel} className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
            <UnderlineTab className="items-center gap-1 pt-1" selected={filters.parts.length === 0} onClick={() => setFilters((previous) => ({ ...previous, parts: [] }))}>
              <LayoutGrid aria-hidden="true" className="size-4" />
              {text.all}
            </UnderlineTab>
            {PARTS.filter((part) => countBy('part', part) > 0).map((part) => (
              <UnderlineTab
                key={part}
                className="items-center gap-1 pt-1"
                selected={filters.parts.length === 1 && filters.parts[0] === part}
                onClick={() => setFilters((previous) => ({ ...previous, parts: [part] }))}
              >
                {PART_ICONS[part]
                  ? <img src={resourceUrl(PART_ICONS[part])} alt="" className="size-5 object-contain" />
                  : <PenTool aria-hidden="true" className="size-4" />}
                {partLabel(part)}
              </UnderlineTab>
            ))}
          </div>
          {data ? (
            <span aria-live="polite" className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground md:block">
              {text.resultCount.replace('{count}', String(cards.length))}
            </span>
          ) : null}
        </div>

        {/* The finer facets stay on the board, one quiet line under the tabs. */}
        <div className="flex items-center gap-x-3 gap-y-1.5 overflow-x-auto border-b border-dashed border-border px-2.5 py-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-3.5">
          <FacetGroup label={text.qualityLabel}>
            {QUALITIES.map((quality) => (
              <Facet
                key={quality}
                selected={filters.qualities.includes(quality)}
                disabled={countBy('quality', quality) === 0}
                onClick={() => toggle('qualities', quality)}
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: QUALITY_COLORS[quality] }} />
                {qualityLabel(quality)}
              </Facet>
            ))}
          </FacetGroup>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <FacetGroup label={text.attributeLabel}>
            {attributes.map((attribute) => {
              const key = attribute.type === BASE_TYPE ? 'baseAttributes' : 'primaryAttributes'
              return (
                <Facet key={attribute.id} selected={filters[key].includes(attribute.id)} onClick={() => toggle(key, attribute.id)}>
                  {attributeName(attribute)}
                </Facet>
              )
            })}
          </FacetGroup>
          {facetCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilters((previous) => ({ ...previous, ...NO_FILTERS, parts: previous.parts }))}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[color:var(--arkive-nav-active)] transition-colors hover:bg-[color:var(--arkive-filter-active)] md:h-8"
            >
              <X aria-hidden="true" className="size-3.5" />
              {text.filters.clear}
            </button>
          ) : null}
        </div>

        {dataError ? <div className="p-3"><Notice>{content.wiki.dataError}</Notice></div> : !data ? <div className="p-3"><Notice>{content.wiki.loading}</Notice></div> : (
          <CardBoard key={filters.category} cards={cards} data={data} collection={collection} />
        )}
      </section>
    </div>
  )
}

function FacetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-1 md:shrink md:flex-wrap">
      <span className="mr-0.5 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Facet({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 md:h-8',
        selected
          ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--arkive-nav-active)_45%,transparent)]'
          : 'bg-muted/70 text-foreground/75 hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * The cards as a grid of their own faces, with one panel for the picked card:
 * beside the grid, sticking while it scrolls, from `lg`; below that it opens
 * inside the grid, under the row the card is on.
 */
function CardBoard({ cards, data, collection }: { cards: WikiCard[]; data: WikiData; collection: boolean }) {
  const wide = useWide()
  const [selectedId, setSelectedId] = useState<number>()
  const [tiers, setTiers] = useState<Record<number, number>>({})
  // Phones fit three across, the smallest the game's nameplates still read at.
  const [gridRef, fit] = useFit(wide ? 6.75 : 5.25)
  const columns = Math.max(3, Math.min(fit || 6, 10))
  const selectedIndex = cards.findIndex((card) => card.id === selectedId)
  // Wide screens always have a panel to fill; on phones it opens on a tap and closes on a second.
  const activeIndex = selectedIndex >= 0 ? selectedIndex : wide && cards.length > 0 ? 0 : -1
  const active = activeIndex >= 0 ? cards[activeIndex] : undefined
  const { panelRef, areaRef, pointerRef } = usePointer(`${active?.id}-${wide}-${columns}`)
  const rowEnd = Math.min(cards.length - 1, (Math.floor(activeIndex / columns) + 1) * columns - 1)

  useEffect(() => {
    if (selectedId === undefined) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(undefined) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selectedId])

  const select = (card: WikiCard) => setSelectedId(!wide && card.id === active?.id ? undefined : card.id)

  const panel = active ? (
    <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
      <CardDetail
        card={active}
        data={data}
        collection={collection}
        index={tiers[active.id]}
        onIndex={(next) => setTiers((previous) => ({ ...previous, [active.id]: next }))}
      />
    </DetailPanel>
  ) : null

  if (cards.length === 0) return <div className="p-3"><Notice>{text.empty}</Notice></div>

  return (
    <div className="grid gap-2.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-4">
      <div ref={areaRef} className="min-w-0">
        <div ref={gridRef} className="grid gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {cards.map((card, index) => (
            <Fragment key={card.id}>
              <CardTile card={card} collection={collection} selected={card.id === active?.id} onSelect={() => select(card)} />
              {!wide && index === rowEnd ? <div className="col-span-full pb-1 pt-2">{panel}</div> : null}
            </Fragment>
          ))}
        </div>
      </div>
      {wide ? <div className="sticky top-4 min-w-0">{panel}</div> : null}
    </div>
  )
}

function CardTile({ card, collection, selected, onSelect }: { card: WikiCard; collection: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${localizedText(card.name)}，${qualityLabel(card.quality)}，${partLabel(card.part)}`}
      onClick={onSelect}
      className={cn(
        'group rounded-lg p-1 transition-colors md:p-1.5',
        selected ? 'bg-[color:var(--arkive-filter-active)] ring-2 ring-[color:var(--arkive-nav-active)]' : 'hover:bg-muted',
      )}
    >
      <span className="block transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5">
        <CardFace card={card} collection={collection} />
      </span>
    </button>
  )
}

/** The game's own card face: the art, its rarity frame and, for collected cards, the nameplate. */
function CardFace({ card, collection }: { card: WikiCard; collection: boolean }) {
  const variant = cardFrameVariant(card.quality, collection)
  const frame = variant ? FRAMES[variant] : null
  const nameplate = variant ? NAMEPLATES[variant] : null
  const name = localizedText(card.name)
  return (
    <span className={cn('card-game-frame', collection && 'is-collection')}>
      <span className="card-game-frame-art"><img src={resourceUrl(card.icon)} alt="" loading="lazy" /></span>
      {frame ? <img className="card-game-frame-rarity" src={frame} alt="" aria-hidden="true" /> : null}
      {nameplate ? (
        <>
          <span className="card-game-frame-nameplate-fill" aria-hidden="true" />
          <img className="card-game-frame-nameplate" src={nameplate} alt="" aria-hidden="true" />
        </>
      ) : null}
      <strong>{name}</strong>
    </span>
  )
}

/** The picked card at the stepped tier: what it adds, what the next tier asks, and its effects. */
function CardDetail({ card, data, collection, index, onIndex }: {
  card: WikiCard
  data: WikiData
  collection: boolean
  index?: number
  onIndex: (index: number) => void
}) {
  const last = card.tiers.length - 1
  // The finished card by default: its whole bonus.
  const at = Math.min(index ?? last, last)
  const tier = card.tiers[at]
  const attributeById = new Map(data.cards.attributes.map((attribute) => [attribute.id, attribute]))
  const attributeLabel = (id: number) => {
    const attribute = attributeById.get(id)
    return attribute ? attributeName(attribute) : text.attributeId.replace('{id}', String(id))
  }
  // An effect the game writes no sentence for is a plain attribute bonus; spell those out instead.
  const effectById = new Map(data.cards.specialEffects.map((effect) => [
    effect.id,
    localizedText(effect.description) || (effect.effects ?? [])
      .filter(([kind]) => kind === ATTRIBUTE_EFFECT)
      .map(([, id, value]) => `${attributeLabel(id)} ${attributeValue(value)}`)
      .join('，'),
  ]))
  const flash = collection ? tier.flash ?? undefined : undefined

  const rows: Array<[string, string]> = [
    [text.powerLabel, tier.power.toLocaleString('zh-CN')],
    ...(flash ? [[text.collectionPower, flash.power.toLocaleString('zh-CN')] as [string, string]] : []),
    ...tier.attributes.map(([id, value]): [string, string] => [attributeLabel(id), attributeValue(value)]),
  ]
  const costs = tier.cost.map(([id, count]): [string, string] => [
    id === card.id ? text.sameCard : content.wiki.talents.item.replace('{id}', String(id)),
    `×${count}`,
  ])
  const effects = (ids: number[]) => ids.map((id) => [id, effectById.get(id) || text.effectId.replace('{id}', String(id))] as const)
  const ownEffects = effects(tier.specialEffects)
  const flashEffects = effects(flash?.specialEffects ?? [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-base font-bold leading-tight">{localizedText(card.name)}</h3>
          <div className="flex gap-1.5">
            <Badge>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: QUALITY_COLORS[card.quality] }} />
              {qualityLabel(card.quality)}
            </Badge>
            <Badge>{partLabel(card.part)}</Badge>
          </div>
        </div>
        {card.tiers.length > 1 ? (
          <div className="ml-auto shrink-0">
            <LevelStepper
              index={at}
              last={last}
              current={at + 1}
              top={card.tiers.length}
              onChange={onIndex}
              unit={text.tierUnit}
              labels={{ group: text.tierPicker, down: text.tierDown, up: text.tierUp }}
            />
          </div>
        ) : null}
      </div>

      <ValueList label={text.attributesTitle} rows={rows} />

      {at < last && (tier.level > 0 || costs.length > 0) ? (
        <div className="flex flex-col gap-1 border-t border-dashed border-border pt-2.5">
          <h4 className="text-xs font-semibold text-muted-foreground">{text.nextTier}</h4>
          <ul className="flex flex-col gap-0.5 text-sm">
            {tier.level > 0 ? (
              <li className="flex items-baseline justify-between gap-2">
                <span className="text-foreground/80">{text.requiredLevel.replace(' {level}', '')}</span>
                <span className="font-semibold tabular-nums">Lv {tier.level}</span>
              </li>
            ) : null}
          </ul>
          <CostList label={text.cost} rows={costs} />
        </div>
      ) : null}

      <EffectList label={text.specialEffects} effects={ownEffects} />
      <EffectList label={text.collectionEffects} effects={flashEffects} />
    </div>
  )
}

function EffectList({ label, effects }: { label: string; effects: ReadonlyArray<readonly [number, string]> }) {
  if (effects.length === 0) return null
  return (
    <section className="flex flex-col gap-1 border-t border-dashed border-border pt-2.5">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      {effects.map(([id, description]) => (
        <p key={id} className="whitespace-pre-line text-sm leading-relaxed text-foreground/80"><GameText value={description} /></p>
      ))}
    </section>
  )
}

function partLabel(part: number): string {
  return (text.parts as Record<string, string>)[String(part)] ?? text.part.replace('{part}', String(part))
}

function qualityLabel(quality: number): string {
  return (text.qualityNames as Record<string, string>)[String(quality)] ?? text.quality.replace('{quality}', String(quality))
}

function attributeName(attribute: CardAttribute): string {
  return localizedText(attribute.name) || attribute.key
}

// Shown as stored: the scale of the percentage attributes is not confirmed yet.
function attributeValue(value: number): string {
  return `+${value.toLocaleString('zh-CN')}`
}
