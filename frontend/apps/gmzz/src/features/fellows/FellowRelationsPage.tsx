import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
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
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    document.title = `${t('fellows.relationsTitle')} - ${t('siteTitle')}`
  }, [t])

  const fellowsById = useMemo(
    () => new Map((fellows.data ?? []).map((fellow) => [fellow.id, fellow])),
    [fellows.data],
  )
  const effectsById = useMemo(
    () => new Map((effects.data ?? []).map((effect) => [effect.id, effect])),
    [effects.data],
  )
  const all = useMemo(() => relations.data ?? [], [relations.data])

  if (relations.error || fellows.error || effects.error) {
    return (
      <ContentPage active="/fellows" title={t('fellows.relationsTitle')} heading wide>
        <p className="text-sm text-muted-foreground">{t('fellows.loadError')}</p>
      </ContentPage>
    )
  }
  if (relations.loading || fellows.loading || effects.loading) {
    return (
      <ContentPage active="/fellows" title={t('fellows.relationsTitle')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/fellows" title={t('fellows.relationsTitle')} heading wide>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('fellows.relationsDescription', { count: all.length })}
      </p>

      <div className="space-y-3">
        {all.map((relation) => (
          <RelationCard
            key={relation.id}
            relation={relation}
            fellowsById={fellowsById}
            effectsById={effectsById}
            open={openId === relation.id}
            onToggle={() => setOpenId(openId === relation.id ? null : relation.id)}
          />
        ))}
      </div>
    </ContentPage>
  )
}

function RelationCard({
  relation,
  fellowsById,
  effectsById,
  open,
  onToggle,
}: {
  relation: FellowRelation
  fellowsById: Map<number, Fellow>
  effectsById: Map<number, RelationEffect>
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">{relation.name}</h2>
        {relation.isOriginal ? (
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {t('fellows.original')}
          </span>
        ) : null}
      </header>

      {/* Members carry their own effect: the relation does not have one shared
          effect, and an id of 0 (null here) means story only. */}
      <ul className="mt-3 flex flex-wrap gap-3">
        {relation.members.map((member) => {
          const fellow = fellowsById.get(member.fellowId)
          const effect = member.effectId ? effectsById.get(member.effectId) : undefined
          return (
            <li key={member.fellowId} className="flex items-center gap-2">
              {fellow ? (
                <img
                  src={fellowPortraitUrl(fellow.portrait)}
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded border border-border/70 bg-background/40 object-cover"
                />
              ) : null}
              <div>
                <p className="text-sm font-medium">{fellow?.name ?? member.fellowId}</p>
                <p className="text-xs text-muted-foreground">
                  {effect ? effect.summary : t('fellows.storyOnly')}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      {open ? (
        <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
          {relation.members.map((member) => {
            const effect = member.effectId ? effectsById.get(member.effectId) : undefined
            if (!effect) return null
            const fellow = fellowsById.get(member.fellowId)
            return (
              <section key={member.fellowId}>
                <h3 className="text-sm font-semibold">
                  {fellow?.name ?? member.fellowId}
                  <span className="ml-2 font-normal text-muted-foreground">{effect.summary}</span>
                </h3>
                <ol className="mt-1 space-y-1">
                  {effect.tiers.map((tier) => (
                    <li key={tier.grade} className="flex gap-2 text-sm">
                      {/* The label comes from RelationRarityData, not from the
                          description's own 【…】 prefix, which is stripped. */}
                      <span className="shrink-0 text-muted-foreground">{tier.gradeName}</span>
                      <span className="text-muted-foreground">{plainText(tier.description)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}

          {relation.story ? (
            <section>
              <h3 className="text-sm font-semibold">{t('fellows.story')}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {plainText(relation.story)}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 text-sm font-medium text-primary hover:underline"
      >
        {open ? t('fellows.collapse') : t('fellows.expandRelation')}
      </button>
    </article>
  )
}
