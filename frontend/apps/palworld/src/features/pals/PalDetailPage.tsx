import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Moon, Zap } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import {
  loadPals,
  gearCategory,
  passiveDescription,
  resolveCharacterNames,
  type PalsBundle,
  type PalEntry,
  type WorkType,
  type FarmItem,
} from '../../lib/pals'
import { comboKey, loadBreeding, makeEngine, queryFormulas, type BreedingData, type NameMap } from '../../lib/breeding'
import { simulateCondense } from '../../lib/condenser'
import { RecipeCard, buildRecipeMeta } from '../breeding/RecipeCard'
import { palIconUrl } from '../../lib/assets'
import { formatPalId } from '../../lib/palId'
import { loadItems, loadTech, type ItemsBundle, type TechBundle } from '../../lib/catalog'
import { loadDungeons, dungeonsByPal, type DungeonsBundle } from '../../lib/dungeons'
import { loadFishing, type FishingFile } from '../../lib/fishing'
import { CatalogDataProvider, ItemLink, MaterialChip } from '../catalog/components'
import { filterStrings } from './filterStrings'
import {
  PalSection,
  InfoRows,
  StatRow,
  PalPageLoading,
  PalNotFound,
  ElementBadge,
  WorkSuitability,
  ActiveSkillRow,
  PassiveRow,
  DropRow,
  PalSpawnMap,
} from './components'

// Curated stat rows, in display order. Labels come from i18n (`pal.stat.*`).
const STAT_KEYS = [
  'hp',
  'meleeAttack',
  'shotAttack',
  'defense',
  'support',
  'craftSpeed',
  'stamina',
  'foodAmount',
  'maxFullStomach',
  'captureRate',
  'price',
] as const

// The Base Stats card shows the first 8 (combat) stats through Food; the
// remaining stats move to a "Details" card placed below Work Suitability.
const PRIMARY_STAT_KEYS = STAT_KEYS.slice(0, 8)
const SECONDARY_STAT_KEYS = STAT_KEYS.slice(8)

// Movement speeds (raw world units). A `-1` value is the game's "no such speed"
// sentinel and renders as an em-dash.
const SPEED_KEYS = [
  'slowWalkSpeed',
  'walkSpeed',
  'runSpeed',
  'rideSprintSpeed',
  'transportSpeed',
  'swimSpeed',
] as const

// Join per-rank values with " / ", but collapse to a single value when every rank
// is identical (e.g. 100 / 100 / 100 / 100 / 100 → 100).
function joinRanks(vals: readonly (number | string)[]): string {
  return vals.every((v) => v === vals[0]) ? String(vals[0]) : vals.join(' / ')
}

