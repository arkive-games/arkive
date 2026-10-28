import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { GenusResult, Rating } from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import { SkillLevelField } from '@/features/score/SkillLevelField'
import { Stepper } from '@/features/score/Stepper'
import {
  autoAllocate,
  evaluateTalents,
  normalNodes,
  talentLimits,
  treeFor,
  treesFor,
  type TalentDraft,
  type TalentNodeResult,
  type Talents,
  type TalentTree,
} from '@/features/score/talents'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the group's items. */
export const LEVEL_MODULE = 'Player_Level'
export const TALENT_MODULE = 'Player_Talent'
export const SKILL_MODULE = 'Player_Skill'

/**
 * The 途径 group: 等级, 途径技能 and 非凡天赋, all derived.
 *
 * 等级 has no Mark anywhere in the package, but the panel always shows it equal
 * to its expected benchmark, so the page scores it as that benchmark at the
 * chosen levels. 途径技能 follows the shared skill level; see `pathwaySkillScore`.
 * 非凡天赋 follows the tree's Marks; see `talents.ts`.
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

  return (
    <GroupSection
      group={group}
      rating={rating}
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
              <TalentCalculator talents={talents} professionId={professionId} benchmark={talentBenchmark} draft={draft} setDraft={setDraft} />
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
  talents,
  professionId,
  benchmark,
  draft,
  setDraft,
}: {
  talents: Talents
  professionId: number | null
  benchmark: number
  draft: TalentDraft
  setDraft: (update: (prev: TalentDraft) => TalentDraft) => void
}) {
  const { t } = useTranslation()
  const trees = useMemo(() => treesFor(talents, professionId), [talents, professionId])
  const tree = useMemo(() => treeFor(talents, professionId, draft.treeId), [talents, professionId, draft.treeId])
  const limits = useMemo(() => (tree ? talentLimits(tree, benchmark) : null), [tree, benchmark])
  const result = useMemo(() => evaluateTalents(tree, draft.levels, limits), [tree, draft.levels, limits])

  if (!tree) return <p className={TYPE.body}>{t('pathway.noTrees')}</p>

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

  return (
    <div className="gz-tpanel" data-testid="talent-calculator">
      <div className="gz-panel-head">
        <h3>{t('pathway.talents')}</h3>
        <div className="gz-seg" role="tablist" aria-label={t('pathway.tree')}>
          {trees.map((entry: TalentTree) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tree.id}
              onClick={() => setDraft((prev) => ({ ...prev, treeId: entry.id }))}
              className="gz-chip"
              data-testid={`talent-tree-${entry.id}`}
            >
              {entry.name}
              <small>{entry.tag}</small>
            </button>
          ))}
        </div>
        <span className={`meta num ${spentFull ? 'font-bold text-foreground' : ''}`} data-testid="talent-points">
          {t('pathway.points', { spent: result.pointsSpent, cap: result.pointCap })}
        </span>
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
  return (
    <li className={`gz-tcard ${entry.locked ? 'lock' : ''} ${entry.level > 0 ? '' : 'zero'}`}
      data-testid={`talent-node-${entry.node.key}`} data-locked={entry.locked || undefined}>
      <div className="th" title={entry.node.description}>
        <span className="gz-badge num" aria-hidden>{index + 1}</span>
        <b>{entry.node.name}</b>
      </div>
      <Stepper variant="mini" value={entry.level} min={0} max={cap} onChange={onLevel}
        label={t('pathway.nodeLevel', { name: entry.node.name })} testId={`talent-level-${entry.node.key}`} />
      <div className="gz-tl" aria-hidden><i style={{ width: `${filled}%` }} /></div>
      {core ? (
        // No choice here: a core switches on when the node above it is learnt.
        <div className="contents" data-testid={`talent-node-${core.node.key}`}>
          <div className="gz-tc" data-testid={`talent-special-${core.node.key}`} data-active={core.level > 0 || undefined}
            title={core.node.description}>
            <i aria-hidden />
            <b>{core.node.name}</b>
            <em className="num">{core.level > 0 ? `+${core.node.mark.toLocaleString()}` : t('pathway.inactive')}</em>
          </div>
        </div>
      ) : (
        <div className="gz-tc none">{t('pathway.startNode')}</div>
      )}
    </li>
  )
}
