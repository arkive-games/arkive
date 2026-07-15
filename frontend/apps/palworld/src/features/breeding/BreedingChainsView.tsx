import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Button, cn } from '@gamemap/ui'
import { comboKey, favKey, palIconUrl, type Combo, type NameMap } from '../../lib/breeding'
import type { BreedChain, ChainStep } from '../../lib/breedingChains'
import { PalHover } from '../catalog/components'
import { GenderMark, LEGENDARY_ICON, PalChip, RecipeCard, type RecipeMeta } from './RecipeCard'

// Partner chips shown per step before the "+N" expander.
const PARTNER_CAP = 8
// Chain cards shown per group before the show-more button.
const GROUP_CAP = 40

interface ChainsCtx {
  names: NameMap
  meta: RecipeMeta
  uniqueLabel: string
}

/**
 * One partner option inside a step row: compact pill (icon + name) linking to
 * the Paldeck, hover card included. Unique combos keep the amber mark; the two
 * gendered combos render both genders ("♀× Wixen♂" reads "fixed ♀ × partner ♂").
 */
function PartnerChip({ f, ctx }: { f: Combo; ctx: ChainsCtx }) {
  const m = ctx.meta.get(f.b)
  return (
    <PalHover id={f.b}>
      <Link
        to="/pals/$id"
        params={{ id: f.b }}
        title={f.unique ? ctx.uniqueLabel : undefined}
        className={cn(
          'inline-flex max-w-44 items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 hover:text-primary',
          f.unique
            ? 'border-amber-400/70 bg-amber-400/10 hover:border-amber-400'
            : 'border-border bg-background hover:border-primary/50',
        )}
      >
        {m?.icon ? (
          <img
            src={palIconUrl(m.icon)}
            alt=""
            loading="lazy"
            className={cn(
              'size-5 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10',
              m.legendary && LEGENDARY_ICON,
            )}
          />
        ) : null}
        <span className="truncate text-xs">
          {f.ag ? (
            <>
              <GenderMark g={f.ag} />
              <span className="text-muted-foreground">×</span>
            </>
          ) : null}
          {ctx.names[f.b] ?? f.b}
          <GenderMark g={f.bg} />
        </span>
      </Link>
    </PalHover>
  )
}

/** One breeding step: fixed parent + (partner options) = child. */
function StepRow({ step, final, ctx }: { step: ChainStep; final: boolean; ctx: ChainsCtx }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const partners = expanded ? step.partners : step.partners.slice(0, PARTNER_CAP)
  const hidden = step.partners.length - partners.length
  return (
    // Wrapping flex row on narrow screens (chips can't shrink, a rigid grid
    // overflows); from sm up the row dissolves (contents) into the card's
    // shared 5-column grid so +, = and the child column align across steps.
    <div className="flex flex-wrap items-center gap-1.5 sm:contents">
      <PalChip id={step.fixed} names={ctx.names} meta={ctx.meta} />
      <span className="px-1 text-muted-foreground">+</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {partners.map((f) => (
          <PartnerChip key={comboKey(f)} f={f} ctx={ctx} />
        ))}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('breeding.showAllPartners', { count: step.partners.length })}
            title={t('breeding.showAllPartners', { count: step.partners.length })}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            +{hidden}
          </button>
        ) : null}
      </span>
      <span className="px-1 text-muted-foreground">=</span>
      <PalChip id={step.child} names={ctx.names} meta={ctx.meta} emphasis={final} />
    </div>
  )
}

/** One chain entry: a step row per generation. */
function ChainCard({ chain, ctx }: { chain: BreedChain; ctx: ChainsCtx }) {
  return (
    <div
      data-testid="breeding-chain"
      // One grid shared by every step row (rows are `contents` from sm up), so
      // the fixed / + / partners / = / child columns line up across steps
      // regardless of how wide each Pal chip is.
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm sm:grid sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:items-center"
    >
      {chain.steps.map((s, i) => (
        <StepRow key={s.child} step={s} final={i === chain.steps.length - 1} ctx={ctx} />
      ))}
    </div>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="mb-2 mt-4 text-sm font-semibold">
      {label} <span className="font-normal text-muted-foreground">({count})</span>
    </h2>
  )
}

/** A capped, expandable list of chain cards under a group header. */
function ChainGroup({ label, chains, ctx }: { label: string; chains: BreedChain[]; ctx: ChainsCtx }) {
  const { t } = useTranslation()
  const [cap, setCap] = useState(GROUP_CAP)
  if (chains.length === 0) return null
  return (
    <section>
      <GroupHeader label={label} count={chains.length} />
      <div className="grid grid-cols-1 gap-2">
        {chains.slice(0, cap).map((ch) => (
          <ChainCard key={ch.steps.map((s) => s.child).join('>')} chain={ch} ctx={ctx} />
        ))}
      </div>
      {chains.length > cap ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={() => setCap((c) => c + GROUP_CAP)}
        >
          {t('breeding.showMoreRecipes', { count: Math.min(GROUP_CAP, chains.length - cap) })}
        </Button>
      ) : null}
    </section>
  )
}

export interface BreedingChainsViewProps extends ChainsCtx {
  chains: BreedChain[]
  /** Favourites wiring for the direct-recipe group (same store as classic mode). */
  favs: Set<string>
  onToggleFav: (key: string) => void
  favLabel: string
}

/**
 * Multi-generation planner results, grouped by chain length: direct recipes
 * (normal recipe cards, favouritable) first, then 2- and 3-generation chains.
 * Remount (via key) on a query change to reset the per-group caps.
 */
export function BreedingChainsView({ chains, favs, onToggleFav, favLabel, ...ctx }: BreedingChainsViewProps) {
  const { t } = useTranslation()
  const direct = chains.filter((ch) => ch.steps.length === 1)
  const twoGen = chains.filter((ch) => ch.steps.length === 2)
  const threeGen = chains.filter((ch) => ch.steps.length === 3)
  return (
    <div className="mt-2">
      {direct.length > 0 ? (
        <section>
          <GroupHeader label={t('breeding.chainDirect')} count={direct[0].steps[0].partners.length} />
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {direct[0].steps[0].partners.map((f) => {
              const fk = favKey(f)
              return (
                <RecipeCard
                  key={comboKey(f)}
                  f={f}
                  names={ctx.names}
                  meta={ctx.meta}
                  uniqueLabel={ctx.uniqueLabel}
                  fav={{ isFav: favs.has(fk), onToggle: () => onToggleFav(fk), label: favLabel }}
                />
              )
            })}
          </div>
        </section>
      ) : null}
      <ChainGroup label={t('breeding.chainTwoGen')} chains={twoGen} ctx={ctx} />
      <ChainGroup label={t('breeding.chainThreeGen')} chains={threeGen} ctx={ctx} />
    </div>
  )
}
