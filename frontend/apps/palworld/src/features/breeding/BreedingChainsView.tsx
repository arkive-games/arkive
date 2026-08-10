import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button, cn } from '@gamemap/ui'
import { comboKey, favKey, palIconUrl, type Combo, type NameMap } from '../../lib/breeding'
import { buildChainTree, type BreedChain, type ChainStep, type ChainTreeNode } from '../../lib/breedingChains'
import { PalHover } from '../catalog/components'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import {
  CompactPalNode,
  GenderMark,
  LEGENDARY_ICON,
  PalChip,
  RecipeCard,
  type BreedingVariant,
  type RecipeMeta,
} from './RecipeCard'

// Chain cards shown per group before the show-more button.
const GROUP_CAP = 40
// Tree view: first-step groups shown initially per generation section.
const TREE_ROOT_CAP = 5
// Tree view: continuations shown per node initially (rest behind show-more).
const TREE_CHILD_CAP = 1
// Tree view: rows revealed per show-more click.
const TREE_MORE = 10
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
function PartnerChip({ f, ctx, plain }: { f: Combo; ctx: ChainsCtx; plain?: boolean }) {
  const m = ctx.meta.get(f.b)
  const className = cn(
    'inline-flex max-w-44 items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 hover:text-primary',
    f.unique
      ? 'border-amber-400/70 bg-amber-400/10 hover:border-amber-400'
      : 'border-border bg-background hover:border-primary/50',
  )
  const content = (
    <>
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
    </>
  )
  // Plain variant: identical geometry without the link/hover-card, used for the
  // pre-paint measuring pass (mounting hundreds of hover cards is not free).
  if (plain) return <span className={className}>{content}</span>
  return (
    <PalHover id={f.b}>
      <Link
        to="/pals/$id"
        params={{ id: f.b }}
        title={f.unique ? ctx.uniqueLabel : undefined}
        className={className}
      >
        {content}
      </Link>
    </PalHover>
  )
}

/**
 * One breeding step: fixed parent + (partner options) = child. The row is a
 * wrapping flex on narrow screens (chips can't shrink, a rigid grid would
 * overflow); from sm up it dissolves (contents) into the enclosing card's
 * shared 5-column grid so +, = and the child column align across rows.
 * `depth` (tree view) indents the fixed-parent column.
 *
 * The partner cap is measured, not fixed: while `cap` is null every chip is
 * rendered plain, a layout effect counts how many landed on the first line and
 * clamps to that (minus one slot for the "+N" expander, never below 1) before
 * the browser paints. Re-measured on window resize and language change.
 */