// A produced-count range: "1" when min == max, else "1–5".
function countRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`
}

/** Pal Ranch production per partner-skill rank: one row per rank (Lv1…LvN),
 *  each listing the items dropped with their count range and — for weighted
 *  multi-item pools — each item's percentage share of that rank's draw. */
function RanchProduce({ farm, bundle }: { farm: FarmItem[][]; bundle: PalsBundle }) {
  const { t } = useTranslation()
  if (!farm.length) return null
  // Split into two side-by-side tables of 5 ranks (1–5 | 6–10) on desktop;
  // they stack back into one column on narrow screens.
  const chunks: { start: number; pools: FarmItem[][] }[] = []
  for (let i = 0; i < farm.length; i += 5) chunks.push({ start: i, pools: farm.slice(i, i + 5) })
  return (
    <div className="mt-3">
      <div className="mb-1 text-sm font-medium">{t('partner.ranch')}</div>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {chunks.map(({ start, pools }) => (
          <table key={start} className="h-fit w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-px whitespace-nowrap pb-1 pr-2 text-center font-medium">{t('pal.lv')}</th>
                <th className="w-full pb-1 font-medium">{t('pal.section.drops')}</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool, i) => {
                const total = pool.reduce((s, e) => s + e.weight, 0) || 1
                const multi = pool.length > 1
                return (
                  <tr key={start + i} className="border-t border-border/60">
                    <td className="px-1 pr-2 text-center align-middle tabular-nums text-muted-foreground">
                      {start + i + 1}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {pool.map((e, j) => (
                          <span key={`${e.item}-${j}`} className="inline-flex items-center gap-1">
                            <ItemLink id={e.item} name={bundle.items[e.item] ?? e.item} icon={bundle.itemIcon[e.item]} />
                            <span className="tabular-nums text-muted-foreground">
                              ×{countRange(e.min, e.max)}
                              {multi ? ` (${Math.round((e.weight / total) * 100)}%)` : ''}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  )
}

function BreedingLinks({
  pal,
  data,
  names,
}: {
  pal: PalEntry
  data: BreedingData
  names: NameMap
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const { parents, meta } = useMemo(() => {
    const engine = makeEngine(data)
    const { list } = queryFormulas(engine, data, { a: null, b: null, c: pal.id })
    return { parents: list, meta: buildRecipeMeta(data.pals) }
  }, [data, pal.id])

  // Back to the first page whenever the pal changes.
  useEffect(() => {
    setPage(0)
  }, [pal.id])

  const sectionTitle = t('pal.section.breeding')
  if (parents.length === 0) {
    return (
      <PalSection title={sectionTitle}>
        <p className="text-sm text-muted-foreground">{t('pal.noBreeding')}</p>
      </PalSection>
    )
  }
  // This pal's own breeding power (CombiRank). Every recipe here produces this
  // same pal, so the result chip is dropped and the power shown once up top.
  const rank = meta.get(pal.id)?.rank
  const PAGE_SIZE = 10
  const pageCount = Math.ceil(parents.length / PAGE_SIZE)
  // Clamp: `page` state can lag a pal change for one render before the effect resets it.
  const curPage = Math.min(page, pageCount - 1)
  const shown = parents.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)
  // When paginated, pad the short last page with invisible card clones so every
  // page is PAGE_SIZE rows tall and the pager doesn't jump. A single page keeps
  // its natural height.
  const padCount = pageCount > 1 ? PAGE_SIZE - shown.length : 0
  return (
    <PalSection
      title={sectionTitle}
      action={
        <Link
          to="/breeding"
          search={{ c: pal.id }}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-normal text-primary hover:underline"
        >
          {t('pal.openBreeding')}
        </Link>
      }
    >
    <div className="space-y-2">
      {rank != null ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('breeding.breedingPower')}:</span>
          <span className="inline-flex items-center gap-0.5 tabular-nums text-foreground">
            <Zap className="size-3 shrink-0" />
            {rank}
          </span>
        </div>
      ) : null}
      <div className="text-xs text-muted-foreground">
        {t('pal.bredFrom')}:{' '}
        <span className="tabular-nums text-foreground">
          {t('breeding.combinations', { count: parents.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {shown.map((f) => (
          <RecipeCard key={comboKey(f)} f={f} names={names} meta={meta} uniqueLabel={t('breeding.unique')} hideResult />
        ))}
        {Array.from({ length: padCount }, (_, i) => (
          // Invisible clone of a real card: reserves exactly one row's height.
          <div key={`pad-${i}`} aria-hidden="true" className="invisible">
            <RecipeCard f={parents[0]} names={names} meta={meta} uniqueLabel={t('breeding.unique')} hideResult />
          </div>
        ))}
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, curPage - 1))}
            disabled={curPage === 0}
            aria-label={t('breeding.prevPage')}
            className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="tabular-nums">
            {curPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, curPage + 1))}
            disabled={curPage >= pageCount - 1}
            aria-label={t('breeding.nextPage')}
            className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
    </PalSection>
  )
}

export default function PalDetailPage() {
  const { id } = useParams({ from: '/pals/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const fs = filterStrings(lng)

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [breeding, setBreeding] = useState<{ data: BreedingData; names: NameMap } | null>(null)
  // Items catalog: powers the hover cards of item chips (e.g. the egg badge).
  const [items, setItems] = useState<ItemsBundle | null>(null)
  // Dungeons + tech: back the "found in dungeons" and "capturing unlocks tech"
  // cross-links (reverse of DungeonDetailPage / TechDetails).
  const [dungeons, setDungeons] = useState<DungeonsBundle | null>(null)
  const [tech, setTech] = useState<TechBundle | null>(null)
  // Fishing dataset, for the "caught by fishing" reverse — best-effort.
  const [fishing, setFishing] = useState<FishingFile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadFishing()
      .then((f) => { if (!cancelled) setFishing(f) })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadPals(lng), loadBreeding(lng), loadItems(lng), loadDungeons(lng), loadTech(lng)])
      .then(([b, br, it, dg, tc]) => {
        if (cancelled) return
        setBundle(b)
        setBreeding(br)
        setItems(it)
        setDungeons(dg)
        setTech(tc)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const pal = bundle?.byId.get(id)

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!bundle) {
    body = <PalPageLoading />
  } else if (!pal) {
    body = <PalNotFound id={id} />
  } else {
    const text = bundle.text[pal.id]
    const pid = formatPalId(pal.zukanIndex, pal.zukanIndexSuffix)
    const workEntries = (Object.entries(pal.work) as [WorkType, number][])
      .filter(([, lvl]) => lvl > 0)
      .sort((a, b) => b[1] - a[1])
    // The game's single BestWorkSuitability is highlighted: the condenser
    // upgrades it first (stars 1 and 3), so it matters mechanically.
    const condensed = simulateCondense(pal.work, pal.bestWork)
    // Per-BOND-RANK flat gains (Friendship_* — the trust system, NOT the
    // condenser), shown inline on the matching base-stat rows.
    const bondGrowth: Partial<Record<(typeof STAT_KEYS)[number], number>> = pal.friendship ?? {}
    const partnerName = text?.partnerSkill?.name
    const ps = pal.partnerSkill
    const partnerDesc =
      resolveCharacterNames(text?.partnerSkill?.desc, bundle.text) ||
      (ps.wazaId ? resolveCharacterNames(bundle.skills[ps.wazaId]?.description, bundle.text) : '')
    const unlockItemName = ps.unlockItem ? bundle.items[ps.unlockItem] ?? ps.unlockItem : ''
    const gearCat = gearCategory(ps.gear)

    // When a pal has no wild/boss spawns, say how it's obtained. A breeding
    // recipe is only a *real* acquisition path if the pal isn't one of its own
    // parents (X = X + Y still needs an X), so require a≠c and b≠c. Summoning
    // (Summoning Altar) takes priority over breeding when both apply.
    const breedable = !!breeding?.data.combos.some(
      (cb) => cb.c === pal.id && cb.a !== pal.id && cb.b !== pal.id,
    )
    const spawnEmptyMessage = pal.summonable
      ? t('pal.summonOnly')
      : breedable
        ? t('pal.breedingOnly')
        : t('pal.noSpawns')

    // Cross-links (reverse of DungeonDetailPage encounters / TechDetails requirePal).
    const palDungeons = dungeons ? [...(dungeonsByPal(dungeons.file).get(pal.id) ?? [])].sort() : []
    // Fishing reverse: areas where this pal is a catchable fish, aggregated
    // (level band widened, best draw share kept, night flag when every catch is).
    const fishingAreas: { area: string; lvMin: number; lvMax: number; share: number; night: boolean }[] = []
    if (fishing) {
      const byArea = new Map<string, { lvMin: number; lvMax: number; share: number; night: boolean }>()
      for (const s of fishing.spots) {
        for (const f of s.fish) {
          if (f.pal !== pal.id) continue
          const a = s.area ?? 'other'
          const cur = byArea.get(a)
          if (cur) {
            cur.lvMin = Math.min(cur.lvMin, f.lvMin)
            cur.lvMax = Math.max(cur.lvMax, f.lvMax)
            cur.share = Math.max(cur.share, f.sharePct)
            cur.night = cur.night && !!f.night
          } else {
            byArea.set(a, { lvMin: f.lvMin, lvMax: f.lvMax, share: f.sharePct, night: !!f.night })
          }
        }
      }
      for (const [a, v] of byArea) fishingAreas.push({ area: a, ...v })
      fishingAreas.sort((x, y) => y.share - x.share)
    }
    const unlockedTechs = tech ? tech.techs.filter((tt) => tt.requirePal === pal.id) : []
    // Enemy-form scaling multipliers (alpha/boss), only when they diverge from
    // 1. Labels are i18n keys (HP / cooldown reuse the stat & skill labels).
    const enemyScaling = pal.enemyScaling
      ? (
          [
            ['maxHp', 'pal.stat.hp'],
            ['receiveDamage', 'pal.dmgTaken'],
            ['inflictDamage', 'pal.dmgDealt'],
            ['wazaCoolTime', 'pal.cooldown'],
          ] as const
        ).filter(([k]) => pal.enemyScaling![k] != null)
      : []

    body = (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <img
            src={palIconUrl(pal.icon)}
            alt=""
            className="size-20 shrink-0 object-contain"
          />
          <div className="min-w-0">
            {pid ? (
              <div className="text-sm tabular-nums text-muted-foreground">
                {pid.text}
                {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
              </div>
            ) : null}
            <h1 className="text-3xl font-bold">{text?.name ?? pal.id}</h1>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{pal.id}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {pal.elements.map((e) => (
                <ElementBadge key={e} element={e} label={bundle.enums.elements[e] ?? e} />
              ))}
              {pal.size ? (
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {t('pal.stat.size')}: {pal.size}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {fs.reaction}: {fs.reactions[pal.reaction] ?? pal.reaction}
              </span>
              {pal.nocturnal ? (
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {fs.nocturnal}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="space-y-6 md:order-1">
            {text?.description ? (
              <PalSection title={t('pal.section.description')}>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {resolveCharacterNames(text.description, bundle.text)}
                </p>
              </PalSection>
            ) : null}

            {partnerName ? (
              <PalSection title={t('pal.section.partnerSkill')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{partnerName}</span>
                  {gearCat ? (
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {t(`partner.category.${gearCat}`)}
                    </span>
                  ) : null}
                </div>
                {unlockItemName ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('pal.unlockItem')}:{' '}
                    <Link
                      to="/items/$id"
                      params={{ id: ps.unlockItem! }}
                      className="text-primary hover:underline"
                    >
                      {unlockItemName}
                    </Link>
                  </div>
                ) : null}
                {partnerDesc ? (
                  <p className="mt-1 text-sm text-muted-foreground">{partnerDesc}</p>
                ) : null}
                {ps.effects?.length ? (
                  <ul className="mt-2 space-y-1">
                    {ps.effects.map((e, i) => (
                      <li
                        key={`${e.type}-${e.target}-${i}`}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span>
                          {bundle.partnerEffects[e.type] ?? e.type}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {bundle.partnerTargets[e.target] ?? e.target}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {joinRanks(e.values)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ps.action ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {ps.effectTimeByRank?.length ? (
                      <li className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">{t('pal.effectTime')}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {joinRanks(ps.effectTimeByRank)}
                        </span>
                      </li>
                    ) : ps.action.effectTime > 0 ? (
                      <li className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">{t('pal.effectTime')}</span>
                        <span className="shrink-0 tabular-nums">{ps.action.effectTime}s</span>
                      </li>
                    ) : null}
                    {ps.coolTimeByRank?.length ? (
                      <li className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">{t('pal.cooldown')}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {joinRanks(ps.coolTimeByRank)}
                        </span>
                      </li>
                    ) : ps.action.coolTime > 0 ? (
                      <li className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">{t('pal.cooldown')}</span>
                        <span className="shrink-0 tabular-nums">{ps.action.coolTime}s</span>
                      </li>
                    ) : null}
                    {ps.action.execCost > 0 ? (
                      <li className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">{t('pal.cost')}</span>
                        <span className="shrink-0 tabular-nums">{ps.action.execCost}</span>
                      </li>
                    ) : null}
                    {ps.action.toggle ? (
                      <li className="text-xs text-muted-foreground">{t('pal.toggle')}</li>
                    ) : null}
                  </ul>
                ) : null}
                {ps.rankValues?.length ? (
                  <div className="mt-2 text-xs tabular-nums text-muted-foreground">
                    {t('pal.rankScaling')}: {joinRanks(ps.rankValues)}
                  </div>
                ) : null}
                {ps.action?.triggerType ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t(`partner.trigger.${ps.action.triggerType}`, { defaultValue: '' })}
                  </div>
                ) : null}
                {ps.farm?.length ? (
                  <RanchProduce farm={ps.farm} bundle={bundle} />
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">{t('pal.condensation')}</div>
              </PalSection>
            ) : null}

            {pal.activeSkills.length ? (
              <PalSection title={t('pal.section.activeSkills')}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-px whitespace-nowrap pb-1 pr-2 text-center font-medium">{t('pal.lv')}</th>
                      <th className="w-full pb-1 pr-2 font-medium">{t('pal.skill')}</th>
                      <th className="w-px whitespace-nowrap pb-1 pr-2 text-right font-medium">{t('pal.power')}</th>
                      <th className="w-px whitespace-nowrap pb-1 pr-2 text-right font-medium">{t('pal.cooldown')}</th>
                      <th className="w-px whitespace-nowrap pb-1 pr-2 font-medium">{t('pal.type')}</th>
                      <th className="w-px whitespace-nowrap pb-1 text-right font-medium">{t('pal.range')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pal.activeSkills.map((s) => (
                      <ActiveSkillRow
                        key={`${s.wazaId}-${s.level}`}
                        skill={s}
                        name={bundle.skills[s.wazaId]?.name ?? s.wazaId}
                        typeLabel={t(s.category === 'Melee' ? 'pal.melee' : 'pal.ranged')}
                        description={resolveCharacterNames(bundle.skills[s.wazaId]?.description, bundle.text)}
                      />
                    ))}
                  </tbody>
                </table>
              </PalSection>
            ) : null}

            {pal.passives.length ? (
              <PalSection title={t('pal.section.passives')}>
                <div className="divide-y divide-border/60">
                  {pal.passives.map((pidStr) => (
                    <PassiveRow
                      key={pidStr}
                      name={bundle.passiveText[pidStr]?.name ?? pidStr}
                      description={passiveDescription(pidStr, bundle)}
                      rank={bundle.passivesById.get(pidStr)?.rank}
                    />
                  ))}
                </div>
              </PalSection>
            ) : null}

            <PalSection title={t('pal.section.spawns')}>
              <PalSpawnMap
                palId={pal.id}
                palIcon={pal.icon}
                palName={text?.name ?? pal.id}
                className="aspect-square"
                emptyMessage={spawnEmptyMessage}
              />
              {pal.summonable && pal.summonMaterials?.length ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {t('pal.summonMaterials')}
                    {pal.summonLevel ? (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-medium tabular-nums text-red-600 dark:text-red-400">
                        {t('pal.summonLevel', { n: pal.summonLevel })}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pal.summonMaterials.map((m) => (
                      <MaterialChip
                        key={m.item}
                        id={m.item}
                        name={bundle.items[m.item] ?? m.item}
                        icon={bundle.itemIcon[m.item]}
                        count={m.count}
                      />
                    ))}
                  </div>
                  {pal.summonEggPool?.length ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t('pal.summonEggPool')}:{' '}
                      {pal.summonEggPool.map((e, i) => {
                        const total = pal.summonEggPool!.reduce((s, x) => s + x.weight, 0) || 1
                        return (
                          <span key={e.pal}>
                            {i > 0 ? ' · ' : ''}
                            <Link
                              to="/pals/$id"
                              params={{ id: e.pal }}
                              className="text-primary hover:underline"
                            >
                              {bundle.text[e.pal]?.name ?? e.pal}
                            </Link>{' '}
                            ({Math.round((e.weight / total) * 100)}%)
                          </span>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </PalSection>

            {palDungeons.length ? (
              <PalSection title={t('pal.section.dungeons')}>
                <div className="flex flex-wrap gap-1.5">
                  {palDungeons.map((did) => (
                    <Link
                      key={did}
                      to="/dungeons/$id"
                      params={{ id: did }}
                      className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:text-primary hover:underline"
                    >
                      {dungeons?.text[did]?.name ?? did}
                    </Link>
                  ))}
                </div>
              </PalSection>
            ) : null}

            {fishingAreas.length ? (
              <PalSection title={t('pal.section.fishing')}>
                <div className="flex flex-wrap gap-1.5">
                  {fishingAreas.map((f) => (
                    <Link
                      key={f.area}
                      to="/fishing"
                      className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:text-primary hover:underline"
                    >
                      {items?.areaLabels[f.area] ?? t(`bp.area.${f.area}`, { defaultValue: f.area })}
                      <span className="tabular-nums text-muted-foreground">
                        Lv{f.lvMin === f.lvMax ? f.lvMin : `${f.lvMin}–${f.lvMax}`} · {f.share}%
                      </span>
                      {f.night ? <Moon className="size-3 text-indigo-400" /> : null}
                    </Link>
                  ))}
                </div>
              </PalSection>
            ) : null}

            {unlockedTechs.length ? (
              <PalSection title={t('pal.section.unlocksTech')}>
                <p className="mb-2 text-xs text-muted-foreground">
                  {t('pal.unlocksTechNote')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unlockedTechs.map((tt) => (
                    <Link
                      key={tt.id}
                      to="/technology"
                      search={{ tech: tt.id }}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:text-primary hover:underline"
                    >
                      {tech?.text[tt.id]?.name ?? tt.id}
                      <span className="text-muted-foreground">Lv{tt.level}</span>
                    </Link>
                  ))}
                </div>
              </PalSection>
            ) : null}
          </div>

          {/* Sidebar */}
          <div className="space-y-6 md:order-2">
            <PalSection title={t('pal.section.stats')}>
              <InfoRows>
                {PRIMARY_STAT_KEYS.map((k) => (
                  <StatRow
                    key={k}
                    label={t(`pal.stat.${k}`)}
                    value={
                      bondGrowth[k] != null ? (
                        <>
                          {pal.stats[k]}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {' '}+{bondGrowth[k]}
                          </span>
                        </>
                      ) : (
                        pal.stats[k]
                      )
                    }
                  />
                ))}
              </InfoRows>
              {Object.keys(bondGrowth).length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">+N</span>{' '}
                  {t('pal.friendshipNote')}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">{t('pal.statsBaseNote')}</p>
              <Link
                to="/stat-simulator"
                search={{ pal: pal.id }}
                className="mt-1.5 inline-block text-xs text-primary hover:underline"
              >
                {t('pal.openSimulator')}
              </Link>
            </PalSection>

            {workEntries.length ? (
              <PalSection title={t('pal.section.work')}>
                <div className="space-y-1.5">
                  {workEntries.map(([w, lvl]) => (
                    <WorkSuitability
                      key={w}
                      work={w}
                      level={lvl}
                      label={bundle.enums.work[w] ?? w}
                      highlight={w === pal.bestWork}
                      condense={condensed.get(w)}
                      condenseTitle={t('pal.condenseTitle')}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {t('pal.workBestCaption')}
                  </p>
                </div>
              </PalSection>
            ) : null}

            <PalSection title={t('pal.section.details')}>
              <InfoRows>
                {SECONDARY_STAT_KEYS.map((k) => (
                  <StatRow key={k} label={t(`pal.stat.${k}`)} value={pal.stats[k]} />
                ))}
                <StatRow label={t('pal.stat.size')} value={pal.size || '—'} />
                <StatRow label={t('pal.stat.rarity')} value={pal.rarity} />
                {pal.predator ? (
                  <StatRow label={t('pal.stat.predator')} value={t('pal.yes')} />
                ) : null}
                {pal.stats.expRatio ? (
                  <StatRow label={t('pal.stat.expRatio')} value={pal.stats.expRatio} />
                ) : null}
                <StatRow
                  label={t('pal.stat.egg')}
                  value={
                    <ItemLink
                      id={pal.egg}
                      name={bundle.items[pal.egg] ?? pal.egg}
                      icon={bundle.itemIcon[pal.egg]}
                    />
                  }
                />
                <StatRow
                  label={t('pal.stat.gender')}
                  value={
                    pal.stats.maleProbability < 0
                      ? t('pal.genderless')
                      : `♂ ${pal.stats.maleProbability}% · ♀ ${100 - pal.stats.maleProbability}%`
                  }
                />
                {SPEED_KEYS.map((k) => (
                  <StatRow
                    key={k}
                    label={t(`pal.stat.${k}`)}
                    value={pal.stats[k] < 0 ? '—' : pal.stats[k]}
                  />
                ))}
              </InfoRows>
            </PalSection>

            {enemyScaling.length ? (
              <PalSection title={t('pal.section.enemyScaling')}>
                <p className="mb-2 text-xs text-muted-foreground">
                  {t('pal.enemyScalingNote')}
                </p>
                <InfoRows>
                  {enemyScaling.map(([k, label]) => (
                    <StatRow key={k} label={t(label)} value={`×${pal.enemyScaling![k]}`} />
                  ))}
                </InfoRows>
              </PalSection>
            ) : null}

            {pal.drops.length ? (
              <PalSection title={t('pal.section.drops')}>
                <div className="divide-y divide-border/60">
                  {pal.drops.map((d) => (
                    <DropRow
                      key={d.item}
                      id={d.item}
                      name={bundle.items[d.item] ?? d.item}
                      icon={bundle.itemIcon[d.item]}
                      rate={d.rate}
                      min={d.min}
                      max={d.max}
                      minLevel={d.minLevel}
                    />
                  ))}
                </div>
              </PalSection>
            ) : null}

            {pal.bossDrops?.length ? (
              <PalSection title={t('pal.section.bossDrops')}>
                <div className="divide-y divide-border/60">
                  {pal.bossDrops.map((d) => (
                    <DropRow
                      key={d.item}
                      id={d.item}
                      name={bundle.items[d.item] ?? d.item}
                      icon={bundle.itemIcon[d.item]}
                      rate={d.rate}
                      min={d.min}
                      max={d.max}
                      minLevel={d.minLevel}
                    />
                  ))}
                </div>
                {pal.bossFirstDefeatReward ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t('pal.firstDefeatReward', { defaultValue: 'First-defeat reward' })}:{' '}
                    <ItemLink
                      id={pal.bossFirstDefeatReward}
                      name={bundle.items[pal.bossFirstDefeatReward] ?? pal.bossFirstDefeatReward}
                      icon={bundle.itemIcon[pal.bossFirstDefeatReward]}
                    />
                  </div>
                ) : null}
              </PalSection>
            ) : null}

            {breeding ? (
              <BreedingLinks pal={pal} data={breeding.data} names={breeding.names} />
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ContentPage active="/pals" title={t('pal.title')} maxWidth="max-w-5xl">
      <CatalogDataProvider pals={bundle ?? undefined} items={items ?? undefined}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
