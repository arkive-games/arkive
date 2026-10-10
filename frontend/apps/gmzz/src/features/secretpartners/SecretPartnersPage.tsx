import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '@/components/ContentPage'
import { Chip, FilterBar, FilterRow, SearchField } from '@/components/Filters'
import { useRemoteData } from '@/lib/useRemoteData'
import { clampPartnerLevel, filterPartners, formatPartnerAttribute, loadSecretPartners, PARTNER_QUALITY, partnerLevelBounds, plainText, portraitUrl, type SecretPartner } from './data'

export default function SecretPartnersPage() {
  const { t } = useTranslation()
  const remote = useRemoteData(loadSecretPartners)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [quality, setQuality] = useState(0)
  const [attribute, setAttribute] = useState('')
  const [level, setLevel] = useState(1)
  const records = useMemo(() => remote.data ?? [], [remote.data])
  const categories = useMemo(() => [...new Set(records.map((record) => record.category))].filter(Boolean).sort(), [records])
  const qualities = useMemo(() => [...new Set(records.map((record) => record.quality))].sort((a, b) => b - a), [records])
  const attributes = useMemo(() => [...new Map(records.flatMap((record) => (record.attributes ?? []).map((entry) => [entry.key, entry.name] as const)))], [records])
  const bounds = useMemo(() => partnerLevelBounds(records), [records])
  const selectedLevel = clampPartnerLevel(level, bounds.max)
  const shown = useMemo(() => filterPartners(records, query, category, quality, attribute), [records, query, category, quality, attribute])
  useEffect(() => { document.title = `${t('secretpartners.title')} - ${t('siteTitle')}` }, [t])

  return (
    <ContentPage active="/secretpartners" title={t('secretpartners.title')} heading wide>
      {remote.error ? <div role="alert" className="text-sm">
        <p>{t('secretpartners.error')}</p>
        <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-primary" onClick={() => window.location.reload()}>{t('secretpartners.reload')}</button>
      </div> : remote.loading ? <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p> : <>
        <div className="mb-3 flex flex-col gap-2">
          <FilterRow label={t('secretpartners.quality')}>
            <Chip active={!quality} onClick={() => setQuality(0)}>{t('secretpartners.all')}</Chip>
            {qualities.map((value) => <Chip key={value} active={quality === value} onClick={() => setQuality(value)}>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${PARTNER_QUALITY[value]?.color ?? 'bg-muted'}`} />{t(`secretpartners.quality${value}`)}</span>
            </Chip>)}
          </FilterRow>
          <FilterRow label={t('secretpartners.attributes')}>
            <Chip active={!attribute} onClick={() => setAttribute('')}>{t('secretpartners.all')}</Chip>
            {attributes.map(([key, name]) => <Chip key={key} active={attribute === key} onClick={() => setAttribute(key)}>{name}</Chip>)}
          </FilterRow>
          <FilterRow label={t('secretpartners.category')}>
            <Chip active={!category} onClick={() => setCategory('')}>{t('secretpartners.all')}</Chip>
            {categories.map((value) => <Chip key={value} active={category === value} onClick={() => setCategory(value)}>{value}</Chip>)}
          </FilterRow>
        </div>
        <FilterBar count={t('secretpartners.count', { count: shown.length })}>
          <SearchField value={query} onChange={setQuery} placeholder={t('secretpartners.search')} />
          {attributes.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label htmlFor="partner-level" className="text-sm text-muted-foreground">{t('secretpartners.level')}</label>
            <input aria-label={t('secretpartners.levelSlider')} type="range" min={bounds.min} max={bounds.max} step={1} value={selectedLevel} onChange={(event) => setLevel(Number(event.target.value))} className="w-24 accent-primary" />
            <input id="partner-level" type="number" min={bounds.min} max={bounds.max} step={1} value={selectedLevel} onChange={(event) => setLevel(clampPartnerLevel(Number(event.target.value), bounds.max))} className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm tabular-nums" />
          </div>}
          {(query || category || quality || attribute) && <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setQuery(''); setCategory(''); setQuality(0); setAttribute('') }}>{t('secretpartners.reset')}</button>}
        </FilterBar>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((record) => <PartnerCard key={record.id} record={record} level={selectedLevel} />)}
        </div>
        {!shown.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('secretpartners.empty')}</p>}
      </>}
    </ContentPage>
  )
}

function PartnerCard({ record, level }: { record: SecretPartner; level: number }) {
  const { t } = useTranslation()
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3" data-partner-id={record.id}>
      <header className="flex items-center gap-3">
        <div data-quality={record.quality} className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 bg-muted ${PARTNER_QUALITY[record.quality]?.border ?? 'border-border'}`}>
          {record.portrait && !imageFailed
            ? <img src={portraitUrl(record.portrait)} alt={record.name} loading="lazy" className="size-full object-contain" onError={() => setImageFailed(true)} />
            : <span className="px-1 text-center text-xs text-muted-foreground">{t('secretpartners.missingImage')}</span>}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{record.name}</h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-2.5 rounded-sm ${PARTNER_QUALITY[record.quality]?.color ?? 'bg-muted'}`} />{t(`secretpartners.quality${record.quality}`)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{record.category}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plainText(record.description)}</p>
        </div>
      </header>
      {(record.attributes?.length ?? 0) > 0 && <section className="border-t border-border pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="text-sm font-semibold">{t('secretpartners.attributes')}</h3>
          <span className="text-xs text-muted-foreground">{t('secretpartners.atLevel', { level })}</span>
        </div>
        <dl className="mt-2 space-y-1 text-sm">
          {record.attributes.map((entry) => <div key={entry.key} className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{entry.name}</dt>
            <dd className="shrink-0 font-medium tabular-nums" data-attribute={entry.key}>{formatPartnerAttribute(entry, level)}</dd>
          </div>)}
        </dl>
      </section>}
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
