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
 * How a 途径 item comes to its score, as one equation with the live figures
 * named: the score's tooltip on its ledger line. Each branch restates what
 * `ScorePage`'s `scores` computes for the module; null for any other module.
 */
export function pathwayFormula(item: SpeciesResult, context: PathwayFormulaContext, t: TFunction): ReactNode {
  const fmt = (value: number) => value.toLocaleString()
  switch (item.species.module) {
    case LEVEL_MODULE:
      // 等级 = its expected curve at the chosen role and divinity level.
      return t('pathway.eqLevel', { score: fmt(item.score) })
    case SKILL_MODULE: {
      // `pathwaySkillScore` either applies `82 × L + 741` or returns the curve's
      // own value. The curve is `82 × cap + 738` wherever the formula applies and
      // never lands on 741 modulo 82 elsewhere, so the score says which it took.
      const rule = t('pathway.skillFormula', { per: PATHWAY_SKILL_PER_LEVEL, base: PATHWAY_SKILL_BASE })
      const rest = item.score - PATHWAY_SKILL_BASE
      if (item.score > 0 && rest >= 0 && rest % PATHWAY_SKILL_PER_LEVEL === 0) {
        return [t('pathway.eqSkill', {
          per: PATHWAY_SKILL_PER_LEVEL, level: rest / PATHWAY_SKILL_PER_LEVEL, base: PATHWAY_SKILL_BASE, score: fmt(item.score),
        }), rule].join('\n\n')
      }
      return [t('pathway.eqSkillCurve', { score: fmt(item.score) }), rule].join('\n\n')
    }
    case TALENT_MODULE: {
      const result = context.talents
      const tree = result?.tree
      const normal = tree ? normalNodes(tree)[0]?.mark ?? 0 : 0
      const special = tree ? specialNodes(tree)[0]?.mark ?? 0 : 0
      return [t('pathway.eqTalent', {
        normal: normal || 180, points: result?.pointsSpent ?? 0,
        special: special || 1000, cores: result?.activated ?? 0,
        score: fmt(result?.total ?? item.score),
      }), t('pathway.formula', { normal: normal || 180, special: special || 1000 })].join('\n\n')
    }
    default:
      return null
  }
}
