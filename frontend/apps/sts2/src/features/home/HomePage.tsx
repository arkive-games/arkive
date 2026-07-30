import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadBundle, type Bundle } from '../../lib/data'
import { getGameVersion, iconUrl } from '../../lib/urls'

export default function HomePage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [bundle, setBundle] = useState<Bundle | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBundle(lng)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [lng])

  const playable = bundle?.characters.filter((c) => c.playable) ?? []
  const gameVersion = getGameVersion()

  return (
    <ContentPage active="/" title={t('siteTitle')}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">{t('siteTitle')}</h1>
          <p className="mt-1 text-muted-foreground">{t('home.tagline')}</p>
        </div>

        {playable.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {playable.map((c) => (
              <Link
                key={c.id}
                to="/characters/$id"
                params={{ id: c.id }}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center shadow-sm transition hover:border-primary/60"
                style={c.color ? { borderTopColor: c.color, borderTopWidth: 3 } : undefined}
              >
                {c.icon ? (
                  <img src={iconUrl(c.icon)} alt="" loading="lazy" className="size-20 object-contain" />
                ) : null}
                <span className="font-semibold" style={c.color ? { color: c.color } : undefined}>
                  {bundle?.characterText[c.id]?.name ?? c.id}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('character.cardCount')}: {c.cardCount ?? 0}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/cards">{t('home.browseCards')}</Link>
          </Button>
          {bundle ? (
            <span className="text-sm text-muted-foreground">
              {t('card.count', { count: bundle.cards.length })}
            </span>
          ) : null}
        </div>

        {gameVersion ? (
          <p className="text-xs text-muted-foreground">{t('home.dataNote', { version: gameVersion })}</p>
        ) : null}
      </div>
    </ContentPage>
  )
}
