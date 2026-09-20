import { useEffect, useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  attributeMap,
  autoChessItemIconUrl,
  formatAttributeValue,
  loadAutoChessAttributes,
  loadAutoChessItems,
  plainText,
} from '@/features/autochess/data'
import { Chip, FilterRow } from '@/features/autochess/Filters'
import { useAutoChess } from '@/features/autochess/useAutoChess'

/**
 * The client's `UseType`. The split is its own; only the names here are ours,
 * and they come from what the rows plainly are — 记录仪 and 重铸器 are tools, the
 * 宝匣 rows open into a choice. See `tools/apps/gmzz/autochess.py`.
 */
const USE_TYPES = [1, 3, 2, 4] as const

const RARITY_CLASS: Record<number, string> = {
  1: 'border-border bg-card',
  2: 'border-emerald-400/60 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20',
  4: 'border-sky-400/60 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-950/20',
  5: 'border-violet-400/70 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-950/20',
  6: 'border-amber-400/70 bg-amber-50/45 dark:border-amber-700 dark:bg-amber-950/20',
}

export default function AutoChessItemsPage() {
  const { t } = useTranslation()
  const items = useAutoChess(loadAutoChessItems)
  const attributes = useAutoChess(loadAutoChessAttributes)
  const [useType, setUseType] = useState(0)
  const [typeName, setTypeName] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = `${t('autochess.items.title')} - ${t('siteTitle')}`
  }, [t])

  const attrs = useMemo(() => attributeMap(attributes.data ?? []), [attributes.data])
  // Memoised so the filters below key on a stable identity — see the note in
  // AutoChessPiecesPage.
  const all = useMemo(() => items.data ?? [], [items.data])

  const typeNames = useMemo(
    () => [...new Set(all.filter((item) => item.typeName).map((item) => item.typeName))],
    [all],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return all.filter((item) => {
      if (useType && item.useType !== useType) return false
      if (typeName && item.typeName !== typeName) return false
      if (!needle) return true
      return `${item.name} ${item.brief} ${item.description}`.toLocaleLowerCase().includes(needle)
    })
  }, [all, useType, typeName, query])

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
    <ContentPage active="/autochess/items" title={t('autochess.items.title')} heading wide>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('autochess.items.description', { count: all.length })}
      </p>

      <div className="mb-4 flex flex-col gap-3">
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

        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('autochess.items.searchPlaceholder')}
            aria-label={t('autochess.items.searchPlaceholder')}
          />
        </label>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('autochess.items.resultCount', { count: filtered.length })}
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.id}
            className={`rounded-lg border p-4 shadow-sm ${RARITY_CLASS[item.rarity] ?? 'border-border bg-card'}`}
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
                  className="size-11 shrink-0 rounded border border-border/70 bg-background/40 object-contain"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="font-semibold">{item.name}</h2>
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
