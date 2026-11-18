import { useWikiState, useWikiReady, useWikiOptional } from './wikiMemory'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import {
  CatalogFacetGrid,
  CatalogFacetMenu,
  CatalogFacetOption,
  CatalogFacetTrack,
  CatalogSearchInput,
  CatalogSelectedFilters,
  cn,
  toggleValue,
  useCatalogFacetMenus,
} from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction } from './components/SectionNav'
import { GameText } from './components/GameText'
import { LevelStepper } from './components/LevelStepper'
import { Badge, CostList, DetailPanel, ValueList } from './components/Board'
import { useFit, usePointer, useWide } from './components/boardHooks'
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

export function CardWiki() {
  const [data, setData] = useState<WikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  useWikiReady(data !== null || dataError)
  const [filters, setFilters] = useWikiState<CardFilters>('cards.filters', { category: 'ordinary', ...NO_FILTERS })
  const [query, setQuery] = useWikiState('cards.query', '')
  const [searchOpen, setSearchOpen] = useWikiState('cards.search-open', false)
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
  // A selection the new kind of card cannot offer would filter by a chip that is no longer shown.
  const switchCategory = (previous: CardFilters, category: CardCategory): CardFilters => {
    const pool = category === 'collection' ? allCards.filter((card) => collectionIds.has(card.id)) : allCards
    const parts = new Set(pool.map((card) => card.part))
    const qualities = new Set(pool.map((card) => card.quality))
    const carried = new Set(pool.flatMap((card) => card.tiers.flatMap((tier) => tier.attributes.map(([id]) => id))))
    return {
      category,
      parts: previous.parts.filter((part) => parts.has(part)),
      qualities: previous.qualities.filter((quality) => qualities.has(quality)),
      baseAttributes: previous.baseAttributes.filter((id) => carried.has(id)),
      primaryAttributes: previous.primaryAttributes.filter((id) => carried.has(id)),
    }
  }

  const toggle = (key: 'parts' | 'qualities' | 'baseAttributes' | 'primaryAttributes', value: number) => setFilters((previous) => ({
    ...previous,
    [key]: toggleValue(previous[key], value),
  }))

  const facetMenus = useCatalogFacetMenus()
  const attributeLabelById = (id: number) => {
    const attribute = data?.cards.attributes.find((candidate) => candidate.id === id)
    return attribute ? attributeName(attribute) : text.attributeId.replace('{id}', String(id))
  }
  const selectedChoices = [
    ...(filters.category === 'collection' ? [{
      key: 'category-collection',
      label: text.categories.collection,
      onRemove: () => setFilters((previous) => switchCategory(previous, 'ordinary')),
    }] : []),
    ...filters.parts.map((part) => ({
      key: `part-${part}`,
      label: partLabel(part),
      onRemove: () => toggle('parts', part),
      icon: PART_ICONS[part] ? <img src={resourceUrl(PART_ICONS[part])} alt="" className="size-4 object-contain" /> : undefined,
    })),
    ...filters.qualities.map((quality) => ({
      key: `quality-${quality}`,
      label: qualityLabel(quality),
      onRemove: () => toggle('qualities', quality),
      icon: <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: QUALITY_COLORS[quality] }} />,
    })),
    ...filters.baseAttributes.map((id) => ({
      key: `base-attribute-${id}`,
      label: attributeLabelById(id),
      onRemove: () => toggle('baseAttributes', id),
    })),
    ...filters.primaryAttributes.map((id) => ({
      key: `primary-attribute-${id}`,
      label: attributeLabelById(id),
      onRemove: () => toggle('primaryAttributes', id),
    })),
  ]

  return (
    <div className="card-wiki flex flex-col gap-4">
      <HeaderAction>
        <button
          type="button"
          aria-label={text.searchToggle}
          aria-expanded={searchOpen}
          onClick={() => {
            // A folded search box must not keep filtering out of sight.
            if (searchOpen) setQuery('')
            setSearchOpen(!searchOpen)
          }}
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

      <div className="flex flex-col items-start gap-3 lg:flex-row lg:flex-wrap lg:justify-between">
        <CatalogFacetTrack>
          <CatalogFacetMenu {...facetMenus('category')} label={text.filters.tier} count={filters.category === 'collection' ? 1 : 0} testId="ro3-card-filter-category">
            <CatalogFacetGrid>
              {(['ordinary', 'collection'] as const).map((category: CardCategory) => (
                <CatalogFacetOption
                  key={category}
                  active={filters.category === category}
                  onClick={() => setFilters((previous) => switchCategory(previous, category))}
                  testId={`ro3-card-category-${category}`}
                  label={text.categories[category]}
                />
              ))}
            </CatalogFacetGrid>
          </CatalogFacetMenu>
          <CatalogFacetMenu {...facetMenus('parts')} label={text.filters.part} count={filters.parts.length} testId="ro3-card-filter-parts">
            <CatalogFacetGrid>
              <CatalogFacetOption active={filters.parts.length === 0} onClick={() => setFilters((previous) => ({ ...previous, parts: [] }))} label={text.all} testId="ro3-card-part-all" />
              {PARTS.filter((part) => countBy('part', part) > 0).map((part) => (
                <CatalogFacetOption
                  key={part}
                  active={filters.parts.includes(part)}
                  onClick={() => toggle('parts', part)}
                  testId={`ro3-card-part-${part}`}
                  label={partLabel(part)}
                  icon={PART_ICONS[part] ? <img src={resourceUrl(PART_ICONS[part])} alt="" className="size-5 object-contain" /> : undefined}
                />
              ))}
            </CatalogFacetGrid>
          </CatalogFacetMenu>
          <CatalogFacetMenu {...facetMenus('qualities')} label={text.filters.quality} count={filters.qualities.length} testId="ro3-card-filter-qualities">
            <CatalogFacetGrid>
              <CatalogFacetOption active={filters.qualities.length === 0} onClick={() => setFilters((previous) => ({ ...previous, qualities: [] }))} label={text.all} testId="ro3-card-quality-all" />
              {QUALITIES.filter((quality) => countBy('quality', quality) > 0).map((quality) => (
                <CatalogFacetOption
                  key={quality}
                  active={filters.qualities.includes(quality)}
                  onClick={() => toggle('qualities', quality)}
                  testId={`ro3-card-quality-${quality}`}
                  label={qualityLabel(quality)}
                  icon={<span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: QUALITY_COLORS[quality] }} />}
                />
              ))}
            </CatalogFacetGrid>
          </CatalogFacetMenu>
          <CatalogFacetMenu {...facetMenus('attributes')} label={text.filters.attribute} count={filters.baseAttributes.length + filters.primaryAttributes.length} testId="ro3-card-filter-attributes">
            <CatalogFacetGrid>
              <CatalogFacetOption
                active={filters.baseAttributes.length === 0 && filters.primaryAttributes.length === 0}
                onClick={() => setFilters((previous) => ({ ...previous, baseAttributes: [], primaryAttributes: [] }))}
                label={text.all}
                testId="ro3-card-attribute-all"
              />
              {attributes.map((attribute) => {
                const key = attribute.type === BASE_TYPE ? 'baseAttributes' : 'primaryAttributes'
                return (
                  <CatalogFacetOption
                    key={attribute.id}
                    active={filters[key].includes(attribute.id)}
                    onClick={() => toggle(key, attribute.id)}
                    testId={`ro3-card-attribute-${attribute.id}`}
                    label={attributeName(attribute)}
                  />
                )
              })}
            </CatalogFacetGrid>
          </CatalogFacetMenu>
        </CatalogFacetTrack>
        <div className={cn('w-full lg:ml-auto lg:w-[23rem]', searchOpen ? 'block' : 'hidden lg:block')}>
          <CatalogSearchInput inputRef={searchInput} value={query} onChange={event => setQuery(event.target.value)}
            aria-label={text.searchLabel} submitLabel={text.searchLabel} clearLabel={content.search.clear} onClear={() => setQuery('')} placeholder={text.searchPlaceholder} />
        </div>
      </div>

      <CatalogSelectedFilters
        label={text.filters.panelTitle}
        clearLabel={text.filters.clear}
        choices={selectedChoices}
        onClear={() => setFilters({ category: 'ordinary', ...NO_FILTERS })}
      />

      <section aria-label={text.title} className="rounded-lg border border-border bg-card">
        {dataError ? <div className="p-3"><Notice>{content.wiki.dataError}</Notice></div> : !data ? <div className="p-3"><Notice>{content.wiki.loading}</Notice></div> : (
          <CardBoard key={filters.category} cards={cards} data={data} collection={collection} />
        )}
      </section>
    </div>
  )
}

