import { useEffect, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadBundle, type Bundle } from '../../lib/data'
import { CardText, hasUpgrade } from '../../lib/cardText'
import { CardArt, CardDescription, CharacterBadge, CostBadge, NotFound, PageLoading, usePoolColors } from './components'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

export default function CardDetailPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { id } = useParams({ from: '/cards/$id' })

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

  const card = bundle?.cardsById.get(id)
  const name = bundle && card ? bundle.cardText[card.id]?.name ?? card.id : id
  const colors = usePoolColors(bundle)
  const character = bundle?.characters.find((c) => c.pool && card?.pool === c.pool)
  const upgradable = hasUpgrade(card?.vars)

  return (
    <ContentPage active="/cards" title={name}>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PageLoading />
      ) : !card ? (
        <NotFound />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <CostBadge cost={card.cost} className="size-9 text-base" />
            <h1
              className="text-2xl font-bold"
              style={card.pool && colors[card.pool] ? { color: colors[card.pool] } : undefined}
            >
              {name}
            </h1>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
            <CardArt card={card} className="h-56 w-full rounded-lg border border-border bg-muted/40 p-2" />

            <div className="flex flex-col gap-4">
              <Section title={t('card.description')}>
                <CardDescription card={card} bundle={bundle} />
                {upgradable ? (
                  <div className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
                      {t('card.upgraded')}
                    </div>
                    <p className="text-sm leading-relaxed">
                      {bundle.cardText[card.id]?.description ? (
                        <CardText
                          text={bundle.cardText[card.id]!.description!}
                          vars={card.vars}
                          upgraded
                          keyPrefix={`${card.id}-up`}
                        />
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </Section>

              <Section title={t('card.values')}>
                <Row label={t('card.type')}>{card.type}</Row>
                <Row label={t('card.rarity')}>{card.rarity}</Row>
                <Row label={t('card.target')}>{card.target}</Row>
                <Row label={t('card.cost')}>{card.cost < 0 ? t('card.unplayable') : card.cost}</Row>
                {character ? (
                  <Row label={t('card.pool')}>
                    <Link to="/characters/$id" params={{ id: character.id }} className="hover:underline">
                      <CharacterBadge
                        character={character}
                        name={bundle.characterText[character.id]?.name ?? character.id}
                      />
                    </Link>
                  </Row>
                ) : card.pool ? (
                  <Row label={t('card.pool')}>{card.pool}</Row>
                ) : null}
                {card.keywords?.length ? (
                  <Row label={t('card.keywords')}>
                    <span className="flex flex-wrap justify-end gap-1">
                      {card.keywords.map((k) => {
                        const text = bundle.keywordText[k.toUpperCase()]
                        return (
                          <span
                            key={k}
                            title={text?.description}
                            className={cn(
                              'rounded-full border border-border px-2 py-0.5 text-xs',
                              text?.description && 'cursor-help',
                            )}
                          >
                            {text?.name ?? k}
                          </span>
                        )
                      })}
                    </span>
                  </Row>
                ) : null}
              </Section>

              {card.vars && Object.keys(card.vars).length > 0 ? (
                <Section title={t('card.base')}>
                  {Object.entries(card.vars).map(([key, v]) => (
                    <Row key={key} label={key}>
                      {v.base}
                      {v.upgraded !== undefined ? (
                        <span className="ml-1 text-accent">→ {v.upgraded}</span>
                      ) : null}
                    </Row>
                  ))}
                </Section>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </ContentPage>
  )
}
