# Lost Ark — extraction and table-decoding notes

Reference notes for `tools/apps/lostark`, moved out of the workspace instructions on
2026-08-11 because they are long-form findings rather than working conventions. Related:
`docs/lostark-fansite-divergences.md` records the fan-site disagreements in full.

## No first-party extractor
Lost Ark is the one game whose extractor we do **not** own. uex/unex/gdex exist because Unreal,
Unity and Godot ship containers needing a decoder written; Lost Ark's `.lpk`/`.ipk`/`.upk` are
already handled by **`lostark-explorer`** (`D:\lostark-explorer`, .NET). Its output is **908
plain SQLite databases** at `D:\lostark-extracted\EFGame\...\ClientData\TableData`, so
`tools/apps/lostark` reads them directly and no fourth extractor is warranted.

## Combat power (`EFTable_BattlePoint`)
Combat power lives in `EFTable_BattlePoint` (16,707 rows): `PrimaryKey` 1 = damage dealer,
2 = support; `Type` selects the coefficient. Decoded so far: 1 = base rate, 2 = heal rate,
3 = per-combat-level amp (55–70), 4 = per-weapon-quality amp (0–100, DPS only),
5/6/7/9 = evolution/enlightenment/leap/leap-karma, 8 = karma stage step, 17 = accessory affix
lines, 22 = gem tier×level, 23 = chosen weapon, 27 = card sets, 28 = pet ranch, 29 = per-Ark-core
values, 31 = gem-option group×level, 33/34 = paradise orb. Rates are scaled integers — **the
divisor varies by Type** (1e6 for Type 1, 1e4 for the rest). Still undecoded: 11–16, 19–21,
24–26, 30 (engravings, bracelet, transcendence, avatars and roster bonuses live among them).

**The method that works** is matching a system's distinctive *value set* against the table — e.g.
`{700, 1100, 1500}` for cards. Matching single values, or id columns against other tables'
PrimaryKeys, both produce false positives; see the plan for the write-ups.

Two traps in the decoded ones. Type 29's `ValueB` is an **option index 1–6**, not a point total —
`ArkGridCore.ReqOptionPoint1..6` maps it to the 10/14/17/18/19/20 the UI shows. Types 33 and 34
are **not symmetric**: 33 puts the amp in `ValueC`, 34 in `ValueB`.

## The fan site's formulas are fits, not the real tables
Six divergences found so far: it pins combat level at 70 and calls it a constant (the game tables
55–70); it fits `(10 + 0.002·q²)/100` to the weapon-quality table, agreeing at only 21 of 101
values and deviating up to 0.0599%; it self-documents its Esther weapon values as estimates
(absent from the client, so genuinely unreleased); it grants the 0.013 orb heal amp to one orb
where the game grants it to four; it mistranscribes the middle pet-ranch tier as 0.00539 rather
than 0.0054; and it models cards as one global table when the game gives each of 38 sets its own
curve. Prefer the table every time.

## Gear stats and names
Gear stats are `EFTable_ItemLevelOption` keyed by
`SecondaryKey` = item level, with `Str`/`Agi`/`Int` carrying the same main stat once per class
stat. Names come from `EFTable_GameMsg` (`GameMsg_Chinese`, `GameMsg_Korean` — **no English**;
en-US needs an NAEU extraction).

Beware: BattlePoint Type 29 references 72 Ark-core ids that exist in **no other table** (a `…7xx`
suffix series). They are dropped and the count reported in `version.json`.

## Engravings (`Type 10` / `Type 11`)
**Correction (2026-08-05): `Type 10` is the engraving table, not a per-item-group honing table.**
All 28 of its `ValueA` ids exist in `EFTable_Ability` and none in `EFTable_ItemLevelOption`.
`ValueA` is a *reworked* ("S3") ability id — join the roster id through `EFTable_AbilityMapping`,
which stores its 47 pairs both ways — `ValueB` is a growth code and `ValueC` the amp ×1e-4.
Type 11 is the same shape for the support **heal** channel (one occupant, 妙手回春). The growth
code composes the two dials the UI exposes:

```
code = 20 * stone_level + 1 + 4 * grade_step + book_level     # epic/legend/relic = 0/1/2
```

The stone is a second independent axis, **not** extra engraving levels, and the grid is exactly
additive over the two axes (verified at every checkable cell of all 31 grids). Raw tooltip values
live separately in `EFTable_AbilitySpecification` and are *not* the amps: 尖刺重锤 grants 36% crit
damage but scores 0.1141. Class engravings (52 of the 95) have **no** per-level table and no amp
anywhere — only the 43 general ones are covered.
