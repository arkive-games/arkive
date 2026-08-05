# Lost Ark — where the fan site disagrees with the game client

The calculator sources its coefficients from the game client (`lostark-explorer`
output, 779 `EFTable_*` SQLite databases). Where the reference fan site
(`https://lostark-cn.pages.dev/html/dps`) disagrees, **the client wins** — but
the disagreements are recorded here so they can be checked in-game rather than
taken on faith.

Each entry says what the fan site claims, what the client says, and how to test
it. Nothing here is a guess about which is right: the client is what the game
ships, so it is the default, and the ones marked **needs in-game check** are
where the client's reading could still be wrong.

## Confirmed divergences

### 1. Combat level is a table, not a constant
The fan site pins combat level at 70 and treats it as fixed. The client tables
cover levels 55–70. Nothing to test — the fan site simply omits the range.

### 2. Weapon quality is a table, not a quadratic
The fan site fits `(10 + 0.002·q²)/100`. It agrees with the client's table at
only **21 of 101** quality values, deviating up to **0.0599 percentage points**.
Worst case is around quality 41: fan site 0.13362, client **0.1337**.

### 3. Esther weapon values are estimates — and now we know what they are estimates *of*
The fan site self-documents its higher Esther values as estimates. The client
carries six amps (BattlePoint Type 23), topping out at **0.019**, which is exactly
the highest value the fan site publishes as real.

The join now shows the shape of the gap. `ValueB` is an
`ItemEvolutionCommon.EstherOptionId`, and following it through
`ItemQualityOption.EvolutionCommonId` to `Item.QualityOptionId` gives **four
generations x 29 class weapons**, of which only evolution stages 6 and 8 grant an
Esther option. Two findings:

* Generation 4's *own* options, `4100106` and `4100108`, exist in
  `ItemEvolutionCommon` but are **unreachable**: `ItemQualityOption` only routes
  stage 110 to their track, and stage 110 grants no Esther option. BattlePoint
  carries no amp for them either. That is content stubbed and not wired up — which
  is what the fan site is estimating.
* Generation 4 therefore scores **generation 3's amps**: the client routes its
  stages 100–109 through `EvolutionCommonId 241200000`, which reuses
  `3100106`/`3100108`. So the newest Esther weapon is worth the same as the previous
  one at the same stage. Not a divergence, but surprising enough to record.

### 4. Paradise orb heal amp applies to four orbs, not one
The fan site grants the 0.013 heal amp to a single orb; the client grants it to
four. BattlePoint Types 33 and 34 are **not symmetric** — 33 carries the amp in
`ValueC`, 34 in `ValueB`.

### 5. Pet ranch middle tier
Fan site **0.00539**, client **0.0054**. A transcription slip.

### 6. Card sets are per-set curves, not one global table
The fan site models cards with one table. The client gives each of **38 sets**
its own curve.

### 7. Support bracelet heal column is halved
The fan site's support `heal` column is exactly half the client's BattlePoint
Type 21 amp, and it rounds the smallest entry down: half of 0.035 is 0.0175, and
the fan site publishes **0.017**.

### 8. Support bracelet amplify lines drop a grade
The client offers four grades of the support amplify lines (`Value` 300 and 450
included); the fan site publishes three.

### 9. Ether Enhancement (以太充能) stone level 2
Fan site **0.04**, client **0.039**.
**Needs in-game check** — a single-cell difference, so a transcription slip
either way is plausible.

### 10. Precise Dagger (精密短刀) book levels are rounded per level
The fan site extrapolates its 0.0053 step linearly to 0.0106 / 0.0159 / 0.0212.
The client rounds each level independently: **0.0105 / 0.0158 / 0.021**.
This is the same "linear fit vs real table" pattern as the weapon-quality
quadratic, so the client is very likely right.

### 11. Engraving coverage
The fan site carries **18** damage engravings. The client carries **26** with
combat power, plus the scoring stone penalty. Absent from the fan site:

