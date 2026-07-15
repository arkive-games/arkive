import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Button, cn } from '@gamemap/ui'
import { comboKey, favKey, palIconUrl, type Combo, type NameMap } from '../../lib/breeding'
import { buildChainTree, type BreedChain, type ChainStep, type ChainTreeNode } from '../../lib/breedingChains'
import { PalHover } from '../catalog/components'
import { GenderMark, LEGENDARY_ICON, PalChip, RecipeCard, type RecipeMeta } from './RecipeCard'

// Partner chips shown per step before the "+N" expander.
const PARTNER_CAP = 8
// Chain cards shown per group before the show-more button.
const GROUP_CAP = 40
// Tree view: first-step groups shown initially per generation section.
const TREE_ROOT_CAP = 5
// Tree view: continuations shown per node initially (rest behind show-more).
const TREE_CHILD_CAP = 1
// Tree view: rows revealed per show-more click.
const TREE_MORE = 10
// Tree view: partner chips per row, thinning with depth to keep deep rows quiet.
const TREE_PARTNER_CAPS = [PARTNER_CAP, 5, 3, 2]
// Tree view: per-depth indent of the fixed-parent column (desktop grid layout;
// static classes so Tailwind sees them).
const TREE_INDENT = ['', 'sm:pl-6', 'sm:pl-12', 'sm:pl-18', 'sm:pl-24', 'sm:pl-30']
const indentClass = (depth: number) => TREE_INDENT[Math.min(depth, TREE_INDENT.length - 1)]

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

/**
 * One breeding step: fixed parent + (partner options) = child. The row is a
 * wrapping flex on narrow screens (chips can't shrink, a rigid grid would
 * overflow); from sm up it dissolves (contents) into the enclosing card's
 * shared 5-column grid so +, = and the child column align across rows.
 * `depth` (tree view) indents the fixed-parent column and thins the partner
 * cap, keeping deeper rows quieter.
 */
function StepRow({ step, final, ctx, depth = 0 }: { step: ChainStep; final: boolean; ctx: ChainsCtx; depth?: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const cap = TREE_PARTNER_CAPS[Math.min(depth, TREE_PARTNER_CAPS.length - 1)]
  const partners = expanded ? step.partners : step.partners.slice(0, cap)
  const hidden = step.partners.length - partners.length
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:contents">
      {/* Indent lives inside the first grid cell: the levels above render as
          display:contents on sm+, so nesting can't come from their boxes. */}
      <span className={cn('flex min-w-0 items-center', indentClass(depth))}>
        <PalChip id={step.fixed} names={ctx.names} meta={ctx.meta} />
      </span>
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
        ) : expanded && step.partners.length > cap ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label={t('breeding.collapse')}
            title={t('breeding.collapse')}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            −
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

/**
 * Show-more / show-fewer pair for a capped node list. Renders nothing while
 * everything fits the initial cap.
 */
function RevealControls({
  total,
  cap,
  initial,
  onMore,
  onLess,
  className,
}: {
  total: number
  cap: number
  initial: number
  onMore: () => void
  onLess: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const hidden = Math.max(0, total - cap)
  if (hidden === 0 && cap <= initial) return null
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {hidden > 0 ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onMore}>
          {t('breeding.showMoreRecipes', { count: Math.min(TREE_MORE, hidden) })}
        </Button>
      ) : null}
      {cap > initial ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onLess}>
          {t('breeding.collapse')}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * One tree node: its step row, then its continuations one level deeper. Only
 * the first continuation is visible initially; the rest hide behind show-more.
 * On sm+ the wrapper renders as display:contents so every row across all
 * depths joins the section card's shared grid (aligned = / child columns).
 */
function TreeNodeView({ node, depth, ctx }: { node: ChainTreeNode; depth: number; ctx: ChainsCtx }) {
  return (
    <div data-testid="breeding-tree-node" className="sm:contents">
      <StepRow step={node.step} final={node.children.length === 0} ctx={ctx} depth={depth} />
      {node.children.length > 0 ? <TreeLevel nodes={node.children} depth={depth + 1} ctx={ctx} /> : null}
    </div>
  )
}

// TreeNodeView/TreeLevel recurse into each other (depth ≤ 6 by construction).
function TreeLevel({ nodes, depth, ctx }: { nodes: ChainTreeNode[]; depth: number; ctx: ChainsCtx }) {
  const [cap, setCap] = useState(TREE_CHILD_CAP)
  const shown = nodes.slice(0, cap)
  return (
    // Mobile: nested, left-ruled block. sm+: dissolves into the card grid,
    // where nesting shows as first-column indentation instead.
    <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-border pl-3 sm:contents">
      {shown.map((n) => (
        <TreeNodeView key={n.step.child} node={n} depth={depth} ctx={ctx} />
      ))}
      <RevealControls
        total={nodes.length}
        cap={cap}
        initial={TREE_CHILD_CAP}
        onMore={() => setCap((c) => c + TREE_MORE)}
        onLess={() => setCap(TREE_CHILD_CAP)}
        className={cn('sm:col-span-full', indentClass(depth))}
      />
    </div>
  )
}

/** Leaves under a node = complete chains it contains. */
const leafCount = (n: ChainTreeNode): number =>
  n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leafCount(c), 0)

