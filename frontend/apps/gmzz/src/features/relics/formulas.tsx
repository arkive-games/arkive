import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useSection } from '@/features/characters/CharacterProvider'
import { knowledgeLevelOf, restoreSlots } from '@/features/relics/slots'
import {
  currentSeason, efficiencyPercent, evaluateRelicSlot, gradeRung, k1For, k2For, relicTotals, resonanceLadder,
  type Relics, type RelicServer, type RelicSlotResult,
} from '@/features/relics/data'

/** The three 封印物 ledger items, by the client's module name. */
const MODULES = ['Relics_Basic', 'Relics_Main', 'Relics_Word'] as const
type RelicModule = (typeof MODULES)[number]

/** Everything the three equations name: the relics as the stored draft scores them. */
export type RelicFormulaContext = {
  relics: Relics
  server: RelicServer
  k1: number
  k2: number
  season: number | undefined
  results: RelicSlotResult[]
}

/**
 * The relics as the stored draft scores them, read the same way the relic
 * section reads them, for the score tooltips of the page's ledger. Null until
 * the relic dataset has loaded.
 */
export function useRelicFormulaContext(relics: Relics | null, actingLevel?: number): RelicFormulaContext | null {
  const [draft] = useSection('relics')
  return useMemo(() => {
    if (!relics) return null
    const season = currentSeason(relics)
    const knowledgeLevel = knowledgeLevelOf(relics, draft.knowledgeLevel, season, actingLevel)
    const server = draft.server ?? 'local'
    const results = restoreSlots(relics, draft.slots).map((slot) => evaluateRelicSlot(relics, slot, knowledgeLevel, season, server))
    return {
      relics, season, results, server,
      k1: k1For(relics, knowledgeLevel, season),
      k2: k2For(relics, knowledgeLevel, season),
    }
  }, [relics, draft, actingLevel])
}

/**
 * One item's score as an equation: the Marks in effect summed over the three
 * relics, times the knowledge coefficient, rounded down once.
 */
function relicEquation(module: RelicModule, ctx: RelicFormulaContext, t: TFunction): string {
  const { relics, results, k1, k2, season } = ctx
  const totals = relicTotals(results)
  if (module === 'Relics_Basic') {
    const marks = results.reduce((acc, result) => acc + (gradeRung(relics, result.resonanceGrade)?.mark ?? 0), 0)
    return t('relic.eqAssembly', { marks: marks.toLocaleString(), pct: efficiencyPercent(k2), score: totals.assembly.toLocaleString() })
  }
  if (module === 'Relics_Main') {
    const marks = results.reduce((acc, result) => {
      const count = result.materials.find((material) => material.resonates)?.activeCount ?? 0
      const rung = resonanceLadder(relics, result.state.groupId, result.resonanceGrade, season).find((r) => r.affixCount === count)
      return acc + (rung?.mark ?? 0)
    }, 0)
    return t('relic.eqResonance', { marks: marks.toLocaleString(), pct: efficiencyPercent(k1), score: totals.resonance.toLocaleString() })
  }
  // The Marks that score: affixes in effect, on materials in effect.
  const marks = results.reduce((acc, result) => acc + result.materials.reduce((inner, material) => inner + (material.applies
    ? material.affixes.reduce((m, affix, at) => m + (material.inactive[at] || affix.stat === '' ? 0 : affix.mark), 0)
    : 0), 0), 0)
  return t('relic.eqAffix', { marks: marks.toLocaleString(), pct: efficiencyPercent(k2), score: totals.affix.toLocaleString() })
}

const RULE: Record<RelicModule, string> = {
  Relics_Basic: 'relic.formulaAssembly',
  Relics_Main: 'relic.formulaResonance',
  Relics_Word: 'relic.formulaAffix',
}

/** The equation, then the rule, and the local-server grade note where it applies. */
function RelicFormula({ module, ctx }: { module: RelicModule; ctx: RelicFormulaContext }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5" data-testid={`relic-formula-${module}`}>
      <p>{relicEquation(module, ctx, t)}</p>
      <p className="opacity-80">{t(RULE[module])}</p>
      {module !== 'Relics_Word' && ctx.server === 'local' ? <p className="opacity-80">{t('relic.formulaLocal')}</p> : null}
    </div>
  )
}

/** The score tooltip for one of the 封印物 items; undefined for any other module, or before the data loads. */
export function relicFormula(module: string, ctx: RelicFormulaContext | null): ReactNode | undefined {
  if (!ctx || !(MODULES as readonly string[]).includes(module)) return undefined
  return <RelicFormula module={module as RelicModule} ctx={ctx} />
}