function StepRow({ step, final, ctx, depth = 0 }: { step: ChainStep; final: boolean; ctx: ChainsCtx; depth?: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [cap, setCap] = useState<number | null>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const total = step.partners.length

  // Re-measure (cap → null) on viewport resize.
  useEffect(() => {
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCap(null), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Re-measure when the display language changes chip widths. Guarded on the
  // actual reference so it fires only on a real change — an unconditional
  // reset here would run at mount (twice under StrictMode) and clobber the
  // cap the layout effect just set, leaving every row stuck measuring.
  const prevNames = useRef(ctx.names)
  useEffect(() => {
    if (prevNames.current !== ctx.names) {
      prevNames.current = ctx.names
      setCap(null)
    }
  }, [ctx.names])

  // Measure how many chips fit on the first line, then clamp to that (leaving a
  // slot for the "+N" expander, never below 1). Runs while cap is null with all
  // partners rendered plain; the card grid is already balanced at layout-effect
  // time, so the wrap is final. No ResizeObserver: it would re-fire on the
  // height change our own clamp causes, resetting cap in a feedback cycle.
  useLayoutEffect(() => {
    if (cap !== null) return
    const el = boxRef.current
    if (!el) return
    const chips = [...el.children].filter((c) => c.tagName !== 'BUTTON') as HTMLElement[]
    if (chips.length === 0) {
      setCap(total)
      return
    }
    // Chips on the first flex line share the first chip's offsetTop.
    const firstTop = chips[0].offsetTop
    let fit = 0
    for (const c of chips) {
      if (c.offsetTop <= firstTop + 4) fit++
      else break
    }
    setCap(fit >= total ? total : Math.max(1, fit - 1))
  }, [cap, total])

  const measuring = cap === null
  const partners = expanded || measuring ? step.partners : step.partners.slice(0, cap)
  const hidden = total - partners.length
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:contents">
      {/* Indent lives inside the first grid cell: the levels above render as
          display:contents on sm+, so nesting can't come from their boxes. */}
      <span className={cn('flex min-w-0 items-center', indentClass(depth))}>
        <PalChip id={step.fixed} names={ctx.names} meta={ctx.meta} />
      </span>
      <span className="px-1 text-muted-foreground">+</span>
      <span ref={boxRef} className="flex min-w-0 flex-wrap items-center gap-1">
        {partners.map((f) => (
          <PartnerChip key={comboKey(f)} f={f} ctx={ctx} plain={measuring} />
        ))}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('breeding.showAllPartners', { count: total })}
            title={t('breeding.showAllPartners', { count: total })}
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            +{hidden}
          </button>
        ) : expanded && cap !== null && total > cap ? (
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

/** Compact Pal identity used inside the phone-only route timeline. */
function MobilePalNode({
  id,
  ctx,
  gender,
  emphasis,
  unique,
}: {
  id: string
  ctx: ChainsCtx
  gender?: Combo['bg']
  emphasis?: boolean
  unique?: boolean
}) {
  return (
    <CompactPalNode
      id={id}
      names={ctx.names}
      meta={ctx.meta}
      gender={gender}
      emphasis={emphasis}
      unique={unique}
    />
  )
}

/**
 * One phone-only chain step. The numbered rail makes generation order explicit,
 * while the single-line equation keeps long routes scannable without dropping
 * any Pal identity or partner-expansion behavior.
 */
function MobileChainStep({
  step,
  stepNumber,
  final,
  connected,
  ctx,
}: {
  step: ChainStep
  stepNumber: number
  final: boolean
  connected: boolean
  ctx: ChainsCtx
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [lead, ...rest] = step.partners
  if (!lead) return null
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 pt-1.5">
      <span className="flex min-h-full flex-col items-center" aria-hidden="true">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
          {stepNumber}
        </span>
        {connected ? <span className="mt-1 w-px flex-1 bg-primary/30" /> : null}
      </span>
      <div className={cn('min-w-0', connected && 'pb-2')}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
          <MobilePalNode id={step.fixed} ctx={ctx} />
          <span className="text-sm text-muted-foreground">+</span>
          <div className="relative isolate min-w-0">
            <MobilePalNode id={lead.b} ctx={ctx} gender={lead.bg} unique={lead.unique} />
            {rest.length > 0 ? (
              <button
                type="button"
                data-testid="chain-partners-toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                title={
                  expanded
                    ? t('breeding.collapse')
                    : t('breeding.showAllPartners', { count: step.partners.length })
                }
                aria-label={
                  expanded
                    ? t('breeding.collapse')
                    : t('breeding.showAllPartners', { count: step.partners.length })
                }
                className="absolute -right-1 -top-1 z-[var(--arkive-layer-local-control)] flex size-6 items-center justify-center rounded-full border border-primary/30 bg-background text-xs font-semibold text-primary shadow-sm before:absolute before:-inset-2"
              >
                {expanded ? '−' : `+${rest.length}`}
              </button>
            ) : null}
          </div>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <MobilePalNode id={step.child} ctx={ctx} emphasis={final} />
        </div>
        {expanded ? (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-md bg-muted/50 p-1.5">
            {rest.map((f) => (
              <MobilePalNode key={comboKey(f)} id={f.b} ctx={ctx} gender={f.bg} unique={f.unique} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** One chain entry: a step row per generation. */
function chainKey(chain: BreedChain): string {
  const first = chain.steps[0]
  return `chain:${[first.fixed, ...chain.steps.map((step) => step.child)].join('>')}`
}

function ChainCard({ chain, ctx }: { chain: BreedChain; ctx: ChainsCtx }) {
  return (
    <div
      data-testid="breeding-chain"
      // One grid shared by every step row (rows are `contents` from sm up), so
      // the fixed / + / partners / = / child columns line up across steps
      // regardless of how wide each Pal chip is.
      className="flex flex-col rounded-xl border border-primary/30 bg-card px-2.5 py-2.5 text-sm shadow-sm sm:grid sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-1.5 sm:rounded-lg sm:border-border sm:px-3 sm:py-2 sm:shadow-none"
    >
      {chain.steps.map((s, i) => (
        <Fragment key={s.child}>
          <div className="sm:hidden">
            <MobileChainStep
              step={s}
              stepNumber={i + 1}
              final={i === chain.steps.length - 1}
              connected={i < chain.steps.length - 1}
              ctx={ctx}
            />
          </div>
          <div className="hidden sm:contents">
            <StepRow step={s} final={i === chain.steps.length - 1} ctx={ctx} />
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="mb-2 mt-4 text-lg font-semibold">
      {label} <span className="font-normal text-muted-foreground">({count})</span>
    </h2>
  )
}

/** A capped, expandable list of chain cards under a group header. */
function ChainGroup({
  generation,
  label,
  chains,
  ctx,
  hideHeader = false,
}: {
  generation: number
  label: string
  chains: BreedChain[]
  ctx: ChainsCtx
  hideHeader?: boolean
}) {
  const { t } = useTranslation()
  const [cap, setCap] = useState(GROUP_CAP)
  const mobilePaging = useMobilePagination(chains, { pageSize: 12, resetKey: String(generation) })
  if (chains.length === 0) return null
  return (
    <section data-breeding-generation={generation}>
      {hideHeader ? null : <GroupHeader label={label} count={chains.length} />}
      <div className="grid grid-cols-1 gap-2">
        {(mobilePaging.isMobile ? mobilePaging.visibleItems : chains.slice(0, cap)).map((ch) => {
          return <ChainCard key={chainKey(ch)} chain={ch} ctx={ctx} />
        })}
      </div>
      {mobilePaging.isMobile ? (
        <MobilePagination
          page={mobilePaging.page}
          pageCount={mobilePaging.pageCount}
          onPageChange={mobilePaging.goToPage}
        />
      ) : chains.length > cap ? (
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
      <div className="sm:hidden">
        <MobileChainStep
          step={node.step}
          stepNumber={depth + 1}
          final={node.children.length === 0}
          connected={node.children.length > 0}
          ctx={ctx}
        />
      </div>
      <div className="hidden sm:contents">
        <StepRow step={node.step} final={node.children.length === 0} ctx={ctx} depth={depth} />
      </div>
      {node.children.length > 0 ? <TreeLevel nodes={node.children} depth={depth + 1} ctx={ctx} /> : null}
    </div>
  )
}

// TreeNodeView/TreeLevel recurse into each other (depth ≤ 6 by construction).
function TreeLevel({ nodes, depth, ctx }: { nodes: ChainTreeNode[]; depth: number; ctx: ChainsCtx }) {
  const [cap, setCap] = useState(TREE_CHILD_CAP)
  const shown = nodes.slice(0, cap)
  return (
    // The numbered route rail already communicates depth on phones, so nested
    // levels keep the full card width. sm+ still dissolves into the shared grid,
    // where first-column indentation carries the hierarchy.
    <div className="mt-1 flex flex-col gap-1 sm:contents">
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
function TreeSection({
  generation,
  label,
  count,
  roots,
  ctx,
}: {
  generation: number
  label: string
  count: number
  roots: ChainTreeNode[]
  ctx: ChainsCtx
}) {
  const [cap, setCap] = useState(TREE_ROOT_CAP)
  return (
    <section data-breeding-generation={generation}>
      <GroupHeader label={label} count={count} />
      <div className="flex flex-col gap-2">
        {roots.slice(0, cap).map((n) => (
          <div
            key={n.step.child}
            data-testid="breeding-chain-group"
            className="flex flex-col rounded-xl border border-primary/30 bg-card px-2.5 py-2.5 text-sm shadow-sm sm:grid sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-1.5 sm:rounded-lg sm:border-border sm:px-3 sm:py-2 sm:shadow-none"
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
            generation={g}
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
  hideMultiGroupHeader?: boolean
  /** Favourites wiring for the direct-recipe group (same store as classic mode). */
  favs: Set<string>
  onToggleFav: (key: string) => void
  favLabel: string
  /**
   * Card layout of the direct-recipe group (phones get the square tiles). The
   * multi-generation groups use a numbered route timeline on phones and the
   * shared chip grid from `sm` upward.
   */
  variant: BreedingVariant
}

/**
 * Multi-generation planner results, grouped by chain length: direct recipes
 * (normal recipe cards, favouritable) first, then 2- and 3-generation chains.
 * Remount (via key) on a query change to reset the per-group caps.
 */
export function BreedingChainsView({
  chains,
  favs,
  onToggleFav,
  favLabel,
  variant,
  hideMultiGroupHeader = false,
  ...ctx
}: BreedingChainsViewProps) {
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
  const directPartners = direct?.[0].steps[0].partners ?? []
  const directPaging = useMobilePagination(directPartners, { pageSize: 18, resetKey: 'direct' })
  const multiLengths = [...bySteps.keys()].filter((n) => n > 1).sort((a, b) => a - b)

  return (
    <div className="mt-2">
      {direct ? (
        <section>
          <GroupHeader label={t('breeding.chainDirect')} count={direct[0].steps[0].partners.length} />
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {directPaging.visibleItems.map((f) => {
              const fk = favKey(f)
              return (
                <RecipeCard
                  key={comboKey(f)}
                  f={f}
                  names={ctx.names}
                  meta={ctx.meta}
                  uniqueLabel={ctx.uniqueLabel}
                  fav={{ isFav: favs.has(fk), onToggle: () => onToggleFav(fk), label: favLabel }}
                  variant={variant}
                />
              )
            })}
          </div>
          <MobilePagination
            page={directPaging.page}
            pageCount={directPaging.pageCount}
            onPageChange={directPaging.goToPage}
          />
        </section>
      ) : null}
      {multiLengths.map((n) => (
        <ChainGroup
          key={n}
          generation={n}
          label={t('breeding.chainNGen', { count: n })}
          chains={bySteps.get(n)!}
          ctx={ctx}
          hideHeader={hideMultiGroupHeader}
        />
      ))}
    </div>
  )
}
