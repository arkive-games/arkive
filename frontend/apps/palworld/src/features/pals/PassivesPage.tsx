import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, fillPassiveDesc, type PalsBundle } from '../../lib/pals'
import { PalPageLoading, PassiveRow } from './components'

export default function PassivesPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const list = useMemo(() => {
    if (!bundle) return []
    // Union of ids that have metadata and/or localized text, so every passive
    // appears even if one source is missing it.
    const ids = new Set<string>()
    for (const p of bundle.passives) ids.add(p.id)
    for (const id of Object.keys(bundle.passiveText)) ids.add(id)
    const rows = [...ids].map((id) => ({
      id,
      name: bundle.passiveText[id]?.name ?? id,
      description: fillPassiveDesc(bundle.passiveText[id]?.description, bundle.passivesById.get(id)),
      rank: bundle.passivesById.get(id)?.rank,
    }))
    const q = query.trim().toLowerCase()
    const filtered = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        )
      : rows
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [bundle, query])

  return (
    <ContentPage active="/passives" title={t('pal.section.passives')} maxWidth="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="passive-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground">
            {t('resultsCount', { count: list.length })}
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border bg-card px-4">
          {list.map((r) => (
            <div key={r.id} data-testid="passive-row">
              <PassiveRow name={r.name} description={r.description} rank={r.rank} />
            </div>
          ))}
        </div>
      )}
    </ContentPage>
  )
}
