import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, ChevronLeft, FlaskConical, Hammer, MapPinned, Sparkles } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { loadVBloodBosses, useCompletedVBlood, type VBloodBoss } from '../../lib/vblood'

function RewardSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-primary/15 bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function PendingData() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">{t('vblood.rewardPendingTitle')}</p>
      <p className="mt-1">{t('vblood.rewardPending')}</p>
    </div>
  )
}

export default function VBloodDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams({ from: '/vblood/$id' })
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [boss, setBoss] = useState<VBloodBoss | null | undefined>(undefined)
  const { completed, toggleCompleted } = useCompletedVBlood()

  useEffect(() => {
    let cancelled = false
    setBoss(undefined)
    loadVBloodBosses(lng)
      .then((rows) => { if (!cancelled) setBoss(rows.find((row) => row.id === id) ?? null) })
      .catch((error: unknown) => {
        console.error(error)
        if (!cancelled) setBoss(null)
      })
    return () => { cancelled = true }
  }, [id, lng])

  if (boss === undefined) {
    return <ContentPage active="/vblood" title={t('vblood.title')}><div className="py-20 text-center text-muted-foreground">{t('loading')}</div></ContentPage>
  }
  if (!boss) {
    return (
      <ContentPage active="/vblood" title={t('vblood.title')}>
        <div className="py-20 text-center">
          <p className="text-lg font-bold">{t('vblood.notFound')}</p>
          <Link to="/vblood" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">{t('vblood.backToList')}</Link>
        </div>
      </ContentPage>
    )
  }

  const isCompleted = completed.has(boss.id)
  return (
    <ContentPage active="/vblood" title={boss.name} wide>
      <Link to="/vblood" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-primary">
        <ChevronLeft className="size-4" />
        {t('vblood.backToList')}
      </Link>

      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="relative min-h-64 overflow-hidden bg-gradient-to-br from-primary/15 via-secondary to-muted md:min-h-96">
            {boss.portrait ? <img src={boss.portrait} alt="" className="absolute inset-0 size-full object-cover object-top" /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-7">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">{t('vblood.eyebrow')}</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight md:text-4xl">{boss.name}</h1>
              <p className="mt-2 max-w-xl text-sm text-white/80">{boss.id}</p>
            </div>
          </div>
          <div className="flex flex-col p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/70 p-3"><p className="text-xs text-muted-foreground">{t('marker.level')}</p><p className="mt-1 text-xl font-bold tabular-nums">{boss.level ?? '—'}</p></div>
              <div className="rounded-lg bg-secondary/70 p-3"><p className="text-xs text-muted-foreground">{t('marker.act')}</p><p className="mt-1 text-xl font-bold">{boss.act === 'Shards' ? t('vblood.shards') : (boss.act?.replace(/^Act/, '') ?? '—')}</p></div>
              <div className="col-span-2 rounded-lg bg-secondary/70 p-3"><p className="text-xs text-muted-foreground">{t('marker.gameRegion')}</p><p className="mt-1 font-bold">{boss.region ?? t('vblood.unknownRegion')}</p></div>
              <div className="col-span-2 rounded-lg bg-secondary/70 p-3"><p className="text-xs text-muted-foreground">{t('marker.movement')}</p><p className="mt-1 font-bold">{t(`marker.${boss.movement}`)}</p></div>
            </div>
            <div className="mt-auto grid gap-2 pt-5">
              <button
                type="button"
                aria-pressed={isCompleted}
                onClick={() => toggleCompleted(boss.id)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition ${isCompleted ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
              >
                <Check className="size-4" />
                {isCompleted ? t('vblood.completed') : t('vblood.markComplete')}
              </button>
              <Link
                to="/"
                search={{ q: boss.name }}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-card px-4 text-sm font-bold text-primary transition hover:bg-primary/5"
              >
                <MapPinned className="size-4" />
                {t('vblood.showOnMap')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <RewardSection icon={<Sparkles className="size-4" />} title={t('vblood.abilities')}><PendingData /></RewardSection>
        <RewardSection icon={<FlaskConical className="size-4" />} title={t('vblood.recipes')}><PendingData /></RewardSection>
        <RewardSection icon={<Hammer className="size-4" />} title={t('vblood.buildings')}><PendingData /></RewardSection>
        <RewardSection icon={<BookOpen className="size-4" />} title={t('vblood.research')}><PendingData /></RewardSection>
      </div>
    </ContentPage>
  )
}
