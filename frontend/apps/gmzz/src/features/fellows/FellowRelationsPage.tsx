import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '@gamemap/ui'
import { IconCircle, IconDiamond, IconHexagon, IconPentagon, IconSquare, IconStar, IconGitBranch } from '@tabler/icons-react'

import { ContentPage } from '@/components/ContentPage'
import { TipOn } from '@/features/score/Tip'
import { FellowsTabs } from '@/features/fellows/FellowsTabs'
import { FateTributary } from '@/features/fellows/FateTributary'
import {
  fellowPortraitUrl,
  loadFellowRelations,
  loadFellows,
  loadRelationEffects,
  plainText,
  type Fellow,
  type FellowRelation,
  type RelationEffect,
} from '@/features/fellows/data'
import { useRemoteData } from '@/lib/useRemoteData'

export default function FellowRelationsPage() {
  const { t } = useTranslation()
  const relations = useRemoteData(loadFellowRelations)
  const fellows = useRemoteData(loadFellows)
  const effects = useRemoteData(loadRelationEffects)
  useDocumentTitle(`${t('fellows.sectionTitle')} · ${t('fellows.relationsTitle')} - ${t('siteTitle')}`)

  const fellowsById = useMemo(() => new Map((fellows.data ?? []).map((fellow) => [fellow.id, fellow])), [fellows.data])
  const effectsById = useMemo(() => new Map((effects.data ?? []).map((effect) => [effect.id, effect])), [effects.data])
  const all = relations.data ?? []

  if (relations.error || fellows.error || effects.error) {
    return <ContentPage active="/fellows/relations" title={t('fellows.sectionTitle')} heading wide><p className="text-sm text-muted-foreground">{t('fellows.loadError')}</p></ContentPage>
  }
  if (relations.loading || fellows.loading || effects.loading) {
    return <ContentPage active="/fellows/relations" title={t('fellows.sectionTitle')} heading wide><p className="text-sm text-muted-foreground">{t('loading')}</p></ContentPage>
  }

  return (
    <ContentPage active="/fellows/relations" title={t('fellows.sectionTitle')} heading wide>
      <FellowsTabs current="/fellows/relations" />
      <p className="mb-4 text-sm text-muted-foreground">{t('fellows.relationsDescription', { count: all.length })}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {all.map((relation) => <RelationCard key={relation.id} relation={relation} fellowsById={fellowsById} effectsById={effectsById} />)}
      </div>
      <FateTributary />
    </ContentPage>
  )
}

