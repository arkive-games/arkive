import type { EstherMeta } from '@/lib/statPanels'
import { Field } from './Fields'
import { plainText } from './RichText'
import { SearchSelect } from './SearchSelect'

/**
 * The Esther (神选英雄) weapon picker, labelled with the real weapon names.
 *
 * BattlePoint Type 23 already supplied the amps, so the calculator offered six bare
 * percentages. `ValueB` is an `ItemEvolutionCommon.EstherOptionId`, and a four-table
 * join turns it into a weapon a player recognises:
 *
 *     EstherOptionId -> ItemEvolutionCommon -> ItemQualityOption.EvolutionCommonId
 *                    -> Item.QualityOptionId  (29 class weapons, Grade 7)
 *
 * Four generations, two scored evolution stages each (6 and 8 — the only stages that
 * grant an Esther option), so eight rows for the selected class. A Berserker sees
 * 山之浩劫 / ·崇天 / ·无垠 / ·庄严.
 *
 * **Generations 3 and 4 share an option id**, because the client routes generation
 * 4's stages 100-109 through generation 3's evolution track. Their amps are
 * identical, so scoring is unaffected, but a stored `chosenWeaponId` cannot say which
 * of the two was picked — the trigger shows the lower generation. Labelling both
 * rows anyway is the honest reading: they are two different weapons that score the
 * same.
 *
 * 29 classes have an Esther weapon and the class list has 29 entries, so a class with
 * no weapon means the extraction changed rather than that the game lacks one; the
 * picker falls back to the generation number in that case instead of showing a blank.
 */
export function EstherWeaponField({
  meta,
  names,
  classId,
  role,
  value,
  onChange,
}: {
  meta: EstherMeta
  names: Record<string, string>
  classId: number
  role: 'dps' | 'support'
  /** The selected `EstherOptionId`; '' for an ordinary weapon. */
  value: string
  onChange: (value: string) => void
}) {
  const label = plainText(names[meta.uiKeys.title] ?? '')
  const none = plainText(names[meta.uiKeys.none] ?? '')
  const stageTemplate = names[meta.uiKeys.stage] ?? '{0}'

  // Option values are `<generation>:<EstherOptionId>` rather than the bare id,
  // because generations 3 and 4 share one and a list cannot hold the same value
  // twice. The loadout still stores the bare id -- it is what
  // `chosen_weapon_values` is keyed by -- so `current` re-attaches a generation to
  // it, picking the lower one when two match.
  const options = meta.generations.flatMap((generation) => {
    const weapon = generation.weapons[String(classId)]
    const weaponName = weapon
      ? plainText(names[weapon.name_key] ?? weapon.name_key)
      : `#${generation.index}`
    return generation.stages.map((stage) => ({
      value: `${generation.index}:${stage.esther_option_id}`,
      label: `${weaponName} · ${stageTemplate.replace('{0}', String(stage.stage))}`,
      search: `${generation.index} ${stage.stage} ${stage.esther_option_id}`,
      meta: (
        <span className="shrink-0 text-xs tabular-nums text-accent">
          +{(stage.amp[role] * 100).toFixed(2)}%
        </span>
      ),
    }))
  })
  const current = value
    ? (options.find((o) => o.value.endsWith(`:${value}`))?.value ?? '')
    : ''

  return (
    <Field label={label || '神选武器'}>
      <SearchSelect
        ariaLabel={label || '神选武器'}
        options={options}
        value={current}
        onChange={(v) => onChange(v ? v.slice(v.indexOf(':') + 1) : '')}
        labels={{
          empty: none || '普通武器',
          search: label || '神选武器',
          notFound: none || '—',
        }}
      />
    </Field>
  )
}
