import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import type { GenusResult, Rating } from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import { FormulaHint } from '@/features/score/FormulaHint'
import { SkillLevelField } from '@/features/score/SkillLevelField'
import { PATHWAY_SKILL_BASE, PATHWAY_SKILL_PER_LEVEL } from '@/features/score/fellowSkill'
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

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const TAB_CLASS = `inline-flex min-h-9 items-center gap-1.5 px-3 ${TYPE.control} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)]`
const BUTTON_CLASS = `inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`

/**
 * The 途径 group: 等级 and 非凡天赋 derived, 途径技能 typed from the panel.
 *
 * 等级 has no Mark anywhere in the package, but the panel always shows it equal
 * to its expected benchmark, so the page scores it as that benchmark at the
 * chosen levels. 途径技能 stays typed: `SkillScoreData` ships as bare ids.
 * 非凡天赋 follows the tree's Marks; see `talents.ts`.
 */
export default function PathwaySection({
  group,
  rating,
  talents,
  professionId,
  draft,
  setDraft,
  onScore,
  skillLevel,
  skillCap,
  relicSkillBonus,
  onSkillLevel,
  talentBenchmark,
}: {
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
  onScore: (speciesId: number, value: number) => void
}) {
  const { t } = useTranslation()

  return (
    <GroupSection
      group={group}
      rating={rating}
      hint={t('pathway.hint')}
      onScore={onScore}
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
        if (item.species.module === SKILL_MODULE) {
          return {
            kind: 'derived',
            calculator: (
              <div data-testid="pathway-skill">
                <SkillLevelField value={skillLevel} cap={skillCap} relicBonus={relicSkillBonus} testId="pathway-skill-level" onChange={onSkillLevel}
                  note={<FormulaHint testId="pathway-skill-formula">{t('pathway.skillFormula', { per: PATHWAY_SKILL_PER_LEVEL, base: PATHWAY_SKILL_BASE })}</FormulaHint>} />
              </div>
            ),
          }
        }
        // The level follows the level inputs: nothing to show beyond its row.
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
  // One column per levelled node, the first left empty: each core sits under
  // the node whose first level switches it on.
  const coreUnder = new Map(result.nodes.filter((entry) => entry.node.type === 'special').map((entry) => [entry.node.parentKey, entry]))
  const special = normal.map((entry) => coreUnder.get(entry.node.key) ?? null)
  const spentFull = result.pointsSpent >= result.pointCap

  return (
    <div className="space-y-3" data-testid="talent-calculator">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border" role="tablist" aria-label={t('pathway.tree')}>
          {trees.map((entry: TalentTree, index) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tree.id}
              onClick={() => setDraft((prev) => ({ ...prev, treeId: entry.id }))}
              className={`${TAB_CLASS} ${index > 0 ? 'border-l border-border' : ''} ${
                entry.id === tree.id
                  ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              data-testid={`talent-tree-${entry.id}`}
            >
              {entry.name}
              <span className="text-muted-foreground">· {entry.tag}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${TYPE.valueMuted} ${spentFull ? 'text-foreground' : ''}`} data-testid="talent-points">
            {t('pathway.points', { spent: result.pointsSpent, cap: result.pointCap })}
          </span>
          {limits ? (
            <span className={TYPE.valueMuted} data-testid="talent-limits">
              {t('pathway.limits', { nodes: limits.nodes, level: limits.levelCap })}
            </span>
          ) : null}
          <button type="button" className={BUTTON_CLASS} onClick={() => fill(true)} data-testid="talent-fill">
            {t('pathway.fill')}
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => fill(false)} data-testid="talent-clear">
            {t('pathway.clear')}
          </button>
        </div>
      </div>
      <p className={TYPE.body}>{tree.description}</p>

      <ul className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
        {normal.map((entry) => (
          <NormalNode key={entry.node.key} entry={entry} onLevel={(level) => setLevel(entry.node.key, Math.min(entry.cap, Math.max(0, level)))} />
        ))}
      </ul>
      <ul className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
        {special.map((entry, index) => entry === null ? <li key={`empty-${index}`} aria-hidden className="hidden xl:block" /> : (
          <li key={entry.node.key} className="rounded-md border border-border bg-background p-2" data-testid={`talent-node-${entry.node.key}`}>
            {/* No choice here: a core switches on when the node above it is learnt. */}
            <div className={`flex items-start gap-2 ${entry.level > 0 ? '' : 'opacity-60'}`}
              data-testid={`talent-special-${entry.node.key}`} data-active={entry.level > 0 || undefined}>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={TYPE.name}>{entry.node.name}</span>
                  <span className={`${TYPE.value} ${entry.level > 0 ? '' : 'text-muted-foreground'}`}>
                    {entry.level > 0 ? `+${entry.node.mark.toLocaleString()}` : t('pathway.inactive')}
                  </span>
                </span>
                <span className={`mt-0.5 block whitespace-pre-line ${TYPE.body}`}>{entry.node.description}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {t('bonds.formulaLabel')}
        <FormulaHint testId="talent-formula">{t('pathway.formula', { normal: normal[0]?.node.mark ?? 180, special: special.find((entry) => entry !== null)?.node.mark ?? 1000 })}</FormulaHint>
      </div>
    </div>
  )
}

function NormalNode({ entry, onLevel }: { entry: TalentNodeResult; onLevel: (level: number) => void }) {
  const { t } = useTranslation()
  const cap = entry.cap
  return (
    <li className={`rounded-md border border-border bg-background p-2 ${entry.locked ? 'opacity-60' : ''}`}
      data-testid={`talent-node-${entry.node.key}`} data-locked={entry.locked || undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate ${TYPE.name}`}>{entry.node.name}</span>
        <span className={TYPE.value} data-testid={`talent-score-${entry.node.key}`}>
          +{entry.score.toLocaleString()}
        </span>
      </div>
      <p className={`truncate ${TYPE.body}`} title={entry.node.description}>{entry.node.description}</p>
      <RangeField
        label={t('pathway.nodeLevel', { name: entry.node.name })}
        min={0}
        max={cap}
        value={entry.level}
        valueText={t('pathway.levelValue', { level: entry.level, max: cap })}
        minLabel="0"
        maxLabel={String(cap)}
        showValue
        testId={`talent-level-${entry.node.key}`}
        onChange={onLevel}
      />
    </li>
  )
}
