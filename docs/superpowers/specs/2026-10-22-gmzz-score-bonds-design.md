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

## Out of scope

途径 stays "coming soon". 人脉回响 (`FellowEchoData`) has a Mark ladder too but no
species claims it; it is not shown until something does.
