# Palworld Pal Stat Formula — every enhancement system, with native-validated ordering

Date: 2026-07-19; passive-skill layer added 2026-07-23. Companion to the data audit. Answers
"how are pal stats enhanced, and what is the formula for any pal?" Constants come from the raw
Blueprint/DataTable export
(`Blueprint/System/BP_PalGameSetting.json` plus DataTables). The calculation order and
rounding were validated against the JMAP and executable in `E:\ue5-unpacker\out\Palworld`.

## The seven enhancement systems

| system | in-game surface | data source | effect |
|---|---|---|---|
| **Level** | EXP (`exp.json` curve) | `StatusCalculate_*` constants | linear per-level growth (below) |
| **IVs / talents** | hidden 0–100 per HP/Attack/Defense | `DT_TalentUpItem` fruits: +10 each | ×(1 + IV × `TalentRate`) |
| **Condense** (Essence Condenser) | stars 0–4 with duplicate pals | `CharacterMaxRank=5`, dupes/star `4/8/12/24` | combat stats: +`StatusCalculate_GenkaiToppa_PerAdd` per star; craft speed: hard-coded +10% per star; partner-skill rank +1/star |
| **Souls** (Statue of Power) | per-stat ranks with Pal Souls | ladder = `DT_CharacterUpgradeMasterDataTable` (20 ranks; `PalUpgradeStone1..4` = Small/Medium/Large/Giant Pal Souls; reset gold per rank) | per-stat multiplier for HP/Attack/Defense/CraftSpeed |
| **Friendship / bond** | trust ranks −3…10 | thresholds `DT_FriendshipRankTable` (rank 1 = 6,000 pts, …); per-rank gains = `DT_PalMonsterParameter` `Friendship_HP/ShotAttack/Defense/CraftSpeed` | flat, species-specific growth is folded into the base before IV and level scaling; only positive ranks apply |
| **Awakening** | element awakening items | `DT_PalAwakeningItemElement`; `AwakeningStatusMultiply` | multiplies only the original combat-stat species base, before friendship and the other enhancement systems |
| **Passive skills / traits** | up to four Pal passives plus applicable partner/contextual effects | `DT_PassiveSkill_Main` `EffectType*`/`EffectValue*`/`TargetType*`; native `PalPassiveSkillComponent` | applicable percentages are aggregated, then multiply the completed permanent-enhancement stat through the `*_withBuff` accessors |

The emitted `pals[].friendship` field is the **bond-rank** growth (the trust system), not the
condenser. The condenser uses a global combat-stat rate and a separate hard-coded craft-speed
rate.

Passive skills are not baked into the unbuffed `GetMaxHP`, `GetShotAttack`, `GetDefense`, or
`GetCraftSpeed` results. They are a final runtime layer in the corresponding `*_withBuff`
accessors, after the permanent enhancement calculations below have finished.

## Inputs and shared base

Let:

- `HP_b`, `ATK_b`, `DEF_b`, and `CS_b` be the species base stats from `pals.json`.
  `ATK_b` is `shotAttack`: in this build, native `GetMeleeAttack` tail-jumps to
  `GetShotAttack`, so both calculated accessors use the shot-attack calculation.
- `L` be level.
- `IV_*` be the 0–100 talent value for each combat stat.
- `Rank` be the stored condenser rank, 1–5. The visible condenser-star count is
  `Stars = Rank - 1`, giving 0–4.
- `Soul_*` be the soul-upgrade rank for each stat.
- `FriendshipRank` be the current trust rank.
- `Awake` indicate whether awakening applies.
- `P_HP`, `P_ATK`, `P_DEF`, and `P_CS` be the passive component's applicable percentage
  totals for `MaxHP`, `ShotAttack`, `Defense`, and `CraftSpeed`, respectively. For ordinary
  active `ToSelf` traits, distinct effect values add; target, invocation, stacking-group, and
  runtime-condition rules are resolved before these totals are returned.

Clamp friendship before using it:

```text
F = max(FriendshipRank, 0)
Stars = Rank - 1
```