弱肉强食, 以太生成, 反制冲击, 碎盾重锤, 重碾, 乘胜追击, 法力环绕, 迅猛突袭

The fan site also omits growth codes 1–4 (partial epic book sets) entirely.

### 12. The stone is a second axis, not extra engraving levels
Worth recording because it was our own wrong hypothesis, not the fan site's.
Dividing the fan site's stone arrays by their book step gives `[0, 4, 5, 7, 8]`
for 11 of 17 engravings, which suggested a stone level simply granted +4/+5/+7/+8
levels. It does not. The client's growth code is

```
code = 20 * stone_level + 1 + 4 * grade_step + book_level    # epic/legend/relic = 0/1/2
```

a genuine 2D grid, exactly additive over its two axes. The six engravings that
did not fit `[4,5,7,8]` are real client behaviour: 尖刺重锤's stone unit is 1.875
against a book step of 2.0, and 肾上腺素's stone drives `SpecValue1` while its
books drive `SpecValue2` — two different sub-effects.

### 13. The combat-trait base of 2160 is a fan-site invention
BattlePoint **Type 26** (`battlestat`) carries a **per-point rate and nothing
else** — `ValueC` is zero on all five rows — and a scan of all 779 databases finds
2160 only as row numbers, drop weights and three unrelated engraving amps.

Both of the fan site's *rates* are the client's exactly (0.0003 for a damage dealer,
0.0004 for a support), and so is its per-role split: `ValueA` is the combat-trait
index 1–6 and the client lists `{1, 2, 4}` = 会心 / 专长 / 迅捷 for a damage dealer
and `{2, 4}` for a support. What it adds on its own is a fixed 2160-point base,
which inflates every character by `2160 * rate` — **+64.8%** for a damage dealer,
**+86.4%** for a support — before a single stat is entered.

The game reads the character's real trait totals (from accessories, the bracelet,
elixirs, ark passive), so the calculator now asks for those instead of for a
roster-only delta. **Needs in-game check** only in the sense of confirming that a
character's panel totals reproduce the in-game combat power; the table itself is
unambiguous.

### 14. Avatars: the amps agree exactly, the slot model does not
The fan site's `{稀有 0.005, 英雄 0.01, 传说 0.02}` is the client's
`AddonValue00 {50, 100, 200}` at the 1e4 divisor, on `AddonStat00` 7/8/9 — the
percentage variants of Str/Agi/Int. Same three numbers, same three grades, in all
four slots. So this is a provenance fix rather than a numeric one.

Two coverage differences do fall out of it:

* The client has a **上下装 combined garment** (`Item.Category 90107`) that fills the
  upper and lower slots at once and grants **2% at epic** — exactly an epic top plus
  an epic bottom. The fan site's four-tier model cannot express it. It is
  representable as upper+lower at the same grade, so the calculator does not offer a
  fifth slot, but the equivalence is asserted in the pipeline rather than assumed.
* No stat-bearing avatar exists above **legend**: there is no relic or ancient
  avatar, and the face-1, face-2, instrument and footstep slots carry no option at
  all (`StaticOptionId0 = 0`).

## Uncorroborated — the client has no answer

These are still fan-site sourced because the client does not appear to carry
them. They are not divergences; they are gaps.

### Ability-stone threshold bonus amp
The **threshold** is real: 5 total stone levels, from
`AbilityStoneBase.LevelStage00`, uniform across all 58 stones. The option is
`AbilityStoneCarveOption` 9100, a flat `KeyStat 150 += 150`. But **stat 150 has
no name in any table and no BattlePoint Type is keyed to it**, so the client
grants a raw stat, not a combat-power amp. The fan site's **0.015** amp is
therefore unverified, and the calculator does not score it.

### Support heal component constants
`VITALITY_FLAT = 27722`, `HP_FIXED_AMP = 0.17`, `KARMA_EVOLUTION_HP = 400`.
Three searches failed to find them: no BattlePoint row carries 27722 or 1700; a
scan of all 779 tables found 27722 only in `SummonNpcLevel` (unrelated); and
neither `PCAdjustmentLevelStat` nor `CharInfoStatMinMax` holds a player base
vitality. 27722 is most likely a level-70 character's base Con, computed rather
than stored. **The heal score's shape is right; its absolute value is only as
good as these three numbers.**

