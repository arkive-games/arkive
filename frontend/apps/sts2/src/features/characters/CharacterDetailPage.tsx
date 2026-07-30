import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { loadBundle, type Bundle } from '../../lib/data'
import { iconUrl } from '../../lib/urls'
import { CardTile, NotFound, PageLoading } from '../cards/components'

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  )
}

export default function CharacterDetailPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { id } = useParams({ from: '/characters/$id' })

  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadBundle(lng)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((err) => { console.error(err); if (!cancelled) setLoadError(t('loadError')) })
    return () => { cancelled = true }
  }, [lng, t])

  const character = bundle?.charactersById.get(id)
  const text = bundle && character ? bundle.characterText[character.id] : undefined
  const name = text?.name ?? id

  // The character's own deck, in the order the list page shows cards.
  const cards = bundle && character?.pool
    ? bundle.cards
        .filter((c) => c.pool === character.pool)
        .sort((a, b) => (bundle.cardText[a.id]?.name ?? a.id).localeCompare(bundle.cardText[b.id]?.name ?? b.id))
    : []

  return (
    <ContentPage active="/characters" title={name} wide>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PageLoading />
      ) : !character ? (
        <NotFound />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {character.icon ? (
              <img src={iconUrl(character.icon)} alt="" className="size-32 shrink-0 object-contain" />
            ) : null}
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-3xl font-bold" style={character.color ? { color: character.color } : undefined}>
                {name}
              </h1>
              {text?.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {text.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('character.startingHp')} value={character.startingHp} accent={character.color} />
            <Stat label={t('character.startingGold')} value={character.startingGold} />
            <Stat label={t('character.maxEnergy')} value={character.maxEnergy} />
            {character.orbSlots > 0 ? (
              <Stat label={t('character.orbSlots')} value={character.orbSlots} />
            ) : character.cardCount ? (
              <Stat label={t('character.cardCount')} value={character.cardCount} />
            ) : null}
          </div>

          {text?.cardsModifierTitle || text?.cardsModifierDescription ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-1 text-sm font-semibold">{text.cardsModifierTitle ?? t('character.cardsModifier')}</h2>
              {text.cardsModifierDescription ? (
                <p className="text-sm text-muted-foreground">{text.cardsModifierDescription}</p>
              ) : null}
            </section>
          ) : null}

          {cards.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                {t('character.viewCards', { name })}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({t('card.count', { count: cards.length })})
                </span>
              </h2>
              <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
                {cards.map((c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    name={bundle.cardText[c.id]?.name ?? c.id}
                    poolColor={character.color}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </ContentPage>
  )
}
