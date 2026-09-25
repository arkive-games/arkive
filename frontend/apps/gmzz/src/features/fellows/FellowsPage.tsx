import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import { FellowsTabs } from '@/features/fellows/FellowsTabs'
import { Chip, FilterRow } from '@/components/Filters'
import {
  fellowPortraitUrl,
  fellowSkillIconUrl,
  loadAffinityLadders,
  loadFellowRelations,
  loadFellows,
  plainText,
  type AffinityLadder,
  type Fellow,
  type FellowRelation,
} from '@/features/fellows/data'
import { useRemoteData } from '@/lib/useRemoteData'

/** Quality is the roster's own rank; 5 is the highest the client ships. */
const QUALITY_CLASS: Record<number, string> = {
  4: 'border-violet-400/60 bg-violet-50/30 dark:border-violet-800 dark:bg-violet-950/20',
  5: 'border-amber-500/60 bg-amber-50/35 dark:border-amber-800 dark:bg-amber-950/20',
}

/** One of the small chips the game prints under a skill's name. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-border/70 bg-background/50 px-1.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

export default function FellowsPage() {
  const { t } = useTranslation()
  const fellows = useRemoteData(loadFellows)
  const relations = useRemoteData(loadFellowRelations)
  const ladders = useRemoteData(loadAffinityLadders)

  const [quality, setQuality] = useState(0)
  const [label, setLabel] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    document.title = `${t('fellows.sectionTitle')} · ${t('fellows.title')} - ${t('siteTitle')}`
  }, [t])

  const all = useMemo(() => fellows.data ?? [], [fellows.data])
  const relationsById = useMemo(
    () => new Map((relations.data ?? []).map((relation) => [relation.id, relation])),
    [relations.data],
  )
  const laddersByType = useMemo(
    () => new Map((ladders.data ?? []).map((ladder) => [ladder.type, ladder])),
    [ladders.data],
  )

  const qualities = useMemo(
    () => [...new Set(all.map((fellow) => fellow.quality))].sort((a, b) => b - a),
    [all],
  )
  const labels = useMemo(
    () => [...new Set(all.map((fellow) => fellow.label).filter(Boolean))],
    [all],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return all.filter((fellow) => {
      if (quality && fellow.quality !== quality) return false
      if (label && fellow.label !== label) return false
      if (!needle) return true
      return [
        fellow.name,
        fellow.englishName,
        fellow.label,
        fellow.affiliations,
        fellow.skill.name,
        fellow.skill.brief,
        ...fellow.upgrades.map((upgrade) => upgrade.description),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle)
    })
  }, [all, quality, label, query])

  if (fellows.error || relations.error || ladders.error) {
    return (
      <ContentPage active="/fellows" title={t('fellows.sectionTitle')} heading wide>
        <p className="text-sm text-muted-foreground">{t('fellows.loadError')}</p>
      </ContentPage>
    )
  }
  if (fellows.loading || relations.loading || ladders.loading) {
    return (
      <ContentPage active="/fellows" title={t('fellows.sectionTitle')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/fellows" title={t('fellows.sectionTitle')} heading wide>
      <FellowsTabs current="/fellows" />
      <p className="mb-4 text-sm text-muted-foreground">
        {t('fellows.description', { count: all.length })}
      </p>

      <div className="mb-4 flex flex-col gap-3">
        <FilterRow label={t('fellows.qualityFilter')}>
          <Chip active={quality === 0} onClick={() => setQuality(0)}>{t('fellows.all')}</Chip>
          {qualities.map((value) => (
            <Chip key={value} active={quality === value} onClick={() => setQuality(value)}>
              {t('fellows.quality', { quality: value })}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label={t('fellows.labelFilter')}>
          <Chip active={label === ''} onClick={() => setLabel('')}>{t('fellows.all')}</Chip>
          {labels.map((value) => (
            <Chip key={value} active={label === value} onClick={() => setLabel(value)}>
              {value}
            </Chip>
          ))}
        </FilterRow>

        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('fellows.searchPlaceholder')}
            aria-label={t('fellows.searchPlaceholder')}
          />
        </label>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('fellows.resultCount', { count: filtered.length })}
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((fellow) => (
          <FellowCard
            key={fellow.id}
            fellow={fellow}
            relationsById={relationsById}
            ladder={laddersByType.get(fellow.affinityLevelType ?? 1)}
            open={openId === fellow.id}
            onToggle={() => setOpenId(openId === fellow.id ? null : fellow.id)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('fellows.empty')}</p>
      ) : null}
    </ContentPage>
  )
}

function FellowCard({
  fellow,
  relationsById,
  ladder,
  open,
  onToggle,
}: {
  fellow: Fellow
  relationsById: Map<number, FellowRelation>
  ladder: AffinityLadder | undefined
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const levelName = (level: number | null) =>
    ladder?.levels.find((row) => row.level === level)?.name ?? ''

  return (
    <article
      className={`rounded-lg border p-4 shadow-sm ${QUALITY_CLASS[fellow.quality] ?? 'border-border bg-card'}`}
    >
      <header className="flex items-start gap-3">
        <img
          src={fellowPortraitUrl(fellow.portrait)}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded-md border border-border/70 bg-background/40 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold">{fellow.name}</h2>
            <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {t('fellows.quality', { quality: fellow.quality })}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{fellow.affiliations || fellow.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[fellow.sequence, fellow.voiceActor && t('fellows.voiceActor', { name: fellow.voiceActor })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      {/* The game's own panel: the skill with its cooldown and target chips,
          then the 一阶…五阶 rungs its stars unlock. Reading the five rungs as
          five separate skills is the mistake this layout exists to prevent. */}
      <section className="mt-3 border-t border-border/70 pt-2">
        <div className="flex items-start gap-2">
          {fellow.skill.icon ? (
            <img
              src={fellowSkillIconUrl(fellow.skill.icon)}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-md border border-border/70 bg-background/40"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{fellow.skill.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {fellow.skill.cooldown ? (
                <Tag>{t('fellows.cooldown', { seconds: fellow.skill.cooldown })}</Tag>
              ) : null}
              {fellow.skill.castTargets.map((target) => <Tag key={target}>{target}</Tag>)}
              {fellow.skill.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </div>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {plainText(fellow.skill.description) || plainText(fellow.skill.brief)}
        </p>
        {fellow.skill.hasFormula ? (
          <p className="mt-1 text-xs text-muted-foreground/80">{t('fellows.formulaNote')}</p>
        ) : null}
      </section>

      <section className="mt-3 border-t border-border/70 pt-2">
        <h3 className="text-sm font-semibold">{t('fellows.upgrades')}</h3>
        <ol className="mt-1 space-y-1">
          {fellow.upgrades.map((upgrade) => (
            <li key={upgrade.stage} className="flex gap-2 text-sm text-muted-foreground">
              <span className="shrink-0 rounded bg-muted px-1.5 text-xs leading-5 tabular-nums">
                {/* One key per rung rather than an interpolated number: the
                    game writes 一阶…五阶, and "1阶" is not what it says. */}
                {t(`fellows.stage${upgrade.stage}`)}
              </span>
              <span>{plainText(upgrade.description)}</span>
            </li>
          ))}
        </ol>
      </section>

      {fellow.relationIds.length ? (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">{t('fellows.relations')}</span>{' '}
          {fellow.relationIds.map((id) => relationsById.get(id)?.name ?? id).join('、')}
        </p>
      ) : null}

      {open ? (
        <section className="mt-3 border-t border-border/70 pt-2">
          <h3 className="text-sm font-semibold">{t('fellows.stories')}</h3>
          <ol className="mt-1 space-y-2">
            {fellow.stories.map((story, index) => (
              <li key={index}>
                <p className="text-sm font-medium">
                  {story.title}
                  {story.unlockLevel ? (
                    <span className="ml-2 font-normal text-xs text-muted-foreground">
                      {t('fellows.unlockAt', {
                        level: story.unlockLevel,
                        name: levelName(story.unlockLevel),
                      })}
                    </span>
                  ) : null}
                </p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {plainText(story.text)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {fellow.stories.length ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          {open ? t('fellows.hideStories') : t('fellows.showStories', { count: fellow.stories.length })}
        </button>
      ) : null}
    </article>
  )
}
