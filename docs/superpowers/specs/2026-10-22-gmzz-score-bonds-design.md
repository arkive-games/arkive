# gmzz rating calculator: the 非凡人物 group (2026-10-22)

## Goal

The 非凡评分 calculator covered equipment and left the 非凡人物 group (秘偶技能,
秘偶属性, 人脉技能, 历史研究) as "coming soon". Give the group a section that derives
what the package allows and takes the rest as input, in the page's existing idiom.

## What the client knows

Established by reading the client's bytecode (`tools/apps/gmzz/luac.py` decode, then
a `jit.util` lister) rather than guessed:

| item | source | derivation |
| --- | --- | --- |
| 秘偶属性 | `SecretPartner_Dominate_Page.lua` `CalcDominateTalentMarkScore` | Σ over owned puppets of rate × Σ over `Prop_Talent` of `SecretPartnerTalentStarUpData.Mark` at the puppet's stage; rate 1 in a dominate slot, 0.35 outside; `floor(x + 0.5)` |
| 历史研究 | `HistoryResearchData.Mark` | the Mark of the rank reached; the species' expected/max curves are those Marks (8087 = rank 8, 23265 = rank 17) |
| 秘偶技能, 人脉技能 | none | `SkillScoreData` is 25 bare ids; no script reads it; server value |

## Data

- `tools/apps/gmzz/secretpartners.py` adds `marks[]` to every attribute ladder
  (required, validated) and writes `secretpartners/scoring.json` with the five
  constants from `SecretPartnerConstData`.
- `fellows/history-research.json` already carries `mark`; nothing to add.
- The frontend treats `marks` as optional: a puppet without a ladder scores nothing
  and says so, so the site keeps working against a dataset published before this.

## Frontend

- `features/score/bonds.ts`: pure scoring and draft validation, unit-tested.
- `features/score/SpeciesRow.tsx`: the panel row, extracted from `ScorePage`; with
  `onScore` it is the typed box, without it the derived figure plus a calculator body.
- `features/score/BondsSection.tsx`: the group. 秘偶属性 lists owned puppets (picker
  with portraits, "add all"), a stage slider 1–50, a dominate tick capped by the
  slot count, and the per-row Mark × rate. 历史研究 is a rank select grouped by
  tier plus a research-points box that resolves the rank.
- `ScorePage` merges the two derived scores into the one `evaluate` call so the
  group total and bands are graded like every other item. Inputs persist in the
  `score/bonds` draft (thirty-day class, same as the character draft).

## Follow-up (2026-10-23): the rest of the panel

Every one of the fourteen items now has a row, under the four groups in the
panel's order, graded by the one `evaluate` call:

| group | derived by the page | typed from the panel |
| --- | --- | --- |
| 途径 | 非凡天赋 (`Σ node Mark × level` over the active tree; `TalentNodeData`) | 等级, 途径技能 |
| 装备 | all four, reported up by `EquipmentSection` | — |
| 封印物 | all three, reported up by `RelicSection` | — |
| 非凡人物 | 秘偶属性, 历史研究 | 秘偶技能, 人脉技能 |

The relic section, hidden since it was written, now follows the client's own
`calcSealedEnhanceMark`: resonance is `floor(Mark × k1)` read at the grade's
`AttributeImproveType` tier (which runs opposite to the grade; the earlier
clamp read grades 0 and 1 off the wrong ladder) after the server's grade cap
(local ≥ 2, cross-server ≥ 1, offered as a toggle). The two self-contained
sections report their subtotals through an `onTotals` callback rather than
being lifted, because each owns a draft of its own.

What is still not verified against a real account: the 非凡天赋 formula rests
on the benchmark curve being built from the Marks (an exact structural fit,
not a client call), and the relic server cap on `getSealedMainPropConfig`
rather than on the server's score property. One panel reading would settle
each. 人脉回响 (`FellowEchoData`) has a Mark ladder too but no species claims
it; it is not shown until something does.