### Class engraving power
Class engravings have no per-level table and no amp anywhere — consistent with
the rework turning them into class identities. Their power presumably reaches the
score through `enlightenment_rate` (BattlePoint Type 6), which is **not
verified**.

## Every BattlePoint type now has a name

`GameMsg` carries a **35-member** `tip.name.enum_battlepointtype_*` enum, and the
table's `Type` column spans 0–34. Laying the two side by side, with the eleven
already-decoded Types as anchors and the systems whose row shape is already known,
leaves a **gap-free bijection**: every remaining enum name lands on exactly one
remaining slot, with nothing left over on either side.

| Type | enum name | state |
|---|---|---|
| 0 | `none` | no rows |
| 1 | `base_attack_point` | read |
| 2 | `base_health_point` | read |
| 3 | `level` | read |
| 4 | `weapon_quality` | read |
| 5 | `arkpassive_evolution` | read |
| 6 | `arkpassive_enlightment` | read |
| 7 | `arkpassive_leap` | read |
| 8 | `karma_evolutionrank` | read |
| 9 | `karma_leaplevel` | read |
| 10 | `ability_attack` | read (engravings) |
| 11 | `ability_defense` | read (engraving heal channel) |
| 12 | `elixir_set` | **not read** — `ValueA` 100–108 set id, `ValueB` 1–2 set level |
| 13 | `elixir_grade_attack` | **not read** — `ValueA` option id, `ValueB` 1–5 level |
| 14 | `elixir_grade_defense` | **not read** — support heal channel of 13 |
| 15 | `accessory_grinding_attack` | **not read** — stat→ratio, same shape as 19 |
| 16 | `accessory_grinding_defense` | **not read** — support heal channel of 15 |
| 17 | `accessory_grinding_addontype_attack` | read (affix lines) |
| 18 | `accessory_grinding_addontype_defense` | no rows |
| 19 | `bracelet_stattype` | read |
| 20 | `bracelet_addontype_attack` | read |
| 21 | `bracelet_addontype_defense` | read |
| 22 | `gem` | read |
| 23 | `esther_weapon` | read |
| 24 | `transcendence_armor` | **not read** — all values zero |
| 25 | `transcendence_additional` | **not read** — `ValueA` 162–165, `ValueB` 5/10/15/20 |
| 26 | `battlestat` | **read (new)** — combat traits, see divergence 13 |
| 27 | `card_set` | read |
| 28 | `pet_specialty` | read |
| 29 | `arkgrid_core` | read |
| 30 | `arkgrid_core_defense` | **not read** — ark-core support heal channel |
| 31 | `arkgrid_gem` | read |
| 32 | `arkgrid_gem_defense` | no rows |
| 33 | `trinity_orb` | read |
| 34 | `trinity_orb_defense` | read |

Two things this settles:

* **Type 25 was the wrong next candidate.** It looked like a threshold ladder and is
  `transcendence_additional` — transcendence, not the roster bonus the calculator
  needed. Type **26** was the answer, and it is only three rows for a damage dealer.
* **No enum member mentions avatars.** That is why searching BattlePoint for
  `{0.005, 0.01, 0.02}` was hopeless: the avatar bonus is a main-stat percentage on
  the item (`ItemGradeOptionStatic`), not a combat-power coefficient at all.

The remaining unread Types are all real systems the calculator does not model yet:
**elixirs** (12/13/14), **accessory grinding stat ratios** (15/16), **transcendence**
(24/25) and the **ark-core support heal channel** (30).

## Stat ids — partially recovered

An earlier pass recorded that no table maps a `StatType` id to a GameMsg key, and
that a scan of all 779 databases for `enum_stattype_criticalhit` finds nothing. Both
are true, but the *key* does exist in `GameMsg`, and two other tables supply the
missing half of the join:

