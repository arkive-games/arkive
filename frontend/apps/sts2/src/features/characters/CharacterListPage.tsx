import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { loadBundle, type Bundle, type Character } from '../../lib/data'
import { iconUrl } from '../../lib/urls'
import { NotFound, PageLoading } from '../cards/components'

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function CharacterCard({ character, name, description }: { character: Character; name: string; description?: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/characters/$id"
      params={{ id: character.id }}
      data-testid="character-card"
      className="flex gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/60"
      style={character.color ? { borderLeftColor: character.color, borderLeftWidth: 4 } : undefined}
    >
      {character.icon ? (
        <img src={iconUrl(character.icon)} alt="" loading="lazy" className="size-20 shrink-0 object-contain" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-lg font-bold" style={character.color ? { color: character.color } : undefined}>
          {name}
        </h2>
        {description ? <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Stat label={t('character.startingHp')} value={character.startingHp} />
          <Stat label={t('character.maxEnergy')} value={character.maxEnergy} />
          {character.orbSlots > 0 ? <Stat label={t('character.orbSlots')} value={character.orbSlots} /> : null}
          {character.cardCount ? <Stat label={t('character.cardCount')} value={character.cardCount} /> : null}
        </div>
      </div>
    </Link>
  )
}

export default function CharacterListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

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

  // Only playable characters are listed: the rest are internal placeholders
  // (a "random" picker and a debug character with 1000 HP).
  const playable = bundle?.characters.filter((c) => c.playable) ?? []

  return (
    <ContentPage active="/characters" title={t('character.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PageLoading />
      ) : playable.length === 0 ? (
        <NotFound />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('character.count', { count: playable.length })}
          </p>
          <div className="flex flex-col gap-3">
            {playable.map((c) => (
              <CharacterCard
                key={c.id}
                character={c}
                name={bundle.characterText[c.id]?.name ?? c.id}
                description={bundle.characterText[c.id]?.description}
              />
            ))}
          </div>
        </>
      )}
    </ContentPage>
  )
}