For each combat stat, awakening multiplies only the original species base and friendship is
then added:

```text
B' = Base × (Awake ? AwakeningMultiplier : 1)
     + FriendshipGrowth × F
```

Awakening therefore does not multiply friendship growth, flat constants, or the complete
final stat.

## Combat-stat formulas

These formulas produce the unbuffed permanent-enhancement stats. HP truncates after the
level/talent calculation, again after condensation, and again after the soul multiplier:

```text
HP0 = floor(
  ((B'HP × (1 + IV_HP × TalentRate) + TribePlusHP)
    × LevelMultiplierHP × L)
  + ConstantHP
)
HP1 = floor(HP0 × (1 + Stars × CondenseRate))
HP  = floor(HP1 × (1 + Soul_HP × SoulRateHP))
```

Attack follows the same three-stage truncation:

```text
ATK0 = floor(
  B'ATK × (1 + IV_ATK × TalentRate)
  × LevelMultiplierAttack × L
  + ConstantAttack
)
ATK1 = floor(ATK0 × (1 + Stars × CondenseRate))
ATK  = floor(ATK1 × (1 + Soul_ATK × SoulRateAttack))
```

Defense is analogous:

```text
DEF0 = floor(
  B'DEF × (1 + IV_DEF × TalentRate)
  × LevelMultiplierDefense × L
  + ConstantDefense
)
DEF1 = floor(DEF0 × (1 + Stars × CondenseRate))
DEF  = floor(DEF1 × (1 + Soul_DEF × SoulRateDefense))
```

With the exported Blueprint constants, these expand to:

```text
TalentRate           = 0.003
TribePlusHP          = 10
LevelMultiplierHP    = 0.5
ConstantHP           = 500
LevelMultiplierAttack  = 0.075
ConstantAttack         = 100
LevelMultiplierDefense = 0.075
ConstantDefense        = 50
CondenseRate         = 0.05
SoulRateHP/ATK/DEF   = 0.03
AwakeningMultiplier = 1.1
```

`TribePlusHP × LevelMultiplierHP × L` is the familiar `5 × L` HP term.

## Craft-speed formula

Craft speed is level-independent, has its own tribe multiplier, and uses a hard-coded
condenser bonus of 10% per star. It does **not** use the combat-stat
`StatusCalculate_GenkaiToppa_PerAdd` rate.

```text
CraftBase = floor(CS_b + Friendship_CraftSpeed × F)
Craft0    = floor(CraftBase × TribeMultiply_CraftSpeed)
Craft1    = floor(Craft0 × (1 + 0.10 × Stars))
Craft     = floor(Craft1 × (1 + Soul_CS × SoulRateCraft))
```

The raw Blueprint export supplies:

```text
TribeMultiply_CraftSpeed = 0.7
SoulRateCraft            = 0.03
```

As with combat stats, each displayed stage truncates before the next multiplier is applied.

## Passive-skill layer (`*_withBuff`)

Each `EffectValue` is a percentage-point change, not a standalone multiplier. For the usual
static Pal traits, sum the applicable active `ToSelf` effects of the matching type and apply
the result once. For example, `Legend` (`ShotAttack +20`) and `Noukin` / Musclehead
(`ShotAttack +30`) produce `P_ATK = 50`, not `1.2 × 1.3`.

The native passive aggregator clamps the combined multiplier to a minimum of 10%:

```text
M_HP  = max(0.10, 1 + P_HP  / 100)
M_ATK = max(0.10, 1 + P_ATK / 100)
M_DEF = max(0.10, 1 + P_DEF / 100)
M_CS  = max(0.10, 1 + P_CS  / 100)
```

With no other temporary, party, equipment, field, or base-camp buffs active, the
passive-enhanced results are:

```text
trunc_to_0.001(x)       = floor(x × 1000) / 1000
HP_withPassive_native  = trunc_to_0.001(HP × M_HP)
HP_withPassive_integer = floor(HP_withPassive_native)
ATK_withPassive        = floor(ATK × M_ATK)
DEF_withPassive        = floor(DEF × M_DEF)
Craft_withPassive      = floor(Craft × M_CS)
```

