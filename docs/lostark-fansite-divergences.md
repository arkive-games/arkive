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

### 3. Esther weapon values are estimates
The fan site self-documents these as estimates. They are absent from the client,
so they are genuinely unreleased — not a client-reading failure.

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

### Costumes and expedition (时装 / 远征队)
Still fan-site sourced; not yet searched for in the client.

## Still-undecoded BattlePoint types

**12, 13, 14, 15, 16, 24, 25, 26, 30.** Type 25 (`ValueA` 162–165, `ValueB`
5/10/15/20) looks like a threshold ladder and is the best next candidate.

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
