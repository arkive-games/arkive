import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemory } from '@gamemap/state-memory'
import { IconCheck, IconLock, IconRotateClockwise } from '@tabler/icons-react'
import { useDocumentTitle, FilterChip, FilterBar, FilterRow, SearchInput } from '@gamemap/ui'
import { ContentPage } from '@/components/ContentPage'
import { useRemoteData } from '@/lib/useRemoteData'
import { clampPartnerLevel, filterPartners, formatPartnerAttribute, loadSecretPartners, PARTNER_QUALITY, partnerLevelBounds, plainText, portraitUrl, type SecretPartner } from './data'
import { partnerLevel } from './memory'

export default function SecretPartnersPage() {
  const { t } = useTranslation()
  const remote = useRemoteData(loadSecretPartners)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [quality, setQuality] = useState(0)
  const [attribute, setAttribute] = useState('')
  const records = useMemo(() => remote.data ?? [], [remote.data])
  const categories = useMemo(() => [...new Set(records.map((record) => record.category))].filter(Boolean).sort(), [records])
  const qualities = useMemo(() => [...new Set(records.map((record) => record.quality))].sort((a, b) => b - a), [records])
  const attributes = useMemo(() => [...new Map(records.flatMap((record) => (record.attributes ?? []).map((entry) => [entry.key, entry.name] as const)))], [records])
  const shown = useMemo(() => filterPartners(records, query, category, quality, attribute), [records, query, category, quality, attribute])
  useDocumentTitle(`${t('secretpartners.title')} - ${t('siteTitle')}`)

  const toolbar = <>
        <div className="mb-3 flex flex-col gap-2">
          <FilterRow label={t('secretpartners.quality')}>
            <FilterChip active={!quality} onClick={() => setQuality(0)}>{t('secretpartners.all')}</FilterChip>
            {qualities.map((value) => <FilterChip key={value} active={quality === value} onClick={() => setQuality(value)}>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${PARTNER_QUALITY[value]?.color ?? 'bg-muted'}`} />{t(`secretpartners.quality${value}`)}</span>
            </FilterChip>)}
          </FilterRow>
          <FilterRow label={t('secretpartners.attributes')}>
            <FilterChip active={!attribute} onClick={() => setAttribute('')}>{t('secretpartners.all')}</FilterChip>
            {attributes.map(([key, name]) => <FilterChip key={key} active={attribute === key} onClick={() => setAttribute(key)}>{name}</FilterChip>)}
          </FilterRow>
          <FilterRow label={t('secretpartners.category')}>
            <FilterChip active={!category} onClick={() => setCategory('')}>{t('secretpartners.all')}</FilterChip>
            {categories.map((value) => <FilterChip key={value} active={category === value} onClick={() => setCategory(value)}>{value}</FilterChip>)}
          </FilterRow>
        </div>
        <FilterBar count={t('secretpartners.count', { count: shown.length })}>
          <SearchInput size="sm" className="min-w-48 flex-1 md:max-w-xs" value={query} onChange={setQuery} placeholder={t('secretpartners.search')} />
          {(query || category || quality || attribute) && <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setQuery(''); setCategory(''); setQuality(0); setAttribute('') }}>{t('secretpartners.reset')}</button>}
        </FilterBar>
  </>

  return (
    <ContentPage active="/secretpartners" title={t('secretpartners.title')} heading wide resultsKey={JSON.stringify([query, category, quality, attribute])} filtersActive={Boolean(query || category || quality || attribute)} toolbar={remote.error || remote.loading ? undefined : toolbar}>
      {remote.error ? <div role="alert" className="text-sm">
        <p>{t('secretpartners.error')}</p>
        <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-primary" onClick={() => window.location.reload()}>{t('secretpartners.reload')}</button>
      </div> : remote.loading ? <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p> : <>
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
  const [storedLevel, setLevel, resetLevel] = useMemory(partnerLevel.at({ partner: String(record.id) }), { debounceMs: 200 })
  const bounds = partnerLevelBounds([record])
  const maximum = record.attributes?.length ? bounds.max : Math.max(1, ...record.upgrades.map((upgrade) => upgrade.requiredStage))
  const level = clampPartnerLevel(storedLevel, maximum)
  const levelId = `partner-level-${record.id}`
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
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4rem_2rem] items-center gap-2 border-t border-border pt-2">
        <label htmlFor={levelId} className="col-span-3 text-sm text-muted-foreground">{t('secretpartners.level')}</label>
        <input aria-label={t('secretpartners.levelSliderFor', { name: record.name })} type="range" min={bounds.min} max={maximum} step={1} value={level} onChange={(event) => setLevel(clampPartnerLevel(Number(event.target.value), maximum))} className="min-w-0 w-full accent-primary" />
        <input id={levelId} aria-label={t('secretpartners.levelFor', { name: record.name })} type="number" min={bounds.min} max={maximum} step={1} value={level} onChange={(event) => setLevel(clampPartnerLevel(Number(event.target.value), maximum))} className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums" />
        <button type="button" onClick={resetLevel} disabled={level === 1} aria-label={t('secretpartners.resetLevel')} title={t('secretpartners.resetLevel')} className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"><IconRotateClockwise aria-hidden="true" className="size-4" /></button>
      </div>
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
      <section className="mt-auto border-t border-border pt-2">
        <h3 className="text-sm font-semibold">{t('secretpartners.upgrades')}</h3>
        <ol className="mt-2 space-y-2">
          {record.upgrades.map((upgrade) => {
            const active = level >= upgrade.requiredStage
            return <li key={upgrade.tier} data-upgrade-tier={upgrade.tier} data-active={active} className={`border-l-2 py-1 pl-3 ${active ? 'border-primary bg-[color:var(--arkive-filter-active)]' : 'border-border text-muted-foreground'}`}>
              <p className="flex flex-wrap items-center justify-between gap-1 text-xs font-medium">
                <span>{t('secretpartners.tier', { tier: upgrade.tier, stage: upgrade.requiredStage })}</span>
                <span className={`inline-flex items-center gap-1 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {active ? <IconCheck aria-hidden="true" className="size-3.5" /> : <IconLock aria-hidden="true" className="size-3.5" />}
                  {t(active ? 'secretpartners.activated' : 'secretpartners.locked')}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{plainText(upgrade.description)}</p>
            </li>
          })}
        </ol>
      </section>
    </article>
  )
}