function RelationCard({ relation, fellowsById, effectsById }: { relation: FellowRelation; fellowsById: Map<number, Fellow>; effectsById: Map<number, RelationEffect> }) {
  const { t } = useTranslation()
  const [grade, setGrade] = useState(0)
  const [storyOpen, setStoryOpen] = useState(false)
  const gradeIcons = [IconCircle, IconSquare, IconDiamond, IconPentagon, IconHexagon, IconStar]
  const grades = useMemo(() => [0, 1, 2, 3, 4, 5], [])
  const selectedResearch = relation.researchRewards?.find((reward) => reward.grade === grade)
  const selectedGradeName = selectedResearch?.gradeName
    ?? relation.members.map((member) => member.effectId ? effectsById.get(member.effectId)?.tiers.find((tier) => tier.grade === grade)?.gradeName : undefined).find(Boolean)

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2"><h2 className="text-base font-semibold">{relation.name}</h2>{relation.isOriginal ? <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t('fellows.original')}</span> : null}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t('fellows.relationHoverHint')}</p>
        </div>
      </header>

      <ul className="mt-3 flex flex-wrap gap-2 border-b border-border/70 pb-3">
        {relation.members.map((member) => {
          const fellow = fellowsById.get(member.fellowId)
          const effect = member.effectId ? effectsById.get(member.effectId) : undefined
          if (!fellow) return <li key={member.fellowId}>{member.fellowId}</li>
          return <li key={member.fellowId}><TipOn title={fellow.name} content={<MemberTooltip fellow={fellow} effect={effect} />}><span className="flex cursor-help items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-1.5 py-1">{fellow.portrait ? <img src={fellowPortraitUrl(fellow.portrait)} alt="" loading="lazy" className="size-7 rounded-full object-cover" /> : <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">?</span>}<span className="max-w-20 truncate text-xs font-medium">{fellow.shortName || fellow.name.slice(0, 2)}</span></span></TipOn></li>
        })}
      </ul>

      <nav aria-label={t('fellows.relationLevels')} className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {grades.map((value) => {
          const label = relation.researchRewards?.find((reward) => reward.grade === value)?.gradeName
            ?? relation.members.map((member) => member.effectId ? effectsById.get(member.effectId)?.tiers.find((tier) => tier.grade === value)?.gradeName : undefined).find(Boolean)
            ?? t('fellows.level', { level: value + 1 })
          const GradeIcon = gradeIcons[value] ?? IconCircle
          return <button key={value} type="button" title={label} aria-label={label} aria-selected={grade === value} onClick={() => setGrade(value)} className={`flex size-9 shrink-0 items-center justify-center rounded-md border ${grade === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}><GradeIcon size={18} stroke={1.8} aria-hidden /></button>
        })}
        {relation.fateEligible ? <TipOn title={t('fellows.fateAvailable')} content={t('fellows.fateAvailableTooltip')}><span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-amber-500/60 text-amber-600"><IconGitBranch size={18} stroke={1.8} aria-hidden /></span></TipOn> : null}
      </nav>

      <div className="mt-3 space-y-3">
        {selectedResearch ? <section className="rounded-lg border border-border/70 bg-background/40 p-2.5"><h3 className="text-xs font-semibold">{t('fellows.researchAtLevel', { level: selectedGradeName ?? selectedResearch.gradeName })}</h3><p className="mt-1 text-sm tabular-nums text-muted-foreground">{t('fellows.researchBonusValue', { value: selectedResearch.value })}</p></section> : null}
        <ul className="space-y-2">
          {relation.members.map((member) => {
            const fellow = fellowsById.get(member.fellowId)
            const effect = member.effectId ? effectsById.get(member.effectId) : undefined
            const tier = effect?.tiers.find((item) => item.grade === grade)
            return <li key={member.fellowId} className="flex gap-2">{fellow?.portrait ? <img src={fellowPortraitUrl(fellow.portrait)} alt="" loading="lazy" className="size-8 shrink-0 rounded-md border border-border/70 object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">?</span>}<div className="min-w-0"><p className="text-sm font-medium">{fellow?.name ?? member.fellowId}</p><p className="text-sm text-muted-foreground">{tier ? plainText(tier.description) : t('fellows.storyOnly')}</p></div></li>
          })}
        </ul>
        {relation.story || relation.awakeStory ? <section className="border-t border-border/70 pt-3"><button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setStoryOpen((open) => !open)}>{storyOpen ? t('fellows.hideStory') : t('fellows.showStory')}</button>{storyOpen ? <><h3 className="sr-only">{t('fellows.story')}</h3>{relation.story ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{plainText(relation.story)}</p> : null}{relation.awakeStory ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{plainText(relation.awakeStory)}</p> : null}</> : null}</section> : null}
      </div>
    </article>
  )
}

function MemberTooltip({ fellow, effect }: { fellow: Fellow; effect?: RelationEffect }) {
  const { t } = useTranslation()
  return <div className="space-y-2"><p className="font-semibold">{fellow.name}</p>{effect ? <><p>{effect.summary}</p><ol className="space-y-1">{effect.tiers.map((tier) => <li key={tier.grade}><span className="mr-1 text-muted-foreground">{tier.gradeName}</span>{plainText(tier.description)}</li>)}</ol></> : <p>{t('fellows.storyOnly')}</p>}</div>
}