HP is the exception to the otherwise integer return path: `GetMaxHP_withBuff` stores the
post-passive value as `FixedPoint64` at 0.001 precision. An integer-only presentation should
truncate that value. Attack, defense, and craft speed return integers and truncate after
applying the passive multiplier.

Only effects that are active for the current context enter `P_*`. A `ToTrainer` effect changes
the player rather than the Pal; neither `ToTrainer` nor `TargetType=None` should be treated as
an automatic Pal self-buff. The native evaluator also folds conditional effects into the
same aggregate when active: attack includes such sources as `AttackRateHPThreshold`,
`BulletHit_StackBuff`, and `DefeatEnemy_StackBuff`; defense analogously includes
`DefenseRateHPThreshold`. A static calculator should include those only when it models their
runtime condition.

`MeleeAttack` is not the passive type for the Pal's displayed Attack line in this build.
`GetMeleeAttack_withBuff` and `GetShotAttack_withBuff` share the same native entry point, which
queries `ShotAttack` (effect type 3).

## Worked example — Anubis

Anubis base stats are HP 100, shot attack 116, and defense 100. At level 60, with perfect
IVs (100), four condenser stars, soul rank 20 in all three stats, no friendship, and no
awakening or stat-changing passives:

```text
HP0 = floor(((100 × 1.3 + 10) × 0.5 × 60) + 500) = 4700
HP1 = floor(4700 × 1.2)                            = 5640
HP  = floor(5640 × 1.6)                            = 9024

ATK0 = floor(116 × 1.3 × 0.075 × 60 + 100) = 778
ATK1 = floor(778 × 1.2)                     = 933
ATK  = floor(933 × 1.6)                     = 1492

DEF0 = floor(100 × 1.3 × 0.075 × 60 + 50) = 635
DEF1 = floor(635 × 1.2)                    = 762
DEF  = floor(762 × 1.6)                    = 1219
```

The intermediate floors are significant: applying one floor only at the end would report
Attack as 1493 instead of the native result, 1492.

Adding `Legend` and Musclehead to that result gives an additive `P_ATK = 20 + 30 = 50` and
`P_DEF = 20`:

```text
ATK_withPassive = floor(1492 × 1.50) = 2238
DEF_withPassive = floor(1219 × 1.20) = 1462
```

## Validation scope and caveat

The executable helpers recovered for this validation were:

```text
HP calculation          0x7ff7ad10ee70
Attack calculation      0x7ff7ad10d790
Defense calculation     0x7ff7ad10ead0
Craft-speed calculation 0x7ff7ad10e690
HP with-buff layer      0x7ff7ad16de10
Attack with-buff layer  0x7ff7ad16dff0
Defense with-buff layer 0x7ff7ad16bd30
Craft with-buff layer   0x7ff7ad16b590
Passive-rate helper     0x7ff7ad16eb30
Passive evaluator       0x7ff7acea3a00
GetMeleeAttack          0x7ff7ad16dfe0 → GetShotAttack 0x7ff7ad170c00
```

The JMAP contains the native `Default__PalGameSetting`, not the loaded
`BP_PalGameSetting`. It and the executable validate how the configurable fields are consumed:
the order of friendship, awakening, talent, level, condensation, souls, passive aggregation,
and truncation. The unbuffed helpers validate the permanent-enhancement formula; the
`*_withBuff` helpers show that passive skills consume its completed result. Blueprint-export
values such as `500`, `0.5`, `0.075`, `0.05`, and `1.1` cannot be independently recovered
from this JMAP.

Do not replace live Blueprint overrides with native fallback defaults seen in the executable
(for example `1.0/100`, `0.2/30`, `0.1`, and `1.5`). The formulas above use the exported
Blueprint constants and the executable-validated calculation order.

Wild-pal *enemy* forms additionally apply the per-species `enemyScaling` multipliers
(`Enemy*Rate`, audit §9), and alpha/boss codenames carry their own stat rows.