/**
 * The cards as a grid of their own faces, with one panel for the picked card:
 * beside the grid, sticking while it scrolls, from `lg`; below that it opens
 * inside the grid, under the row the card is on.
 */
function CardBoard({ cards, data, collection }: { cards: WikiCard[]; data: WikiData; collection: boolean }) {
  const wide = useWide()
  const [selectedId, setSelectedId] = useWikiOptional<number>(`cards.${collection}.selected`, 'number')
  const [tiers, setTiers] = useWikiState<Record<number, number>>('cards.tiers', {})
  // Phones fit three across, the smallest the game's nameplates still read at.
  const [gridRef, fit] = useFit(wide ? 6.75 : 5.25)
  const columns = Math.max(3, Math.min(fit || 6, 10))
  const selectedIndex = cards.findIndex((card) => card.id === selectedId)
  // Wide screens always have a panel to fill; on phones it opens on a tap and closes on a second.
  const activeIndex = selectedIndex >= 0 ? selectedIndex : wide && cards.length > 0 ? 0 : -1
  const active = activeIndex >= 0 ? cards[activeIndex] : undefined
  const { panelRef, areaRef, pointerRef } = usePointer(`${active?.id}-${wide}-${columns}`)
  const rowEnd = Math.min(cards.length - 1, (Math.floor(activeIndex / columns) + 1) * columns - 1)

  // Escape folds the phone panel away; on wide screens there is always a panel, so it does nothing.
  useEffect(() => {
    if (wide || selectedId === undefined) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(undefined) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [wide, selectedId, setSelectedId])

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
      aria-label={[localizedText(card.name), qualityLabel(card.quality), partLabel(card.part)].join(text.separator)}
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
      <strong style={{ ['--card-name-chars' as string]: Math.max([...name].length, 6) }}>{name}</strong>
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
      .join(text.separator),
  ]))
  const flash = collection ? tier.flash ?? undefined : undefined

  const powers: Array<[string, number]> = [
    [text.powerLabel, tier.power],
    ...(flash ? [[text.collectionPower, flash.power] as [string, number]] : []),
  ]
  const attributes = tier.attributes.map(([id, value]): [string, string] => [attributeLabel(id), attributeValue(value)])
  const needs: Array<[string, string]> = [
    ...(tier.level > 0 ? [[text.requiredLevel.replace(' {level}', ''), `Lv ${tier.level}`] as [string, string]] : []),
    ...tier.cost.map(([id, count]): [string, string] => [
      id === card.id ? text.sameCard : content.wiki.talents.item.replace('{id}', String(id)),
      `×${count}`,
    ]),
  ]
  const effects = (ids: number[]) => ids.map((id) => [id, effectById.get(id) || text.effectId.replace('{id}', String(id))] as const)
  const ownEffects = effects(tier.specialEffects)
  const flashEffects = effects(flash?.specialEffects ?? [])

  // The talent panel's pieces, in one order of weight: the name, the power on
  // the white list card, the attributes on another, then the dashed-off rest.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-base font-bold leading-tight md:text-lg">{localizedText(card.name)}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: QUALITY_COLORS[card.quality] }} />
              {qualityLabel(card.quality)}
            </Badge>
            <Badge>{partLabel(card.part)}</Badge>
          </div>
        </div>
        {card.tiers.length > 1 ? (
          <div className="shrink-0">
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

      {/* Same white card and stage colour as the attribute list, only the number set larger. */}
      <dl className={cn('grid divide-x divide-border rounded-lg bg-card shadow-[0_0_0_1px_var(--border)]', powers.length > 1 && 'grid-cols-2')}>
        {powers.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2 px-3 py-2">
            <dt className="text-sm text-foreground/80">{label}</dt>
            <dd className="text-xl font-bold tabular-nums text-[color:var(--ro3-stage)]">{value.toLocaleString('zh-CN')}</dd>
          </div>
        ))}
      </dl>

      {attributes.length > 0 ? <ValueList label={text.attributesTitle} rows={attributes} /> : null}

      {at < last && needs.length > 0 ? (
        <div className="border-t border-dashed border-border pt-2.5">
          <CostList label={text.nextTier} rows={needs} />
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
