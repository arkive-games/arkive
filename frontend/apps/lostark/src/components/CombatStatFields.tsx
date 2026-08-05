import type { CombatStatMeta } from '@/lib/statPanels'
import { NumberField } from './Fields'
import { plainText } from './RichText'

/**
 * Combat traits (战斗特性), one input per trait the current role actually scores.
 *
 * `rates` is `RoleCoefficients.combat_stat_rates` — BattlePoint **Type 26**, named
 * `battlestat` by the enum bijection in `tools/apps/lostark/combatstats.py`. Its
 * `ValueA` is the trait index 1-6 (anchored by `ArkPassive` nodes 1010100…1010600,
 * which grant global stats 15…20 under those very names) and its `ValueB` is the
 * rate x 1e-4.
 *
 * So the client says: a damage dealer scores 会心 + 专长 + 迅捷 at 0.0003 a point,
 * a support scores 专长 + 迅捷 at 0.0004. Both rates and both splits are the fan
 * site's, which is what makes the decode a reading rather than a guess — but the
 * fan site also added a fixed base of 2160 points, and **that is not in the
 * client**: every Type 26 row leaves `ValueC` at zero. The game reads the character's
 * real trait totals, so this asks for those instead of for a roster-only delta.
 *
 * A trait with no rate for the role is not rendered. 压制 / 忍耐 / 异化 score
 * nothing for either role, and 会心 nothing for a support; that is data, not a gap.
 */
export function CombatStatFields({
  meta,
  names,
  rates,
  values,
  onChange,
}: {
  meta: CombatStatMeta
  names: Record<string, string>
  /** Trait index -> combat power per point, for the current role. */
  rates: Record<string, number>
  /** Trait index -> the character's total for that trait. */
  values: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const scoring = meta.stats.filter((s) => rates[String(s.index)] !== undefined)
  const amp = scoring.reduce(
    (sum, s) => sum + (values[String(s.index)] ?? 0) * (rates[String(s.index)] ?? 0),
    0,
  )

  return (
    <>
      <p className="text-sm text-muted-foreground">
        请填写角色面板上的战斗特性总值（并非只填远征队加成）：游戏按实际数值计分，
        每点 {(scoring[0] ? rates[String(scoring[0].index)] * 10000 : 0).toFixed(0)} / 10000。
      </p>
      {scoring.map((stat) => (
        <NumberField
          key={stat.index}
          label={plainText(names[stat.name_key] ?? stat.key)}
          value={values[String(stat.index)] ?? 0}
          min={0}
          max={99999}
          onChange={(v) => onChange({ ...values, [String(stat.index)]: v })}
        />
      ))}
      <p className="text-sm text-muted-foreground">
        战斗特性合计 +{(amp * 100).toFixed(2)}%。
      </p>
    </>
  )
}