/** Chain length of a subtree (uniform per root by construction; max for safety). */
const treeDepth = (n: ChainTreeNode): number =>
  n.children.length === 0 ? 1 : 1 + Math.max(...n.children.map(treeDepth))

/** One generation section: header + first-step group cards, capped with reveal. */
function TreeSection({ label, count, roots, ctx }: { label: string; count: number; roots: ChainTreeNode[]; ctx: ChainsCtx }) {
  const [cap, setCap] = useState(TREE_ROOT_CAP)
  return (
    <section>
      <GroupHeader label={label} count={count} />
      <div className="flex flex-col gap-2">
        {roots.slice(0, cap).map((n) => (
          <div
            key={n.step.child}
            data-testid="breeding-chain-group"
            className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm sm:grid sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:items-center"
          >
            <TreeNodeView node={n} depth={0} ctx={ctx} />
          </div>
        ))}
        <RevealControls
          total={roots.length}
          cap={cap}
          initial={TREE_ROOT_CAP}
          onMore={() => setCap((c) => c + TREE_MORE)}
          onLess={() => setCap(TREE_ROOT_CAP)}
          className="self-start"
        />
      </div>
    </section>
  )
}

/**
 * Tree layout of the planner results, sectioned by generation count like the
 * list view: chains merge into a prefix tree; each first step (`A + X = B`)
 * is one group card with its continuations nested below, recursing to the
 * target. Remount (via key) on a query change to reset all reveal caps.
 */
export function BreedingChainsTreeView({ chains, ...ctx }: { chains: BreedChain[] } & ChainsCtx) {
  const { t } = useTranslation()
  const roots = buildChainTree(chains)
  // Section roots by their chain length (direct first, then ascending).
  const byGen = new Map<number, ChainTreeNode[]>()
  for (const n of roots) {
    const g = treeDepth(n)
    const list = byGen.get(g) ?? []
    list.push(n)
    byGen.set(g, list)
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b)
  return (
    <div className="mt-2">
      {gens.map((g) => {
        const sectionRoots = byGen.get(g)!
        // Direct section counts recipes (matching the list view); N-gen
        // sections count complete chains (tree leaves).
        const count =
          g === 1
            ? sectionRoots.reduce((s, n) => s + n.step.partners.length, 0)
            : sectionRoots.reduce((s, n) => s + leafCount(n), 0)
        return (
          <TreeSection
            key={g}
            label={g === 1 ? t('breeding.chainDirect') : t('breeding.chainNGen', { count: g })}
            count={count}
            roots={sectionRoots}
            ctx={ctx}
          />
        )
      })}
    </div>
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

  // Group chains by step count so the view works for any maxGen (2–6).
  const bySteps = new Map<number, BreedChain[]>()
  for (const ch of chains) {
    const n = ch.steps.length
    const list = bySteps.get(n) ?? []
    list.push(ch)
    bySteps.set(n, list)
  }
  const direct = bySteps.get(1)
  const multiLengths = [...bySteps.keys()].filter((n) => n > 1).sort((a, b) => a - b)

  return (
    <div className="mt-2">
      {direct ? (
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
      {multiLengths.map((n) => (
        <ChainGroup
          key={n}
          label={t('breeding.chainNGen', { count: n })}
          chains={bySteps.get(n)!}
          ctx={ctx}
        />
      ))}
    </div>
  )
}
