import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@gamemap/ui'
import {
  comboKey,
  palIconUrl,
  recipesToBreed,
  resolveNode,
  type BreedingEngine,
  type BreedTreeNode,
  type Combo,
  type NameMap,
  type TreePath,
} from '../../lib/breeding'
import { RecipeCard, type RecipeMeta } from './RecipeCard'

// Recipes shown per "how to breed X" section before the show-more button;
// each click reveals another batch.
const SECTION_CAP = 12

interface TreeCtx {
  engine: BreedingEngine
  index: Map<string, Combo[]>
  names: NameMap
  meta: RecipeMeta
  uniqueLabel: string
  selectLabel: string
  /** Replace the subtree at `path` (`undefined` collapses it). */
  onChange: (path: TreePath, sub: BreedTreeNode | undefined) => void
}

/** A clicked recipe becomes the tree node it drills into. */
const toNode = (f: Combo): BreedTreeNode => ({ a: f.a, b: f.b, ag: f.ag, bg: f.bg })

/**
 * "How to breed <pal>": the chosen recipe's subtree when one is picked, else
 * the clickable recipe list for this Pal (capped, expandable). `slot` is which
 * parent of the node above this section explains.
 */
function ParentSection({
  palId,
  chosen,
  path,
  ctx,
}: {
  palId: string
  chosen?: BreedTreeNode
  path: TreePath
  ctx: TreeCtx
}) {
  const { t } = useTranslation()
  const [cap, setCap] = useState(SECTION_CAP)
  const recipes = recipesToBreed(ctx.index, palId)
  const icon = ctx.meta.get(palId)?.icon

  return (
    <div className="mt-2 border-l-2 border-border pl-3 sm:ml-1 sm:pl-4">
      <div className="flex items-center gap-1.5 py-1 text-sm font-medium">
        {icon ? (
          <img
            src={palIconUrl(icon)}
            alt=""
            loading="lazy"
            className="size-5 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10"
          />
        ) : null}
        <span>{t('breeding.howToBreed', { name: ctx.names[palId] ?? palId })}</span>
        {!chosen ? <span className="text-xs font-normal text-muted-foreground">({recipes.length})</span> : null}
      </div>
      {chosen ? (
        <NodeView node={chosen} path={path} ctx={ctx} />
      ) : recipes.length === 0 ? (
        <div className="py-1 text-sm text-muted-foreground">{t('breeding.selfOnly')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recipes.slice(0, cap).map((f) => (
              <RecipeCard
                key={comboKey(f)}
                f={f}
                names={ctx.names}
                meta={ctx.meta}
                uniqueLabel={ctx.uniqueLabel}
                hideResult
                onSelect={() => ctx.onChange(path, toNode(f))}
                selectLabel={ctx.selectLabel}
              />
            ))}
          </div>
          {recipes.length > cap ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-muted-foreground"
              onClick={() => setCap((c) => c + SECTION_CAP)}
            >
              {t('breeding.showMoreRecipes', { count: Math.min(SECTION_CAP, recipes.length - cap) })}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

/** One focused recipe: the card (with collapse ×) plus a section per parent. */
function NodeView({ node, path, ctx }: { node: BreedTreeNode; path: TreePath; ctx: TreeCtx }) {
  const { t } = useTranslation()
  // The sanitizer prunes invalid nodes on load; this guard only covers the
  // brief render between a data/locale swap and that effect.
  const combo = resolveNode(ctx.engine, node)
  if (!combo) return null

  return (
    <div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 sm:max-w-xl">
          <RecipeCard f={combo} names={ctx.names} meta={ctx.meta} uniqueLabel={ctx.uniqueLabel} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('breeding.collapse')}
          title={t('breeding.collapse')}
          onClick={() => ctx.onChange(path, undefined)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ParentSection palId={node.a} chosen={node.l} path={[...path, 'l']} ctx={ctx} />
      <ParentSection palId={node.b} chosen={node.r} path={[...path, 'r']} ctx={ctx} />
    </div>
  )
}

/**
 * Tree mode of the breeding calculator: the clicked recipe pinned at the top,
 * and below it — recursively — how to breed each of its parents. Lives in the
 * `?tree=` search param (managed by the page via `onChange`).
 */
export function BreedingTreeView({
  root,
  engine,
  index,
  names,
  meta,
  uniqueLabel,
  selectLabel,
  onChange,
}: Omit<TreeCtx, 'onChange'> & {
  root: BreedTreeNode
  onChange: TreeCtx['onChange']
}) {
  const ctx: TreeCtx = { engine, index, names, meta, uniqueLabel, selectLabel, onChange }
  return (
    <div className="mt-2">
      <NodeView node={root} path={[]} ctx={ctx} />
    </div>
  )
}
