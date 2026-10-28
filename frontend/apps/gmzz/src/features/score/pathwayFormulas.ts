// Relative imports, like the rest of `features/score`: the root vitest config has no `@` alias.
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'

import type { Rating, SpeciesResult } from './data'
import { PATHWAY_SKILL_BASE, PATHWAY_SKILL_PER_LEVEL } from './fellowSkill'
import { normalNodes, specialNodes, type TalentLimits, type TalentResult } from './talents'

/** The client's module keys for the 途径 group's items. */
export const LEVEL_MODULE = 'Player_Level'
export const TALENT_MODULE = 'Player_Talent'
export const SKILL_MODULE = 'Player_Skill'

/** What the formulas read besides the item itself: the progression bounds and the scored talent tree. */
export type PathwayFormulaContext = {
  rating: Rating
  talents: TalentResult | null
  limits: TalentLimits | null
}

/**
 * How a 途径 item's score is calculated, with the live numbers: the text of
 * the question mark on its ledger line. Each branch restates what
 * `ScorePage`'s `scores` computes for the module; null for any other module.
 */
export function pathwayFormula(item: SpeciesResult, context: PathwayFormulaContext, t: TFunction): ReactNode {
  const fmt = (value: number) => value.toLocaleString()
  switch (item.species.module) {
    case LEVEL_MODULE: {
      // 等级 = its expected curve at the chosen role and divinity level.
      const { maxRoleLevel, maxDivinityLevel } = context.rating
      return [
        t('pathway.levelNote'),
        t('pathway.levelFormulaLive', { score: fmt(item.score) }),
        t('pathway.levelRange', { maxRole: maxRoleLevel, maxDivinity: maxDivinityLevel }),
      ].join('\n')
    }
    case SKILL_MODULE: {
      // `pathwaySkillScore` either applies `82 × L + 741` or returns the curve's
      // own value. The curve is `82 × cap + 738` wherever the formula applies and
      // never lands on 741 modulo 82 elsewhere, so the score says which it took.
      const head = t('pathway.skillFormula', { per: PATHWAY_SKILL_PER_LEVEL, base: PATHWAY_SKILL_BASE })
      const rest = item.score - PATHWAY_SKILL_BASE
      if (item.score > 0 && rest >= 0 && rest % PATHWAY_SKILL_PER_LEVEL === 0) {
        const live = t('pathway.skillFormulaLive', {
          per: PATHWAY_SKILL_PER_LEVEL, level: rest / PATHWAY_SKILL_PER_LEVEL, base: PATHWAY_SKILL_BASE, score: fmt(item.score),
        })
        return `${head}\n${live}`
      }
      return `${head}\n${t('pathway.skillFormulaCurve', { score: fmt(item.score) })}`
    }
    case TALENT_MODULE: {
      const result = context.talents
      const tree = result?.tree
      const normal = tree ? normalNodes(tree)[0]?.mark ?? 0 : 0
      const special = tree ? specialNodes(tree)[0]?.mark ?? 0 : 0
      const head = t('pathway.formula', { normal: normal || 180, special: special || 1000 })
      if (!result || !tree) return head
      const lines = [
        head,
        t('pathway.formulaLive', { normal, points: result.pointsSpent, special, cores: result.activated, score: fmt(result.total) }),
      ]
      const limits = context.limits
      if (limits) lines.push(t('pathway.limitsTip', { points: limits.points, nodes: limits.nodes, level: limits.levelCap }))
      return lines.join('\n')
    }
    default:
      return null
  }
}