* `EFTable_ArkPassive` nodes `1010100` … `1010600` are named 会心 / 专长 / 压制 /
  迅捷 / 忍耐 / 异化 and their `ArkPassiveOption` rows grant stat ids **15 … 20** in
  that order. That is the anchor for BattlePoint Type 26's 1–6 index *and* for the
  bracelet's combat-trait column.
* `SkillBuff` rows pin the flat main stats to **3/4/5/6** (Str/Agi/Int/Con) by the
  text they print, and their **percentage** variants to **7/8/9**: buff 120000 grants
  stat 7 with value 5000 and reads "力量增加50%", and 6110/6111/6112 grant stat 8 with
  −3000/−5000/−7000 and read 敏捷减少 30% / 50% / 70%.

`tools/apps/lostark/bracelets.py` now names **52 of the 58** lines it used to ship
unnamed. Only `KeyStat 11` is left: its one appearance outside a bracelet is a
`SkillBuff` with no description, so there is nothing to read a name off.

## Icon addressing — resolved

Recorded here because two wrong models shipped before the right one.

`Ability.Icon` + `Ability.IconIndex` name a **sprite file** (`Buff_71`), not a
cell coordinate. The client ships the table that resolves it: **`IconInfo.loa`**
(`ClientData/XmlData/`), 44,121 records over 1,144 atlas textures, giving each
sprite its page and pixel offset.

Both earlier models treated the index as a flat, row-major 64px cell walk. That
is wrong three ways: page order is not the numeric suffix (`Ability_0` lives on
page `Ability_1`), cell size is not fixed (22,605 sprites are 64x64 but 14,944
are 128x128), and sprites are not contiguous — `Buff_61` and `Buff_62` sit at the
top-left of page `Buff_3`, not between `Buff_60` and `Buff_63` on `Buff_0`.

That last one is why a constant −2 looked plausible: the flat walk reads exactly
two cells late from index 63 onward. But it keeps drifting — −4 at index 213, −5
at 224, −14 at 237 — and indices below 61 need no offset at all, which is why
`身披重甲` (`Buff_46`) was correct at +0 while `怨恨` (`Buff_71`) needed −2.

Scored on the 43 shipped engravings: **flat walk 5 correct, index−2 21 correct,
sprite table 43**.

The Crunch/DXT1 decoder was suspected and is **innocent**. The official CDN
publishes the game's own cuts at
`https://cdn.lostark.games.aws.dev/EFUI_IconAtlas/<Group>/<Group>_<n>.png`;
`Buff_71.png` pixel-matches our decoded `Buff_0` cell at (320,256) to a mean
absolute difference of 7.75 (neighbouring cells score 40+), i.e. DXT1
quantisation alone.

## Method note

What works for decoding a BattlePoint type is matching a system's distinctive
**value set** against the table. Matching single values, or id columns against
other tables' primary keys, both produce false positives. Types 19/20/21
(bracelet) were confirmed by reproducing all 45 of the fan site's amps with
nothing left over; Type 10 (engraving) by its `ValueA` ids all existing in
`EFTable_Ability` and none in `EFTable_ItemLevelOption`.

Two additions from the Type 26 pass:

* **Read the enum first.** `tip.name.enum_battlepointtype_*` has one member per
  `Type`, so a system can be found by *name* and then confirmed by shape, instead of
  guessing shapes. It also tells you when to stop looking: no member mentions
  avatars, and that negative was worth more than any further searching.
* **A blank value set is a signal, not a dead end.** Type 26's `ValueC` being zero on
  all five rows is what proved the fan site's 2160 base is its own — a *documented
  absence* is a result, and pinning it in a test keeps a future patch honest.

And one trap worth naming: **the amp you are looking for may not be an amp.** The
avatar bonus was hunted in BattlePoint for a long time because the calculator treated
it as a coefficient. It is an item stat (`ItemGradeOptionStatic` on a percentage stat
id), and it was found in minutes once the question changed from "which Type carries
0.02?" to "what does an avatar item *do*?".
