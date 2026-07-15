import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatChance } from '../../lib/dungeons'
import {
  anyRollChance,
  groupCountRange,
  groupSlots,
  type RecyclerFile,
  type RecyclerRecipe,
  type SlotGroup,
} from '../../lib/recycler'
import type { BuildingsBundle, ItemsBundle } from '../../lib/catalog'
import { CatalogSection, ItemLink, BuildingLink, ItemGlyph } from '../catalog/components'

function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}

/** "×1–3" count-range subtext (hidden for the ubiquitous ×1). */
function CountRange({ g }: { g: SlotGroup }) {
  const { min, max } = groupCountRange(g)
  if (max <= 1) return null
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      ×{min === max ? min : `${min}–${max}`}
    </span>
  )
}

/** A group's item pool: up to three chips inline, larger pools collapsed
 *  behind a summary. Expanded chips carry the weight share within the pool
 *  (the chance of that item, given the group's roll hits). */
function PoolCell({ g, b }: { g: SlotGroup; b: ItemsBundle }) {
  const { t } = useTranslation()
  const iname = (iid: string) => b.text[iid]?.name ?? iid
  if (g.items.length <= 3) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {g.items.map((it) => (
          <ItemLink key={it.item} id={it.item} name={iname(it.item)} icon={b.byId.get(it.item)?.icon} />
        ))}
      </div>
    )
  }
  const total = g.items.reduce((s, i) => s + i.weight, 0)
  return (
    <details>
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-primary">
        <span className="flex shrink-0 items-center gap-0.5">
          {g.items.slice(0, 3).map((it) =>
            b.byId.get(it.item)?.icon ? <ItemGlyph key={it.item} icon={b.byId.get(it.item)!.icon!} /> : null,
          )}
        </span>
        <span className="text-xs hover:underline">{t('recycler.poolCount', { count: g.items.length })}</span>
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {g.items.map((it) => (
          <span key={it.item} className="inline-flex items-center gap-1">
            {total > 0 ? <ChanceBadge pct={(it.weight / total) * 100} /> : null}
            <ItemLink id={it.item} name={iname(it.item)} icon={b.byId.get(it.item)?.icon} />
          </span>
        ))}
      </div>
    </details>
  )
}

/** Multi-roll groups: roll count, max possible drops, per-roll chances. */
function RollDetail({ g }: { g: SlotGroup }) {
  const { t } = useTranslation()
  if (g.rolls.length <= 1) return null
  return (
    <div className="text-xs tabular-nums text-muted-foreground">
      {t('recycler.rolls', { count: g.rolls.length })} · {t('recycler.upTo', { count: g.rolls.length })} ·{' '}
      {g.rolls.map((p) => formatChance(p)).join('% / ')}%
    </div>
  )
}

function BoostNote({ file, b }: { file: RecyclerFile; b: ItemsBundle }) {
  const { t } = useTranslation()
  if (!file.boost) return null
  return (
    <p className="text-xs text-muted-foreground">
      {t('recycler.boost', {
        item: b.text[file.boost.item]?.name ?? file.boost.item,
        mult: file.boost.multiplier,
      })}
    </p>
  )
}

/** Building detail page: one comparison table over all relic tiers — rows are
 *  output pools (aligned across tiers by pool identity), columns the input
 *  relics. Cells show the chance of at least one hit plus the count range. */
export function RecyclerComparisonSection({ file, items }: { file: RecyclerFile; items: ItemsBundle }) {
  const { t } = useTranslation()
  const iname = (iid: string) => items.text[iid]?.name ?? iid

  // Group each recipe's slots by pool, then align rows across recipes:
  // row order = first appearance over the recipes in tier order (tier-5-only
  // pools land at the end, matching their slot position).
  const { rowKeys, byRecipe } = useMemo(() => {
    const byRecipe = file.recipes.map((r) => {
      const m = new Map<string, SlotGroup>()
      for (const g of groupSlots(r.slots)) m.set(g.key, g)
      return m
    })
    const rowKeys: string[] = []
    for (const m of byRecipe) for (const key of m.keys()) if (!rowKeys.includes(key)) rowKeys.push(key)
    return { rowKeys, byRecipe }
  }, [file])

  return (
    <CatalogSection title={t('recycler.title')} testId="recycler-comparison">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
                {t('recycler.output')}
              </th>
              {file.recipes.map((r) => (
                <th key={r.input} className="px-2 py-2 text-left align-top font-normal">
                  <ItemLink id={r.input} name={iname(r.input)} icon={items.byId.get(r.input)?.icon} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            <tr>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{t('recycler.work')}</td>
              {file.recipes.map((r) => (
                <td key={r.input} className="px-2 py-2 tabular-nums">{r.work}</td>
              ))}
            </tr>
            {rowKeys.map((key) => {
              const label = byRecipe.map((m) => m.get(key)).find(Boolean)!
              return (
                <tr key={key}>
                  <td className="max-w-64 py-2 pr-3 align-top">
                    <PoolCell g={label} b={items} />
                  </td>
                  {file.recipes.map((r, ri) => {
                    const g = byRecipe[ri].get(key)
                    return (
                      <td key={r.input} className="px-2 py-2 align-top">
                        {g ? (
                          <div
                            className="space-y-0.5"
                            title={
                              g.rolls.length > 1
                                ? `${t('recycler.upTo', { count: g.rolls.length })} · ${g.rolls.map((p) => formatChance(p)).join('% / ')}%`
                                : undefined
                            }
                          >
                            <div className="flex items-center gap-1.5">
                              <ChanceBadge pct={anyRollChance(g.rolls)} />
                              <CountRange g={g} />
                            </div>
                            {g.rolls.length > 1 ? (
                              <div className="text-xs tabular-nums text-muted-foreground">
                                {t('recycler.rolls', { count: g.rolls.length })}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1">
        <BoostNote file={file} b={items} />
        <p className="text-xs text-muted-foreground">{t('recycler.note')}</p>
      </div>
    </CatalogSection>
  )
}

/** Relic item detail page: this relic's own conversion table (grouped rolls),
 *  the work amount, and a link back to the recycler building. */
export function RecyclerRecipeSection({
  file,
  recipe,
  items,
  buildings,
}: {
  file: RecyclerFile
  recipe: RecyclerRecipe
  items: ItemsBundle
  buildings: BuildingsBundle
}) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupSlots(recipe.slots), [recipe])

  return (
    <CatalogSection title={t('recycler.title')} testId="recycler-recipe">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs text-muted-foreground">{t('recycler.convertAt')}</span>
        <BuildingLink
          id={file.building}
          name={buildings.text[file.building]?.name ?? file.building}
          icon={buildings.byId.get(file.building)?.icon}
        />
        <span className="text-xs text-muted-foreground">
          {t('recycler.work')}: <span className="text-foreground tabular-nums">{recipe.work}</span>
        </span>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.key} className="flex flex-wrap items-start gap-1.5">
            <ChanceBadge pct={anyRollChance(g.rolls)} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <PoolCell g={g} b={items} />
                <CountRange g={g} />
              </div>
              <RollDetail g={g} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1">
        <BoostNote file={file} b={items} />
        <p className="text-xs text-muted-foreground">{t('recycler.note')}</p>
      </div>
    </CatalogSection>
  )
}
