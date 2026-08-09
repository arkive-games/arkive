import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Anvil, BookOpen, Boxes, ChevronDown, FlaskConical, Hammer, Search, Shield, Sparkles, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { defineMemoryRecord, isFiniteNumber, isString, useMemoryState } from '@gamemap/state-memory'
import { ContentPage } from '../../components/ContentPage'
import type { NavKey } from '../../components/TopNav'
import {
  loadVBloodRewards,
  rewardDisplayName,
  type VBloodKnowledgeCatalog,
  type VBloodLocalizedText,
  type VBloodPassiveRecord,
  type VBloodRewardRef,
  type VBloodTechReward,
} from '../../lib/vblood'

type PageKind = 'database' | 'systems'
type SectionKey = 'items' | 'weapons' | 'armor' | 'recipes' | 'spells' | 'passives' | 'buildings' | 'research'
type CatalogRecord = VBloodRewardRef | VBloodTechReward | VBloodPassiveRecord

const DATABASE: { key: SectionKey; icon: LucideIcon }[] = [
  { key: 'items', icon: Boxes },
  { key: 'weapons', icon: Swords },
  { key: 'armor', icon: Shield },
  { key: 'recipes', icon: FlaskConical },
]

const SYSTEMS: { key: SectionKey; icon: LucideIcon }[] = [
  { key: 'spells', icon: Sparkles },
  { key: 'passives', icon: Anvil },
  { key: 'buildings', icon: Hammer },
  { key: 'research', icon: BookOpen },
]

const createSectionRecord = (defaultSection: SectionKey) => defineMemoryRecord({
  id: 'section', namespace: 'vrising', surface: 'knowledge', stateClass: 'device_preference',
  schemaVersion: '1.0.0', defaultValue: () => defaultSection,
  validate: (value: unknown): value is SectionKey =>
    ['items', 'weapons', 'armor', 'recipes', 'spells', 'passives', 'buildings', 'research'].includes(String(value)),
})
const queryRecord = defineMemoryRecord({
  id: 'query', namespace: 'vrising', surface: 'knowledge', stateClass: 'session_context',
  schemaVersion: '1.0.0', defaultValue: () => '', validate: isString,
  retentionMs: 24 * 60 * 60 * 1_000,
})
const revealRecord = defineMemoryRecord({
  id: 'reveal-depth', namespace: 'vrising', surface: 'knowledge', stateClass: 'session_context',
  schemaVersion: '1.0.0', defaultValue: () => 48,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 48,
  retentionMs: 24 * 60 * 60 * 1_000,
})

function recordsFor(catalog: VBloodKnowledgeCatalog, key: SectionKey): CatalogRecord[] | null {
  if (key === 'recipes') return catalog.recipes
  if (key === 'passives') return catalog.passives
  if (key === 'buildings') return catalog.blueprints
  if (key === 'research') return catalog.tech
  return null
}

function Metric({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">{children}</span>
}

function isPassiveRecord(record: CatalogRecord): record is VBloodPassiveRecord {
  return 'description' in record
}

export function localizedText(value: VBloodLocalizedText, language: string): string {
  if (language.startsWith('zh-TW')) return value['zh-TW']
  if (language.startsWith('zh')) return value['zh-CN']
  return value['en-US']
}

export function cleanGameText(value: string, runtimeValue: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, runtimeValue)
    .trim()
}

export function recordMatchesQuery(record: CatalogRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return record.prefabName.toLocaleLowerCase().includes(normalized)
    || rewardDisplayName(record.prefabName).toLocaleLowerCase().includes(normalized)
    || (isPassiveRecord(record) && (
      Object.values(record.name).some((value) => value.toLocaleLowerCase().includes(normalized))
      || Object.values(record.description).some((value) => value.toLocaleLowerCase().includes(normalized))
    ))
}

