import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { dungeonsByItem, loadDungeons, type DungeonsBundle } from '../../lib/dungeons'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadMerchants, type MerchantsBundle } from '../../lib/merchants'
import { loadRecycler, type RecyclerFile } from '../../lib/recycler'
import {
  loadPals,
  buildActiveSkills,
  type Element,
  type PalsBundle,
} from '../../lib/pals'
import { elementIconUrl, hasElementIcon, palIconUrl } from '../../lib/assets'
import { CatalogDataProvider, ItemLink, PalHover, PalLink } from '../catalog/components'
import { ItemSourceRows } from '../items/ItemSources'
import { PalSection, InfoRows, StatRow, PalPageLoading, ElementBadge, formatSkillRange } from './components'

export default function ActiveSkillDetailPage() {
  const { id } = useParams({ from: '/active-skills/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [dungeons, setDungeons] = useState<DungeonsBundle | null>(null)
  const [merchants, setMerchants] = useState<MerchantsBundle | null>(null)
  const [recycler, setRecycler] = useState<RecyclerFile | null>(null)

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

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setDungeons(null)
    setMerchants(null)
    setRecycler(null)
    loadItems(lng)
      .then((value) => { if (!cancelled) setItems(value) })
      .catch((err) => console.error(err))
    loadDungeons(lng)
      .then((value) => { if (!cancelled) setDungeons(value) })
      .catch((err) => console.error(err))
    loadMerchants()
      .then((value) => { if (!cancelled) setMerchants(value) })
      .catch((err) => console.error(err))
    loadRecycler()
      .then((value) => { if (!cancelled) setRecycler(value) })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [lng])

  const skill = useMemo(
    () => (bundle ? buildActiveSkills(bundle).find((s) => s.wazaId === id) : undefined),
    [bundle, id],
  )
  const skillFruit = useMemo(
    () => items?.items.find((item) => item.grantsSkill === id),
    [items, id],
  )
  const skillFruitDungeons = useMemo(() => {
    if (!dungeons || !skillFruit) return []
    const ids = dungeonsByItem(dungeons.file).get(skillFruit.id)
    return ids ? dungeons.file.dungeons.filter((dungeon) => ids.has(dungeon.id)) : []
  }, [dungeons, skillFruit])

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
          {hasElementIcon(skill.element) ? (
            <img
              src={elementIconUrl(skill.element)}
              alt=""
              className="size-14 shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold break-words">{skill.name}</h1>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{skill.wazaId}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ElementBadge element={skill.element as Element} label={bundle.enums.elements[skill.element] ?? skill.element} />
              {skill.isFruit ? (
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t('activeSkill.fruit')}
                </span>
              ) : null}
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
            <StatRow label={t('pal.cooldown')} value={lng.startsWith('zh') ? `${skill.coolTime} 秒` : `${skill.coolTime}s`} />
            <StatRow label={t('pal.range')} value={formatSkillRange(skill.minRange, skill.maxRange, lng)} />
            <StatRow label={t('activeSkill.fruit')} value={skill.isFruit ? t('activeSkill.has') : t('activeSkill.hasNot')} />
          </InfoRows>
        </PalSection>

        {skillFruit && items ? (
          <PalSection title={t('item.section.obtain')}>
            <div className="space-y-3" data-testid="active-skill-sources">
              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">{t('activeSkill.fruit')}</div>
                <ItemLink
                  id={skillFruit.id}
                  name={items.text[skillFruit.id]?.name ?? skillFruit.id}
                  icon={skillFruit.icon}
                />
              </div>
              {skillFruit.droppedBy?.length ? (
                <div>
                  <div className="mb-1.5 text-xs text-muted-foreground">{t('item.droppedBy')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skillFruit.droppedBy.map((drop) => (
                      <PalLink
                        key={drop.id}
                        id={drop.id}
                        name={bundle.text[drop.id]?.name ?? drop.id}
                        icon={bundle.byId.get(drop.id)?.icon}
                        badge={drop.isBoss ? t('item.bossDrop') : undefined}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <ItemSourceRows
                item={skillFruit}
                items={items}
                pals={bundle}
                merchants={merchants}
                recycler={recycler}
              />
              {skillFruitDungeons.length ? (
                <div data-testid="active-skill-dungeon-sources">
                  <div className="mb-1.5 text-xs text-muted-foreground">{t('dungeon.foundIn')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skillFruitDungeons.map((dungeon) => (
                      <Link
                        key={dungeon.id}
                        to="/dungeons/$id"
                        params={{ id: dungeon.id }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                      >
                        {dungeons?.text[dungeon.id]?.name ?? dungeon.id}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </PalSection>
        ) : null}

        <PalSection title={`${t('nav.pals')} (${skill.pals.length})`}>
          {skill.pals.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {skill.pals.map((p) => (
                <PalHover key={p.id} id={p.id}>
                  <Link
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
                </PalHover>
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
      <CatalogDataProvider items={items ?? undefined} pals={bundle ?? undefined}>{body}</CatalogDataProvider>
    </ContentPage>
  )
}
