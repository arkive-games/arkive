import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { useSection } from '@/features/characters/CharacterProvider'
import { evaluateLoadout, type Equipment, type Grace, type Loadout } from '@/features/equipment/data'

/** The four 装备 items, by the client's module name. */
const MODULES = ['Equip_Basic', 'Equip_Word', 'Equip_Grow', 'Equip_Suit'] as const
type EquipModule = (typeof MODULES)[number]

const isEquipModule = (module: string): module is EquipModule => (MODULES as readonly string[]).includes(module)

/** Each item's rule in a sentence, under its equation. */
const RULE: Record<EquipModule, string> = {
  Equip_Basic: 'equip.formulaBasic',
  Equip_Word: 'equip.formulaWord',
  Equip_Grow: 'equip.formulaGrow',
  Equip_Suit: 'equip.formulaSuit',
}

/** One item's score as an equation of the loadout's figures, each named. */
function equation(module: EquipModule, loadout: Loadout, t: TFunction): string {
  const n = (value: number) => value.toLocaleString()
  const { totals, results } = loadout
  const sum = (pick: (result: (typeof results)[number]) => number) => results.reduce((acc, result) => acc + pick(result), 0)
  switch (module) {
    case 'Equip_Basic':
      return t('equip.eqBasic', { score: n(totals.base) })
    case 'Equip_Word':
      return t('equip.eqWord', { mark: n(sum((r) => r.affixMark)), bonus: n(sum((r) => r.extraordinaryBonus)), score: n(totals.reforge) })
    case 'Equip_Grow':
      return t('equip.eqGrow', {
        pieces: n(sum((r) => r.enhanceScore)),
        body: n(loadout.bodyTier?.mark ?? 0),
        refine: n(loadout.refineTier?.mark ?? 0),
        score: n(totals.enhance),
      })
    case 'Equip_Suit': {
      const effects = loadout.chosenSuit?.effects ?? []
      if (effects.length === 0) return t('equip.eqSuitNone')
      const parts = effects.map((effect) => t('equip.eqSuitPart', { pieces: effect.pieces, score: n(effect.score) })).join(' + ')
      return t('equip.eqSuit', { parts, score: n(totals.suit) })
    }
  }
}

/**
 * How one of the four 装备 items comes to its score: one equation with the
 * open character's figures, then the rule in a sentence. It reads the loadout
 * the way the equipment section does — the stored draft through
 * `evaluateLoadout` — so the equation always ends on the ledger's number.
 */
function EquipmentFormula({ module, equipment, graces, professionId }: {
  module: EquipModule
  equipment: Equipment
  graces: Grace[]
  professionId: number | null
}) {
  const { t } = useTranslation()
  const [draft] = useSection('equipment')
  const loadout = evaluateLoadout(equipment, graces, draft, professionId)
  return (
    <>
      <div>{equation(module, loadout, t)}</div>
      <p className="mt-1.5 opacity-80">{t(RULE[module])}</p>
    </>
  )
}

/**
 * The score tooltip for one of the 装备 items, or undefined for any other
 * module (and before the equipment data has loaded).
 */
export function equipmentFormula(
  module: string,
  data: { equipment: Equipment; graces: Grace[] } | null,
  professionId: number | null,
): ReactNode | undefined {
  if (!data || !isEquipModule(module)) return undefined
  return <EquipmentFormula module={module} equipment={data.equipment} graces={data.graces} professionId={professionId} />
}
