import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import {
  loadPals,
  buildActiveSkills,
  type Element,
  type PalsBundle,
} from '../../lib/pals'
import { elementIconUrl, palIconUrl } from '../../lib/assets'
import { PalSection, InfoRows, StatRow, PalPageLoading, ElementBadge, formatSkillRange } from './components'

export default function ActiveSkillDetailPage() {
  const { id } = useParams({ from: '/active-skills/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const skill = useMemo(
    () => (bundle ? buildActiveSkills(bundle).find((s) => s.wazaId === id) : undefined),
    [bundle, id],
  )

  const backLink = (
    <Link
      to="/active-skills"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" />
      {t('pal.section.activeSkills')}
    </Link>
  )

  let body
  if (loadError) {
    body = <div className="mt-8 text-center text-destructive">{loadError}</div>
  } else if (!bundle) {
    body = <PalPageLoading />
  } else if (!skill) {
    body = (
      <div className="space-y-3">
        {backLink}
        <p className="text-muted-foreground">{t('pal.notFound', { id })}</p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-6">
        {backLink}
        {/* Header */}
        <div className="flex items-center gap-4">
          <img
            src={elementIconUrl(skill.element)}
            alt=""
            className="size-14 shrink-0 object-contain"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold break-words">{skill.name || skill.wazaId}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ElementBadge element={skill.element as Element} label={bundle.enums.elements[skill.element] ?? skill.element} />
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  skill.isFruit
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {skill.isFruit ? t('activeSkill.fruit') : t('activeSkill.defaultOnly')}
              </span>
            </div>
          </div>
        </div>

        {skill.description ? (
          <PalSection title={t('pal.section.description')}>
            <p className="text-sm leading-relaxed whitespace-pre-line">{skill.description}</p>
          </PalSection>
        ) : null}

        <PalSection title={t('pal.section.stats')}>
          <InfoRows>
            <StatRow label={t('pal.type')} value={t(skill.melee ? 'pal.melee' : 'pal.ranged')} />
            <StatRow label={t('pal.power')} value={skill.power || '—'} />
            <StatRow label={t('pal.cooldown')} value={`${skill.coolTime}s`} />
            <StatRow label={t('pal.range')} value={formatSkillRange(skill.minRange, skill.maxRange)} />
            <StatRow label={t('activeSkill.fruit')} value={skill.isFruit ? t('activeSkill.has') : t('activeSkill.hasNot')} />
          </InfoRows>
        </PalSection>

        <PalSection title={`${t('nav.pals')} (${skill.pals.length})`}>
          {skill.pals.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {skill.pals.map((p) => (
                <Link
                  key={p.id}
                  to="/pals/$id"
                  params={{ id: p.id }}
                  data-testid="active-skill-detail-pal"
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 transition hover:border-primary/60"
                >
                  <img
                    src={palIconUrl(p.icon)}
                    alt=""
                    width={36}
                    height={36}
                    loading="lazy"
                    className="size-9 shrink-0 rounded-full object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                    Lv{p.level}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('pal.notFound', { id })}</p>
          )}
        </PalSection>
      </div>
    )
  }

  return (
    <ContentPage active="/active-skills" title={t('pal.section.activeSkills')}>
      {body}
    </ContentPage>
  )
}
