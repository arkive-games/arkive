import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { GenusResult, Rating } from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import { pathwayFormula, TALENT_MODULE } from '@/features/score/pathwayFormulas'
import { SkillLevelField } from '@/features/score/SkillLevelField'
import { Stepper } from '@/features/score/Stepper'
import {
  autoAllocate,
  evaluateTalents,
  normalNodes,
  talentIconUrl,
  talentLimits,
  treeFor,
  treesFor,
  type TalentDraft,
  type TalentLimits,
  type TalentNodeResult,
  type TalentResult,
  type Talents,
  type TalentTree,
} from '@/features/score/talents'
import { Tip, TipOn } from '@/features/score/Tip'
import { TYPE } from '@/lib/typography'

export { LEVEL_MODULE, SKILL_MODULE, TALENT_MODULE } from '@/features/score/pathwayFormulas'

/**
 * The 途径 group: 等级, 途径技能 and 非凡天赋, all derived.
 *
 * 等级 has no Mark anywhere in the package, but the panel always shows it equal
 * to its expected benchmark, so the page scores it as that benchmark at the
 * chosen levels. 途径技能 follows the shared skill level; see `pathwaySkillScore`.
 * 非凡天赋 follows the tree's Marks; see `talents.ts`. How each is calculated
 * is the question mark on its ledger line (`pathwayFormula`).
 *
 * The inputs all three follow -- the pathway, role and divinity level and the
 * shared skill level -- head the group as one bar, above its items.
 */
export default function PathwaySection({
  progression,
  group,
  rating,
  talents,
  professionId,
  draft,
  setDraft,
  skillLevel,
  skillCap,
  relicSkillBonus,
  onSkillLevel,
  talentBenchmark,
}: {
  /** The pathway, role level and divinity level fields, owned by the page. */
  progression: ReactNode
  /** The shared skill level, its cap, and what relics add on top (not scored). */
  skillLevel: number
  skillCap: number | null
  relicSkillBonus: number
  onSkillLevel: (level: number) => void
  /** The 非凡天赋 max benchmark at the current progression: it fixes the points, open nodes and level cap. */
  talentBenchmark: number
  group: GenusResult
  rating: Rating
  talents: Talents | null
  professionId: number | null
  draft: TalentDraft
  setDraft: (update: (prev: TalentDraft) => TalentDraft) => void
}) {
  const { t } = useTranslation()
  // The tree is scored here as well as drawn below, so the ledger's formula
  // reads the same figures the calculator shows.
  const trees = useMemo(() => (talents ? treesFor(talents, professionId) : []), [talents, professionId])
  const tree = useMemo(() => (talents ? treeFor(talents, professionId, draft.treeId) : null), [talents, professionId, draft.treeId])
  const limits = useMemo(() => (tree ? talentLimits(tree, talentBenchmark) : null), [tree, talentBenchmark])
  const result = useMemo(() => (tree ? evaluateTalents(tree, draft.levels, limits) : null), [tree, draft.levels, limits])

  return (
    <GroupSection
      group={group}
      rating={rating}
      formula={(item) => pathwayFormula(item, { rating, talents: result, limits }, t)}
      lead={
        <div className="gz-rolebar" data-testid="pathway-progression">
          {progression}
          <div className="contents" data-testid="pathway-skill">
            <SkillLevelField value={skillLevel} cap={skillCap} relicBonus={relicSkillBonus} testId="pathway-skill-level" onChange={onSkillLevel} />
          </div>
        </div>
      }
      present={(item) => {
        if (item.species.module === TALENT_MODULE) {
          return {
            kind: 'derived',
            calculator: talents ? (
              <TalentCalculator trees={trees} tree={tree} limits={limits} result={result} setDraft={setDraft} />
            ) : (
              <p className={TYPE.body}>{t('pathway.unavailable')}</p>
            ),
          }
        }
        // The level and the pathway skill follow the inputs above: nothing to
        // show beyond their rows.
        return { kind: 'derived' }
      }}
    />
  )
}

/* ----------------------------------------------------------------- talents */

