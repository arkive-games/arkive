import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useSection } from '@/features/characters/CharacterProvider'
import { evaluateLoadout, REFINE_LEVELS, type Equipment, type Grace } from '@/features/equipment/data'

/** The four 装备 items, by the client's module name. */
const MODULES = ['Equip_Basic', 'Equip_Word', 'Equip_Grow', 'Equip_Suit'] as const
type EquipModule = (typeof MODULES)[number]

const isEquipModule = (module: string): module is EquipModule => (MODULES as readonly string[]).includes(module)

/**
 * How one of the four 装备 items is worked out, with the open character's
 * own figures: the rule in a sentence, then each piece's part and the sum.
 *
 * It reads the loadout the same way the equipment section does — the stored
 * draft through `evaluateLoadout` — so the lines always add up to the score on
 * the ledger, whether or not the section is on screen.
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
  const slotName = (slot: number) => equipment.slots.find((entry) => entry.id === slot)?.name ?? ''
  const worn = loadout.results.filter((result) => result.item !== null)
  const n = (value: number) => value.toLocaleString()
  const { totals } = loadout

  let rule: string
  let lines: string[]
  let sum: number
  switch (module) {
    case 'Equip_Basic':
      rule = t('equip.formulaBasic')
      lines = worn.map((result) => t('equip.formulaPiece', { slot: slotName(result.state.slot), name: result.item?.name, value: n(result.baseScore) }))
      sum = totals.base
      break
    case 'Equip_Grow': {
      rule = t('equip.formulaGrow')
      lines = worn.map((result) => t('equip.formulaPieceRefine', {
        slot: slotName(result.state.slot), level: result.refineLevel, max: REFINE_LEVELS, value: n(result.enhanceScore),
      }))
      const { bodyTier, refineTier } = loadout
      lines.push(bodyTier
        ? t('equip.formulaBody', { stage: bodyTier.requiredStage ?? 0, mark: n(bodyTier.mark ?? 0) })
        : t('equip.formulaNoSet', { name: t('equip.bodyBonus') }))
      const percent = loadout.averagePercent.toLocaleString(undefined, { maximumFractionDigits: 2 })
      lines.push(refineTier
        ? t('equip.formulaRefineSet', { percent, mark: n(refineTier.mark ?? 0) })
        : t('equip.formulaNoSet', { name: t('equip.refineAverage', { percent }) }))
      sum = totals.enhance
      break
    }
    case 'Equip_Word':
      rule = t('equip.formulaWord')
      lines = worn
        .filter((result) => result.affixes.length > 0)
        .map((result) => t('equip.formulaPieceWord', {
          slot: slotName(result.state.slot), mark: n(result.affixMark), bonus: n(result.extraordinaryBonus), value: n(result.reforgeScore),
        }))
      sum = totals.reforge
      break
    case 'Equip_Suit': {
      rule = t('equip.formulaSuit')
      const chosen = loadout.chosenSuit
      lines = chosen
        ? [
            chosen.suit.fullName || chosen.suit.name,
            ...chosen.effects.map((effect) => {
              const formula = equipment.suits.levelScores?.[String(chosen.suit.pieceCounts.indexOf(effect.pieces) + 1)]
              return t('equip.formulaSuitEffect', {
                pieces: effect.pieces, perLevel: formula?.perLevel ?? '—', level: effect.gearLevel, origin: formula?.origin ?? '—', score: n(effect.score),
              })
            }),
          ]
        : [t('equip.formulaNoSuit')]
      sum = totals.suit
      break
    }
  }
  if (worn.length === 0) lines = [t('equip.formulaEmpty')]
  return (
    <>
      <div>{rule}</div>
      <div className="mt-1.5">{lines.join('\n')}</div>
      <div className="mt-1.5 font-semibold">{t('equip.formulaTotal', { value: n(sum) })}</div>
    </>
  )
}

/**
 * The formula mark's content for one of the 装备 items, or undefined for any
 * other module (and before the equipment data has loaded). Everything it needs
 * is on the score page: the loaded equipment dataset with its graces, and the
 * character's pathway; the loadout itself is read from the open character.
 */
export function equipmentFormula(
  module: string,
  data: { equipment: Equipment; graces: Grace[] } | null,
  professionId: number | null,
): ReactNode | undefined {
  if (!data || !isEquipModule(module)) return undefined
  return <EquipmentFormula module={module} equipment={data.equipment} graces={data.graces} professionId={professionId} />
}
