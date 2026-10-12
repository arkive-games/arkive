import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '@gamemap/ui'

import { ContentPage } from '@/components/ContentPage'
import {
  attributeMap,
  autoChessItemIconUrl,
  formatAttributeValue,
  filterChessItems,
  loadAutoChessAttributes,
  loadAutoChessItems,
  plainText,
} from '@/features/autochess/data'
import { Chip, FilterBar, FilterRow, SearchField } from '@/components/Filters'
import { useRemoteData } from '@/lib/useRemoteData'
import { ITEM_QUALITY } from './quality'
import { qualityPlateUrl } from '@/lib/urls'

/**
 * The client's `UseType`. The split is its own; only the names here are ours,
 * and they come from what the rows plainly are — 记录仪 and 重铸器 are tools, the
 * 宝匣 rows open into a choice. See `tools/apps/gmzz/autochess.py`.
 */
const USE_TYPES = [1, 3, 2, 4] as const

export default function AutoChessItemsPage() {
  const { t } = useTranslation()
  const items = useRemoteData(loadAutoChessItems)
  const attributes = useRemoteData(loadAutoChessAttributes)
  const [useType, setUseType] = useState(0)
  const [typeName, setTypeName] = useState('')
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState(0)

  useDocumentTitle(`${t('autochess.items.title')} - ${t('siteTitle')}`)

  const attrs = useMemo(() => attributeMap(attributes.data ?? []), [attributes.data])
  // Memoised so the filters below key on a stable identity — see the note in
  // AutoChessPiecesPage.
  const all = useMemo(() => items.data ?? [], [items.data])

  const typeNames = useMemo(
    () => [...new Set(all.filter((item) => item.typeName).map((item) => item.typeName))],
    [all],
  )

  const rarities = useMemo(() => [...new Set(all.map((item) => item.rarity))].sort((a, b) => b - a), [all])
  const filtered = useMemo(() => filterChessItems(all, query, useType, typeName, rarity), [all, useType, typeName, query, rarity])

  if (items.error || attributes.error) {
    return (
      <ContentPage active="/autochess/items" title={t('autochess.items.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      </ContentPage>
    )
  }
  if (items.loading || attributes.loading) {
    return (
      <ContentPage active="/autochess/items" title={t('autochess.items.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/autochess/items" title={t('autochess.items.title')} heading wide resultsKey={JSON.stringify([query, rarity, useType, typeName])} filtersActive={Boolean(query || rarity || useType || typeName)} toolbar={<>
      <div className="mb-3 flex flex-col gap-2">
        <FilterRow label={t('autochess.items.qualityFilter')}>
          <Chip active={!rarity} onClick={() => setRarity(0)}>{t('autochess.all')}</Chip>
          {rarities.map((value) => <Chip key={value} active={rarity === value} onClick={() => setRarity(value)}>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-2.5 rounded-sm ${ITEM_QUALITY[value]?.color ?? 'bg-muted'}`} />{t(`autochess.items.quality${value}`)}</span>
          </Chip>)}
        </FilterRow>
        <FilterRow label={t('autochess.items.kindFilter')}>
          <Chip active={useType === 0} onClick={() => setUseType(0)}>{t('autochess.all')}</Chip>
          {USE_TYPES.map((value) => (
            <Chip key={value} active={useType === value} onClick={() => setUseType(value)}>
              {t(`autochess.items.useType.${value}`)}
              <span className="ml-1 text-xs opacity-70">
                {all.filter((item) => item.useType === value).length}
              </span>
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label={t('autochess.items.typeFilter')}>
          <Chip active={typeName === ''} onClick={() => setTypeName('')}>{t('autochess.all')}</Chip>
          {typeNames.map((value) => (
            <Chip key={value} active={typeName === value} onClick={() => setTypeName(value)}>
              {value}
            </Chip>
          ))}
        </FilterRow>
      </div>
      <FilterBar count={t('autochess.items.resultCount', { count: filtered.length })}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('autochess.items.searchPlaceholder')}
        />
        {(query || rarity || useType || typeName) ? <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setQuery(''); setRarity(0); setUseType(0); setTypeName('') }}>{t('autochess.clearFilters')}</button> : null}
      </FilterBar>
      </>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <article
            key={item.id}
            data-item-id={item.id} data-item-quality={item.rarity}
            className={`rounded-md border bg-card p-3 ${ITEM_QUALITY[item.rarity]?.border ?? 'border-border'}`}
          >
            <header className="flex items-start gap-2.5">
              {/* Only when there is art. 30 of the 107 rows have none — the 18
                  共鸣徽章 and 12 newer items whose images live in containers we
                  cannot mount — and an empty frame reads as a failed load. */}
              {item.icon ? (
                <img
                  src={autoChessItemIconUrl(item.icon)}
                  alt=""
                  loading="lazy"
                  className={`size-10 shrink-0 rounded border-2 bg-cover bg-center object-contain ${ITEM_QUALITY[item.rarity]?.border ?? 'border-border'}`}
                  style={{ backgroundImage: `url("${qualityPlateUrl(item.rarity)}")` }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="font-semibold">{item.name}</h2>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-2 rounded-sm ${ITEM_QUALITY[item.rarity]?.color ?? 'bg-muted'}`} />{t(`autochess.items.quality${item.rarity}`)}</span>
                  {item.typeName ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {item.typeName}
                    </span>
                  ) : null}
                </div>
                {item.brief ? (
                  <p className="mt-0.5 text-sm font-medium">{plainText(item.brief)}</p>
                ) : null}
              </div>
            </header>

            <p className="mt-1.5 text-sm text-muted-foreground">{plainText(item.description)}</p>

            {item.attributes.length ? (
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {item.attributes.map((entry) => {
                  const attribute = attrs.get(entry.attributeId)
                  if (!attribute) return null
                  return (
                    <div key={entry.attributeId} className="flex gap-1.5">
                      <dt className="text-muted-foreground">{attribute.name}</dt>
                      <dd className="font-medium tabular-nums">
                        +{formatAttributeValue(entry.value, attribute.format)}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            ) : null}
          </article>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('autochess.empty')}</p>
      ) : null}
    </ContentPage>
  )
}