function TalentCalculator({
  trees,
  tree,
  limits,
  result,
  setDraft,
}: {
  trees: TalentTree[]
  tree: TalentTree | null
  limits: TalentLimits | null
  result: TalentResult | null
  setDraft: (update: (prev: TalentDraft) => TalentDraft) => void
}) {
  const { t } = useTranslation()

  if (!tree || !result) return <p className={TYPE.body}>{t('pathway.noTrees')}</p>

  const setLevel = (key: number, level: number) =>
    setDraft((prev) => ({ ...prev, levels: { ...prev.levels, [key]: level } }))
  const fill = (full: boolean) =>
    setDraft((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        ...(full ? autoAllocate(tree, limits) : Object.fromEntries(tree.nodes.map((node) => [node.key, 0]))),
      },
    }))
  const normal = normalNodes(tree).flatMap((node) => result.nodes.filter((entry) => entry.node.key === node.key))
  // Each core sits in the card of the node whose first level switches it on;
  // the first node has none.
  const coreUnder = new Map(result.nodes.filter((entry) => entry.node.type === 'special').map((entry) => [entry.node.parentKey, entry]))
  const special = normal.map((entry) => coreUnder.get(entry.node.key) ?? null)
  const spentFull = result.pointsSpent >= result.pointCap
  const pointsText = t('pathway.points', { spent: result.pointsSpent, cap: result.pointCap })
  const points = (
    <span className={`meta num ${spentFull ? 'font-bold text-foreground' : ''} ${limits ? 'gz-hov' : ''}`}
      tabIndex={limits ? 0 : undefined} data-testid="talent-points">
      {pointsText}
    </span>
  )

  return (
    <div className="gz-tpanel" data-testid="talent-calculator">
      <div className="gz-panel-head">
        <h3 className="flex items-center gap-1">
          {t('pathway.talents')}
          {tree.description ? (
            <Tip kind="info" content={tree.description} title={tree.name} label={t('pathway.treeInfo')} testId="talent-tree-info" />
          ) : null}
        </h3>
        <div className="gz-seg" role="tablist" aria-label={t('pathway.tree')}>
          {trees.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tree.id}
              onClick={() => setDraft((prev) => ({ ...prev, treeId: entry.id }))}
              className="gz-chip"
              data-testid={`talent-tree-${entry.id}`}
            >
              {entry.icon ? <img className="gz-ttab" src={talentIconUrl(entry.icon)} alt="" loading="lazy" /> : null}
              {entry.name}
              <small>{entry.tag}</small>
            </button>
          ))}
        </div>
        {limits ? (
          <TipOn title={pointsText} content={t('pathway.limitsTip', { points: limits.points, nodes: limits.nodes, level: limits.levelCap })}>
            {points}
          </TipOn>
        ) : points}
        <div className="acts">
          <button type="button" className="gz-chip" onClick={() => fill(true)} data-testid="talent-fill">
            {t('pathway.fill')}
          </button>
          <button type="button" className="gz-chip" onClick={() => fill(false)} data-testid="talent-clear">
            {t('pathway.clear')}
          </button>
        </div>
      </div>
      <ol className="gz-tree">
        {normal.map((entry, index) => (
          <TalentCard key={entry.node.key} index={index} entry={entry} core={special[index]}
            onLevel={(level) => setLevel(entry.node.key, Math.min(entry.cap, Math.max(0, level)))} />
        ))}
      </ol>
    </div>
  )
}

/** One levelled talent and, under it, the core its first level switches on. */
function TalentCard({ index, entry, core, onLevel }: {
  index: number
  entry: TalentNodeResult
  core: TalentNodeResult | null
  onLevel: (level: number) => void
}) {
  const { t } = useTranslation()
  const cap = entry.cap
  const filled = cap > 0 ? Math.round((entry.level / cap) * 100) : 0
  const nodeTip = [
    entry.node.description,
    t('pathway.nodeScore', { mark: entry.node.mark, level: entry.level, score: entry.score.toLocaleString() }),
  ].filter(Boolean).join('\n')
  return (
    <li className={`gz-tcard ${entry.locked ? 'lock' : ''} ${entry.level > 0 ? '' : 'zero'}`}
      data-testid={`talent-node-${entry.node.key}`} data-locked={entry.locked || undefined}>
      <div className="th">
        {entry.node.icon ? (
          <img className="gz-ticon" src={talentIconUrl(entry.node.icon)} alt="" loading="lazy" />
        ) : (
          <span className="gz-badge num" aria-hidden>{index + 1}</span>
        )}
        <TipOn title={entry.node.name} content={nodeTip}>
          <b className="gz-hov" tabIndex={0} data-testid={`talent-tip-${entry.node.key}`}>{entry.node.name}</b>
        </TipOn>
      </div>
      <Stepper variant="mini" value={entry.level} min={0} max={cap} onChange={onLevel}
        label={t('pathway.nodeLevel', { name: entry.node.name })} testId={`talent-level-${entry.node.key}`} />
      <div className="gz-tl" aria-hidden><i style={{ width: `${filled}%` }} /></div>
      {core ? (
        // No choice here: a core switches on when the node above it is learnt.
        <div className="contents" data-testid={`talent-node-${core.node.key}`}>
          <div className={`gz-tc ${core.node.icon ? 'ic' : ''}`} data-testid={`talent-special-${core.node.key}`}
            data-active={core.level > 0 || undefined}>
            {core.node.icon ? <img src={talentIconUrl(core.node.icon)} alt="" loading="lazy" /> : <i aria-hidden />}
            <TipOn title={core.node.name} content={[
              core.node.description,
              t('pathway.coreScore', { parent: entry.node.name, mark: core.node.mark.toLocaleString() }),
            ].filter(Boolean).join('\n')}>
              <b className="gz-hov" tabIndex={0} data-testid={`talent-tip-${core.node.key}`}>{core.node.name}</b>
            </TipOn>
            <em className="num">{core.level > 0 ? `+${core.node.mark.toLocaleString()}` : t('pathway.inactive')}</em>
          </div>
        </div>
      ) : (
        <div className="gz-tc none">{t('pathway.startNode')}</div>
      )}
    </li>
  )
}
