import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadQuests, type QuestsBundle } from '../../lib/catalog'
import { CatalogPageLoading } from '../catalog/components'
import { questTypeLabel } from './labels'

export default function QuestListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<QuestsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadQuests(lng)
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

  const types = useMemo(() => {
    if (!bundle) return []
    const seen: string[] = []
    for (const q of bundle.quests) if (!seen.includes(q.type)) seen.push(q.type)
    return seen
  }, [bundle])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = query.trim().toLowerCase()
    return bundle.quests
      .filter((quest) => type === 'all' || quest.type === type)
      .filter((quest) => !q || (bundle.text[quest.id]?.title ?? quest.id).toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order)
  }, [bundle, query, type])

  const tabs = ['all', ...types]

  return (
    <ContentPage active="/quests" title={t('quest.title')} heading>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('quest.searchPlaceholder')}
              className="max-w-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setType(tab)}
                  className={
                    'rounded-md px-3 py-1.5 text-sm transition ' +
                    (type === tab
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent')
                  }
                >
                  {tab === 'all' ? t('quest.all') : questTypeLabel(tab, t)}
                </button>
              ))}
            </div>
            {bundle ? (
              <span className="text-sm text-muted-foreground">
                {t('quest.count', { count: list.length })}
              </span>
            ) : null}
          </div>

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : !bundle ? (
            <CatalogPageLoading />
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card">
              {list.map((quest) => (
                <li key={quest.id}>
                  <Link
                    to="/quests/$id"
                    params={{ id: quest.id }}
                    data-testid="quest-row"
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent"
                  >
                    <span
                      className={
                        'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ' +
                        (quest.type === 'Main'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-sky-500/15 text-sky-600 dark:text-sky-400')
                      }
                    >
                      {questTypeLabel(quest.type, t)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {bundle.text[quest.id]?.title ?? quest.id}
                    </span>
                    {quest.rewardExp ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t('quest.expShort', { count: quest.rewardExp })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
    </ContentPage>
  )
}
