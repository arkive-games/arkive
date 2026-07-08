import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import { loadQuests, loadItems, type QuestsBundle, type ItemsBundle } from '../../lib/catalog'
import { toGameCoords } from '../../lib/coords'
import {
  CatalogSection,
  InfoRows,
  StatRow,
  CatalogPageLoading,
  CatalogNotFound,
  CatalogDataProvider,
  ItemLink,
} from '../catalog/components'
import { questTypeLabel } from './labels'

interface Bundles {
  quests: QuestsBundle
  items: ItemsBundle
}

export default function QuestDetailPage() {
  const { id } = useParams({ from: '/quests/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadQuests(lng), loadItems(lng)])
      .then(([quests, items]) => {
        if (!cancelled) setB({ quests, items })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b) {
    body = <CatalogPageLoading />
  } else {
    const quest = b.quests.byId.get(id)
    if (!quest) {
      body = (
        <CatalogNotFound
          message={t('quest.notFound', { id })}
          to="/quests"
          backLabel={t('quest.backToList')}
        />
      )
    } else {
      const text = b.quests.text[id]
      const iname = (iid: string) => b.items.text[iid]?.name ?? iid
      const g = quest.location ? toGameCoords(quest.location.map, quest.location.x, quest.location.y) : null

      body = (
        <div className="space-y-6">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{questTypeLabel(quest.type, t)}</div>
            <h1 className="text-3xl font-bold">{text?.title ?? quest.id}</h1>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{quest.id}</div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6 md:order-1">
              {text?.description ? (
                <CatalogSection title={t('quest.section.brief')}>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{text.description}</p>
                </CatalogSection>
              ) : null}

              {quest.rewardItems?.length ? (
                <CatalogSection title={t('quest.section.rewards')}>
                  <div className="flex flex-wrap gap-1.5">
                    {quest.rewardItems.map((r) => (
                      <span key={r.item} className="inline-flex items-center gap-1">
                        <ItemLink id={r.item} name={iname(r.item)} icon={b.items.byId.get(r.item)?.icon} />
                        <span className="text-xs tabular-nums text-muted-foreground">×{r.count}</span>
                      </span>
                    ))}
                  </div>
                </CatalogSection>
              ) : null}

              {quest.nextQuests?.length ? (
                <CatalogSection title={t('quest.section.next')}>
                  <div className="flex flex-wrap gap-1.5">
                    {quest.nextQuests.map((qid) => (
                      <Link
                        key={qid}
                        to="/quests/$id"
                        params={{ id: qid }}
                        className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                      >
                        {b.quests.text[qid]?.title ?? qid}
                      </Link>
                    ))}
                  </div>
                </CatalogSection>
              ) : null}
            </div>

            <div className="space-y-6 md:order-2">
              <CatalogSection title={t('quest.section.info')}>
                <InfoRows>
                  <StatRow label={t('quest.type.label')} value={questTypeLabel(quest.type, t)} />
                  {quest.rewardExp ? <StatRow label={t('quest.exp')} value={quest.rewardExp} /> : null}
                  {g ? (
                    <StatRow
                      label={t('quest.location')}
                      value={`(${Math.round(g.x)}, ${Math.round(g.y)})`}
                    />
                  ) : null}
                </InfoRows>
              </CatalogSection>
            </div>
          </div>

          <Link to="/quests" className="inline-block text-sm text-primary hover:underline">
            {t('quest.backToList')}
          </Link>
        </div>
      )
    }
  }

  return (
    <ContentPage active="/quests" title={t('quest.title')} maxWidth="max-w-3xl">
      <CatalogDataProvider items={b?.items}>{body}</CatalogDataProvider>
    </ContentPage>
  )
}
