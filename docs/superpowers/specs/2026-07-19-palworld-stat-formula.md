# Palworld Pal Stat Formula — every enhancement system, with native-validated ordering

Date: 2026-07-19. Companion to the data audit. Answers "how are pal stats enhanced, and what
is the formula for any pal?" Constants come from the raw Blueprint/DataTable export
(`Blueprint/System/BP_PalGameSetting.json` plus DataTables). The calculation order and
rounding were validated against the JMAP and executable in `E:\ue5-unpacker\out\Palworld`.

## The six enhancement systems

| system | in-game surface | data source | effect |
|---|---|---|---|
| **Level** | EXP (`exp.json` curve) | `StatusCalculate_*` constants | linear per-level growth (below) |
| **IVs / talents** | hidden 0–100 per HP/Attack/Defense | `DT_TalentUpItem` fruits: +10 each | ×(1 + IV × `TalentRate`) |
| **Condense** (Essence Condenser) | stars 0–4 with duplicate pals | `CharacterMaxRank=5`, dupes/star `4/8/12/24` | combat stats: +`StatusCalculate_GenkaiToppa_PerAdd` per star; craft speed: hard-coded +10% per star; partner-skill rank +1/star |
| **Souls** (Statue of Power) | per-stat ranks with Pal Souls | ladder = `DT_CharacterUpgradeMasterDataTable` (20 ranks; `PalUpgradeStone1..4` = Small/Medium/Large/Giant Pal Souls; reset gold per rank) | per-stat multiplier for HP/Attack/Defense/CraftSpeed |
| **Friendship / bond** | trust ranks −3…10 | thresholds `DT_FriendshipRankTable` (rank 1 = 6,000 pts, …); per-rank gains = `DT_PalMonsterParameter` `Friendship_HP/ShotAttack/Defense/CraftSpeed` | flat, species-specific growth is folded into the base before IV and level scaling; only positive ranks apply |
| **Awakening** | element awakening items | `DT_PalAwakeningItemElement`; `AwakeningStatusMultiply` | multiplies only the original combat-stat species base, before friendship and the other enhancement systems |

The emitted `pals[].friendship` field is the **bond-rank** growth (the trust system), not the
condenser. The condenser uses a global combat-stat rate and a separate hard-coded craft-speed
rate.

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

HP truncates after the level/talent calculation, again after condensation, and again after
the soul multiplier:

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

## Worked example — Anubis

Anubis base stats are HP 100, shot attack 116, and defense 100. At level 60, with perfect
IVs (100), four condenser stars, soul rank 20 in all three stats, no friendship, and no
awakening:

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

## Validation scope and caveat

The executable helpers recovered for this validation were:

```text
HP calculation          0x7ff7ad10ee70
Attack calculation      0x7ff7ad10d790
Defense calculation     0x7ff7ad10ead0
Craft-speed calculation 0x7ff7ad10e690
GetMeleeAttack          0x7ff7ad16dfe0 → GetShotAttack 0x7ff7ad170c00
```

The JMAP contains the native `Default__PalGameSetting`, not the loaded
`BP_PalGameSetting`. It and the executable validate how the configurable fields are consumed:
the order of friendship, awakening, talent, level, condensation, souls, and truncation.
Blueprint-export values such as `500`, `0.5`, `0.075`, `0.05`, and `1.1` cannot be
independently recovered from this JMAP.

Do not replace live Blueprint overrides with native fallback defaults seen in the executable
(for example `1.0/100`, `0.2/30`, `0.1`, and `1.5`). The formulas above use the exported
Blueprint constants and the executable-validated calculation order.

Wild-pal *enemy* forms additionally apply the per-species `enemyScaling` multipliers
(`Enemy*Rate`, audit §9), and alpha/boss codenames carry their own stat rows.