function RecordCard({ record }: { record: CatalogRecord }) {
  const { t, i18n } = useTranslation()
  if (isPassiveRecord(record)) {
    const name = localizedText(record.name, i18n.resolvedLanguage ?? i18n.language)
    const description = cleanGameText(
      localizedText(record.description, i18n.resolvedLanguage ?? i18n.language),
      t('knowledge.runtimeValueInline'),
    )
    return (
      <details className="group min-w-0 rounded-xl border border-primary/15 bg-card px-3.5 py-3 shadow-sm open:border-primary/35 open:ring-2 open:ring-primary/8">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-bold leading-snug">{name}</span>
            <span className="mt-1 block truncate font-mono text-xs text-muted-foreground" title={record.prefabName}>{record.prefabName}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              <Metric>{t(`knowledge.schools.${record.school}`)}</Metric>
              <Metric>{t('knowledge.tierValue', { tier: record.tier })}</Metric>
            </span>
          </span>
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 border-t border-primary/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('knowledge.effectTitle')}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{description}</p>
          {record.statModifications.length ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">{t('knowledge.verifiedStats')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {record.statModifications.map((value, index) => (
                  <Metric key={`${value.statType}-${index}`}>{t(`knowledge.stats.${value.statType}`)}</Metric>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('knowledge.scriptedEffect')}</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('knowledge.runtimeValueNote')}</p>
        </div>
      </details>
    )
  }
  const tech = 'recipes' in record ? record : null
  return (
    <article className="min-w-0 rounded-xl border border-primary/12 bg-card px-3.5 py-3 shadow-sm">
      <p className="text-sm font-bold leading-snug">{rewardDisplayName(record.prefabName)}</p>
      <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={record.prefabName}>{record.prefabName}</p>
      {tech ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tech.recipes.length ? <Metric>{t('knowledge.recipeLinks', { count: tech.recipes.length })}</Metric> : null}
          {tech.blueprints.length ? <Metric>{t('knowledge.buildingLinks', { count: tech.blueprints.length })}</Metric> : null}
          {tech.passives.length + tech.shapeshifts.length ? (
            <Metric>{t('knowledge.abilityLinks', { count: tech.passives.length + tech.shapeshifts.length })}</Metric>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default function KnowledgePage({ kind }: { kind: PageKind }) {
  const { t } = useTranslation()
  const cards = kind === 'database' ? DATABASE : SYSTEMS
  const active = (kind === 'database' ? '/database' : '/systems') as NavKey
  const defaultSection: SectionKey = kind === 'database' ? 'recipes' : 'passives'
  const [catalog, setCatalog] = useState<VBloodKnowledgeCatalog | null | undefined>(undefined)
  const selectedRecord = useMemo(() => createSectionRecord(defaultSection), [defaultSection])
  const [selected, setSelected] = useMemoryState(selectedRecord, { partition: kind })
  const [query, setQuery] = useMemoryState(queryRecord, { partition: kind, debounceMs: 200 })
  const [visibleCount, setVisibleCount] = useMemoryState(revealRecord, { partition: kind })

  useEffect(() => {
    const available = kind === 'database' ? DATABASE : SYSTEMS
    if (!available.some(({ key }) => key === selected)) setSelected(defaultSection)
  }, [defaultSection, kind, selected, setSelected])

  useEffect(() => {
    let cancelled = false
    loadVBloodRewards()
      .then((payload) => { if (!cancelled) setCatalog(payload.catalog) })
      .catch((error: unknown) => {
        console.error(error)
        if (!cancelled) setCatalog(null)
      })
    return () => { cancelled = true }
  }, [])

  const selectedRecords = catalog ? recordsFor(catalog, selected) : null
  const filtered = useMemo(() => {
    if (!selectedRecords) return []
    return selectedRecords.filter((record) => recordMatchesQuery(record, query))
  }, [query, selectedRecords])

  const chooseSection = (key: SectionKey) => {
    if (!catalog || !recordsFor(catalog, key)) return
    setSelected(key)
    setQuery('')
    setVisibleCount(48)
  }

  return (
    <ContentPage active={active} title={t(`knowledge.${kind}.title`)} heading>
      <div className="mb-5 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-4" />
          </div>
          <div>
            <p className="font-bold">{t('knowledge.verifiedTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('knowledge.verifiedCaption')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, icon: Icon }) => {
          const records = catalog ? recordsFor(catalog, key) : null
          const ready = records !== null
          const isSelected = ready && selected === key
          return (
            <button
              type="button"
              key={key}
              disabled={!ready}
              onClick={() => chooseSection(key)}
              className={`rounded-xl border bg-card p-4 text-left shadow-sm transition ${isSelected ? 'border-primary/55 ring-2 ring-primary/10' : 'border-primary/15'} ${ready ? 'hover:border-primary/40 hover:bg-primary/[0.025]' : 'cursor-default'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                {catalog === undefined ? (
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{t('loading')}</span>
                ) : ready ? (
                  <span className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                    {key === 'passives'
                      ? t('knowledge.viewableCount', { count: records.length })
                      : t('knowledge.verifiedCount', { count: records.length })}
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {t('knowledge.extracting')}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-lg font-bold">{t(`knowledge.sections.${key}.title`)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`knowledge.sections.${key}.caption`)}</p>
              <p className="mt-4 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
                {ready
                  ? t(key === 'passives' ? 'knowledge.openPassiveEffects' : 'knowledge.openRecords')
                  : t('knowledge.schemaReady')}
              </p>
            </button>
          )
        })}
      </div>

      {selectedRecords ? (
        <section className="mt-5 rounded-2xl border border-primary/15 bg-secondary/25 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('knowledge.verifiedRecords')}</p>
              <h2 className="mt-1 text-xl font-bold">{t(`knowledge.sections.${selected}.title`)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(selected === 'passives' ? 'knowledge.passiveSourceCaption' : 'knowledge.sourceCaption')}
              </p>
            </div>
            <label className="relative block w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setVisibleCount(48) }}
                placeholder={t('knowledge.searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-primary/15 bg-card pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/45 focus:ring-2 focus:ring-primary/10"
              />
            </label>
          </div>

          <p className="mt-4 text-xs font-medium text-muted-foreground">
            {t('knowledge.showingRecords', { shown: Math.min(visibleCount, filtered.length), total: filtered.length })}
          </p>
          {filtered.length ? (
            <div className={`mt-3 grid gap-2.5 sm:grid-cols-2 ${selected === 'passives' ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
              {filtered.slice(0, visibleCount).map((record) => <RecordCard key={record.prefabId} record={record} />)}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              {t('knowledge.noResults')}
            </div>
          )}
          {visibleCount < filtered.length ? (
            <button
              type="button"
              onClick={() => setVisibleCount((value) => value + 48)}
              className="mt-4 rounded-lg border border-primary/20 bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5"
            >
              {t('knowledge.showMoreRecords', { count: Math.min(48, filtered.length - visibleCount) })}
            </button>
          ) : null}
        </section>
      ) : null}
    </ContentPage>
  )
}
