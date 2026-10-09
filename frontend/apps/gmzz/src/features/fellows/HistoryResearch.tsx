import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatResearchAttribute, loadHistoryResearch } from './data'
import { useRemoteData } from '../../lib/useRemoteData'

export function HistoryResearch() {
  const { t, i18n } = useTranslation()
  const research = useRemoteData(loadHistoryResearch)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const ranks = research.data ?? []
  const selected = ranks.find((rank) => rank.id === selectedId) ?? ranks[0]

  return (
    <section className="mt-8 border-t border-border pt-5" aria-labelledby="history-research-title">
      <h2 id="history-research-title" className="text-lg font-semibold">{t('fellows.researchTitle')}</h2>
      {research.error ? <p role="alert" className="mt-2 text-sm text-muted-foreground">{t('fellows.researchLoadError')}</p> : null}
      {research.loading ? <p role="status" className="mt-2 text-sm text-muted-foreground">{t('loading')}</p> : null}
      {!research.loading && !research.error && !selected ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('fellows.researchEmpty')}</p>
      ) : null}
      {selected ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <label htmlFor="history-research-rank" className="text-muted-foreground">{t('fellows.researchRank')}</label>
              <select
                id="history-research-rank"
                value={selected.id}
                onChange={(event) => setSelectedId(Number(event.target.value))}
                className="min-h-11 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {ranks.map((rank) => <option key={rank.id} value={rank.id}>{rank.rank}-{rank.subRank} · {rank.name}</option>)}
              </select>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-muted-foreground">{t('fellows.researchScore')}</dt><dd className="tabular-nums">{selected.score.toLocaleString(i18n.language)}</dd></div>
              <div><dt className="text-muted-foreground">{t('fellows.researchRating')}</dt><dd className="tabular-nums">{selected.mark.toLocaleString(i18n.language)}</dd></div>
            </dl>
          </div>
          <h3 className="mt-4 text-sm font-semibold">{t('fellows.researchAttributes')}</h3>
          <dl className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {selected.attributes.map((attribute) => (
              <div key={attribute.key} className="flex min-w-0 justify-between gap-3 border-b border-border/60 py-2 text-sm">
                <dt className="min-w-0 break-words text-muted-foreground">{attribute.name}</dt>
                <dd className="shrink-0 tabular-nums">{formatResearchAttribute(attribute, i18n.language)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  )
}
