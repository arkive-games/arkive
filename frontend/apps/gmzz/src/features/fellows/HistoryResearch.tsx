import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { loadHistoryResearch } from './data'
import { HistoryResearchSlider } from './HistoryResearchSlider'
import { useRemoteData } from '../../lib/useRemoteData'

export function HistoryResearch() {
  const { t } = useTranslation()
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
        <div className="mt-3">
          <HistoryResearchSlider ranks={ranks} value={selected.id} onChange={(id) => setSelectedId(id)} testId="history-research" />
        </div>
      ) : null}
    </section>
  )
}
