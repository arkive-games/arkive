import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '@/components/ContentPage'
import { FilterBar, SearchField } from '@/components/Filters'
import { useRemoteData } from '@/lib/useRemoteData'
import { filterPartners, loadSecretPartners, plainText, portraitUrl, type SecretPartner } from './data'

export default function SecretPartnersPage() {
  const { t } = useTranslation()
  const remote = useRemoteData(loadSecretPartners)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const records = useMemo(() => remote.data ?? [], [remote.data])
  const categories = useMemo(() => [...new Set(records.map((record) => record.category))].filter(Boolean).sort(), [records])
  const shown = useMemo(() => filterPartners(records, query, category), [records, query, category])
  useEffect(() => { document.title = `${t('secretpartners.title')} - ${t('siteTitle')}` }, [t])

  return (
    <ContentPage active="/secretpartners" title={t('secretpartners.title')} heading wide>
      {remote.error ? <div role="alert" className="text-sm">
        <p>{t('secretpartners.error')}</p>
        <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-primary" onClick={() => window.location.reload()}>{t('secretpartners.reload')}</button>
      </div> : remote.loading ? <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p> : <>
        <FilterBar count={t('secretpartners.count', { count: shown.length })}>
          <SearchField value={query} onChange={setQuery} placeholder={t('secretpartners.search')} />
          <label className="flex items-center gap-2 text-sm">
            {t('secretpartners.category')}
            <select className="h-9 rounded-lg border border-border bg-card px-2" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">{t('secretpartners.all')}</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </FilterBar>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((record) => <PartnerCard key={record.id} record={record} />)}
        </div>
        {!shown.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('secretpartners.empty')}</p>}
      </>}
    </ContentPage>
  )
}

function PartnerCard({ record }: { record: SecretPartner }) {
  const { t } = useTranslation()
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3" data-partner-id={record.id}>
      <header className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {record.portrait && !imageFailed
            ? <img src={portraitUrl(record.portrait)} alt={record.name} loading="lazy" className="size-full object-contain" onError={() => setImageFailed(true)} />
            : <span className="px-1 text-center text-xs text-muted-foreground">{t('secretpartners.missingImage')}</span>}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{record.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{record.category}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plainText(record.description)}</p>
        </div>
      </header>
      <section className="border-t border-border pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="text-base font-semibold">{record.skill.name}</h3>
          {record.skill.cooldown !== null && <span className="text-xs text-muted-foreground">{t('secretpartners.cooldown', { seconds: record.skill.cooldown })}</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{record.skill.tags.join(' / ')}</p>
        <p className="mt-2 whitespace-pre-line text-sm">{plainText(record.skill.description || record.skill.brief)}</p>
        {record.skill.hasFormula && <p className="mt-1 text-xs text-muted-foreground">{t('secretpartners.formula')}</p>}
      </section>
      <details className="mt-auto border-t border-border pt-2">
        <summary className="cursor-pointer py-1 text-sm font-medium text-primary">{t('secretpartners.upgrades')}</summary>
        <ol className="mt-2 space-y-2">
          {record.upgrades.map((upgrade) => <li key={upgrade.tier} className="border-t border-border/60 pt-2">
            <p className="text-xs font-medium text-muted-foreground">{t('secretpartners.tier', { tier: upgrade.tier, stage: upgrade.requiredStage })}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{plainText(upgrade.description)}</p>
          </li>)}
        </ol>
      </details>
    </article>
  )
}
