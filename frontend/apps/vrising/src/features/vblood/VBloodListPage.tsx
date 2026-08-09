import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Check, MapPin, Search, Swords } from 'lucide-react'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadVBloodBosses, useCompletedVBlood, type VBloodBoss } from '../../lib/vblood'

const ACT_ORDER = ['ActI', 'ActII', 'ActIII', 'ActIV', 'Shards']

function actLabel(act: string | null, shardsLabel: string): string {
  if (!act) return '—'
  if (act === 'Shards') return shardsLabel
  return act.replace(/^Act/, '')
}

function BossCard({ boss, completed, onToggle }: {
  boss: VBloodBoss
  completed: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <article
      data-testid="vblood-card"
      className="group relative overflow-hidden rounded-xl border border-primary/15 bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <Link to="/vblood/$id" params={{ id: boss.id }} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/10 via-secondary to-muted">
          {boss.portrait ? (
            <img
              src={boss.portrait}
              alt=""
              loading="lazy"
              className="size-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <Swords className="size-12" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-white">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                {t('vblood.levelValue', { level: boss.level ?? '—' })}
              </p>
              <h2 className="mt-0.5 truncate text-base font-bold leading-tight">{boss.name}</h2>
            </div>
            <span className="shrink-0 rounded-md border border-white/25 bg-black/35 px-2 py-1 text-xs font-semibold backdrop-blur-sm">
              {boss.act === 'Shards'
                ? t('vblood.shards')
                : t('vblood.actValue', { act: actLabel(boss.act, t('vblood.shards')) })}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <MapPin className="size-3.5 shrink-0 text-primary" />
            {boss.region ?? t('vblood.unknownRegion')}
          </span>
          <span className="shrink-0">{t(`marker.${boss.movement}`)}</span>
        </div>
      </Link>
      <button
        type="button"
        aria-label={completed ? t('vblood.markIncomplete') : t('vblood.markComplete')}
        aria-pressed={completed}
        onClick={onToggle}
        className={`absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition ${
          completed
            ? 'border-emerald-300/60 bg-emerald-500 text-white'
            : 'border-white/30 bg-black/30 text-white hover:bg-black/50'
        }`}
      >
        {completed ? <Check className="size-4" /> : <span className="size-3 rounded-full border border-white/80" />}
      </button>
    </article>
  )
}

export default function VBloodListPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [bosses, setBosses] = useState<VBloodBoss[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [activeAct, setActiveAct] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState(false)
  const { completed, toggleCompleted } = useCompletedVBlood()

  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    setBosses(null)
    loadVBloodBosses(lng)
      .then((rows) => { if (!cancelled) setBosses(rows) })
      .catch((error: unknown) => {
        console.error(error)
        if (!cancelled) setLoadError(true)
      })
    return () => { cancelled = true }
  }, [lng])

  const acts = useMemo(() => {
    const present = new Set((bosses ?? []).map((boss) => boss.act).filter(Boolean))
    return ACT_ORDER.filter((act) => present.has(act))
  }, [bosses])

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (bosses ?? []).filter((boss) => {
      if (activeAct && boss.act !== activeAct) return false
      if (hideCompleted && completed.has(boss.id)) return false
      if (!needle) return true
      return `${boss.name} ${boss.region ?? ''} ${boss.id}`.toLocaleLowerCase().includes(needle)
    })
  }, [bosses, query, activeAct, hideCompleted, completed])

  return (
    <ContentPage active="/vblood" title={t('vblood.title')} heading wide>
      <div className="mb-5 rounded-xl border border-primary/15 bg-gradient-to-r from-primary/10 via-card to-card p-4 md:flex md:items-center md:justify-between md:gap-6">
        <div>
          <p className="text-sm font-semibold text-primary">{t('vblood.eyebrow')}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('vblood.caption')}</p>
        </div>
        <div className="mt-3 flex shrink-0 items-baseline gap-2 md:mt-0">
          <span className="text-2xl font-bold tabular-nums">{completed.size}</span>
          <span className="text-sm text-muted-foreground">/ {bosses?.length ?? '—'} {t('vblood.completed')}</span>
        </div>
      </div>

      <div className="mb-5 space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('vblood.searchPlaceholder')}
            aria-label={t('vblood.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label={t('filter')}>
          <button
            type="button"
            onClick={() => setActiveAct(null)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${!activeAct ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}
          >
            {t('showAll')}
          </button>
          {acts.map((act) => (
            <button
              key={act}
              type="button"
              onClick={() => setActiveAct(act)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${activeAct === act ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}
            >
              {act === 'Shards'
                ? t('vblood.shards')
                : t('vblood.actValue', { act: actLabel(act, t('vblood.shards')) })}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={hideCompleted}
            onClick={() => setHideCompleted((value) => !value)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${hideCompleted ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent'}`}
          >
            {t('vblood.hideCompleted')}
          </button>
          {bosses ? <span className="ml-auto text-sm text-muted-foreground">{t('resultsCount', { count: shown.length })}</span> : null}
        </div>
      </div>

      {loadError ? (
        <div className="py-16 text-center text-destructive">{t('loadError')}</div>
      ) : !bosses ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label={t('loading')}>
          {Array.from({ length: 10 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : shown.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((boss) => (
            <BossCard
              key={boss.id}
              boss={boss}
              completed={completed.has(boss.id)}
              onToggle={() => toggleCompleted(boss.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">{t('vblood.empty')}</div>
      )}
    </ContentPage>
  )
}
