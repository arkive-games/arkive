import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useSection } from '@/features/characters/CharacterProvider'
import { knowledgeLevelOf, restoreSlots } from '@/features/relics/slots'
import {
  currentSeason, evaluateRelicSlot, gradeRung, k1For, k2For, relicTotals, resonanceLadder,
  type Relics, type RelicServer, type RelicSlotResult,
} from '@/features/relics/data'

/** The three 封印物 ledger items, by the client's module name. */
const MODULES = ['Relics_Basic', 'Relics_Main', 'Relics_Word'] as const
type RelicModule = (typeof MODULES)[number]

/** Everything the three formulas interpolate: the relics as the stored draft scores them. */
export type RelicFormulaContext = {
  relics: Relics
  knowledgeLevel: number
  k1: number
  k2: number
  server: RelicServer
  season: number | undefined
  results: RelicSlotResult[]
}

/**
 * The relics as the stored draft scores them, read the same way the relic
 * section reads them, for the formula hints of the page's ledger. Null until
 * the relic dataset has loaded.
 */
export function useRelicFormulaContext(relics: Relics | null): RelicFormulaContext | null {
  const [draft] = useSection('relics')
  return useMemo(() => {
    if (!relics) return null
    const season = currentSeason(relics)
    const knowledgeLevel = knowledgeLevelOf(relics, draft.knowledgeLevel, season)
    const server = draft.server ?? 'local'
    const results = restoreSlots(relics, draft.slots).map((slot) => evaluateRelicSlot(relics, slot, knowledgeLevel, season, server))
    return {
      relics, knowledgeLevel, season, server, results,
      k1: k1For(relics, knowledgeLevel, season),
      k2: k2For(relics, knowledgeLevel, season),
    }
  }, [relics, draft])
}

/** A part to two decimals, as the relic cards show it; the floor comes once, on the sum. */
const decimal = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
/** A knowledge coefficient as the game prints it: k 0.88 reads 880%. */
const percent = (k: number) => `${Number((k * 1000).toFixed(1))}%`

function RelicFormula({ module, ctx }: { module: RelicModule; ctx: RelicFormulaContext }) {
  const { t } = useTranslation()
  const { relics, results, k1, k2, knowledgeLevel: level, season, server } = ctx
  const totals = relicTotals(results)
  const group = (result: RelicSlotResult) => relics.groupNames[String(result.state.groupId)] ?? ''

  let head: string
  let k: string
  let lines: string[]
  let sum: number
  let total: number
  if (module === 'Relics_Basic') {
    head = t('relic.formulaAssembly')
    k = t('relic.formulaK2', { k: k2, pct: percent(k2), level })
    lines = results.map((result) => t('relic.formulaLineAssembly', {
      group: group(result), grade: result.resonanceGrade,
      mark: (gradeRung(relics, result.resonanceGrade)?.mark ?? 0).toLocaleString(), k: k2, value: decimal(result.assemblyScore),
    }))
    sum = results.reduce((acc, result) => acc + result.assemblyScore, 0)
    total = totals.assembly
  } else if (module === 'Relics_Main') {
    head = t('relic.formulaResonance')
    k = t('relic.formulaK1', { k: k1, pct: percent(k1), level })
    lines = results.map((result) => {
      const source = result.materials.find((material) => material.resonates)
      const n = source?.activeCount ?? 0
      const rung = resonanceLadder(relics, result.state.groupId, result.resonanceGrade, season).find((r) => r.affixCount === n)
      return t('relic.formulaLineResonance', {
        group: group(result), grade: result.resonanceGrade, n,
        mark: (rung?.mark ?? 0).toLocaleString(), k: k1, value: decimal(result.resonanceScore),
      })
    })
    sum = results.reduce((acc, result) => acc + result.resonanceScore, 0)
    total = totals.resonance
  } else {
    head = t('relic.formulaAffix')
    k = t('relic.formulaK2', { k: k2, pct: percent(k2), level })
    lines = results.map((result) => {
      // The Marks that score: affixes in effect, on materials in effect.
      const marks = result.materials.flatMap((material) => (material.applies
        ? material.affixes.flatMap((affix, at) => (material.inactive[at] || affix.stat === '' ? [] : [affix.mark]))
        : []))
      return t('relic.formulaLineAffix', {
        group: group(result), marks: marks.length > 0 ? marks.map((mark) => mark.toLocaleString()).join(' + ') : '0',
        k: k2, value: decimal(result.affixScore),
      })
    })
    sum = results.reduce((acc, result) => acc + result.affixScore, 0)
    total = totals.affix
  }

  return (
    <div className="space-y-1" data-testid={`relic-formula-${module}`}>
      <p>{head}</p>
      <p>{k}</p>
      {module !== 'Relics_Word' && server === 'local' ? <p>{t('relic.formulaLocal')}</p> : null}
      <p className="tabular-nums">
        {lines.map((line, at) => <span key={at} className="block">{line}</span>)}
        <span className="block font-semibold">{t('relic.formulaSum', { sum: decimal(sum), total: total.toLocaleString() })}</span>
      </p>
    </div>
  )
}

/**
 * How one of the three 封印物 ledger items is calculated, with the stored
 * relics' own numbers in it; undefined for any other module, or before the
 * relic dataset has loaded.
 */
export function relicFormula(module: string, ctx: RelicFormulaContext | null): ReactNode | undefined {
  if (!ctx || !(MODULES as readonly string[]).includes(module)) return undefined
  return <RelicFormula module={module as RelicModule} ctx={ctx} />
}
