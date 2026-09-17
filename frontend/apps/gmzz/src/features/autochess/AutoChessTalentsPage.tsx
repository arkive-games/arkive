import { useEffect, useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import { loadAutoChessTalents, plainText } from '@/features/autochess/data'
import { Chip, FilterRow } from '@/features/autochess/Filters'
import { useAutoChess } from '@/features/autochess/useAutoChess'

const RARITY_CLASS: Record<number, string> = {
  1: 'border-border bg-card',
  2: 'border-emerald-400/60 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20',
  3: 'border-sky-400/60 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-950/20',
  4: 'border-violet-400/70 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-950/20',
  5: 'border-amber-400/70 bg-amber-50/45 dark:border-amber-700 dark:bg-amber-950/20',
}

export default function AutoChessTalentsPage() {
  const { t } = useTranslation()
  const talents = useAutoChess(loadAutoChessTalents)
  const [rarity, setRarity] = useState(0)
  const [query, setQuery] = useState('')
  // The client hides some rows from its own handbook; matching that default
  // keeps internal entries off the page unless asked for.
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    document.title = `${t('autochess.talents.title')} - ${t('siteTitle')}`
  }, [t])

  // Memoised so the filters below key on a stable identity — see the note in
  // AutoChessPiecesPage.
  const all = useMemo(() => talents.data ?? [], [talents.data])
  const rarities = useMemo(
    () => [...new Set(all.map((talent) => talent.rarity))].sort((a, b) => a - b),
    [all],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return all.filter((talent) => {
      if (!showHidden && !talent.inHandbook) return false
      if (rarity && talent.rarity !== rarity) return false
      if (!needle) return true
      return `${talent.name} ${talent.description} ${talent.handbookDescription}`
        .toLocaleLowerCase()
        .includes(needle)
    })
  }, [all, rarity, query, showHidden])

  if (talents.error) {
    return (
      <ContentPage active="/autochess" title={t('autochess.talents.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      </ContentPage>
    )
  }
  if (talents.loading) {
    return (
      <ContentPage active="/autochess" title={t('autochess.talents.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  const hidden = all.filter((talent) => !talent.inHandbook).length

  return (
    <ContentPage active="/autochess" title={t('autochess.talents.title')} heading wide>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('autochess.talents.description', { count: all.filter((talent) => talent.inHandbook).length })}
      </p>

      <div className="mb-4 flex flex-col gap-3">
        <FilterRow label={t('autochess.talents.rarityFilter')}>
          <Chip active={rarity === 0} onClick={() => setRarity(0)}>{t('autochess.all')}</Chip>
          {rarities.map((value) => (
            <Chip key={value} active={rarity === value} onClick={() => setRarity(value)}>
              {t('autochess.talents.rarity', { rarity: value })}
            </Chip>
          ))}
        </FilterRow>

        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('autochess.talents.searchPlaceholder')}
            aria-label={t('autochess.talents.searchPlaceholder')}
          />
        </label>

        {hidden ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            {t('autochess.talents.showHidden', { count: hidden })}
          </label>
        ) : null}
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('autochess.talents.resultCount', { count: filtered.length })}
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((talent) => (
          <article
            key={talent.id}
            className={`rounded-lg border p-4 shadow-sm ${RARITY_CLASS[talent.rarity] ?? 'border-border bg-card'}`}
          >
            <header className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-semibold">{talent.name}</h2>
              <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                {t('autochess.talents.rarity', { rarity: talent.rarity })}
              </span>
              {!talent.inHandbook ? (
                <span className="text-xs text-muted-foreground">{t('autochess.talents.hiddenTag')}</span>
              ) : null}
            </header>
            <p className="mt-1 text-sm text-muted-foreground">{plainText(talent.description)}</p>
            {talent.handbookDescription && talent.handbookDescription !== talent.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{plainText(talent.handbookDescription)}</p>
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
