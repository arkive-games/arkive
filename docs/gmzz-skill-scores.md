# GMZZ skill scores: 途径技能, 秘偶技能, 人脉技能

The client has no formula for any of the three skill items in the Beyonder
rating (非凡评分). `RoleSkillUnlockData.ScoreTid` points each skill at a
`SkillScoreData` row, but that table ships with its per-level `DeltaLv1..75`
columns stripped in every build checked, so the per-level values exist only on
the server. The shapes below were fitted to in-game panel readings and to the
client's own benchmark curves (`data-gmzz/score/rating.json`). Every reading
listed here is reproduced exactly, and the frontend tests assert each one
(`frontend/apps/gmzz/src/features/score/{bonds,fellowSkill}.test.ts`).

## The shared skill level

The 途径, 秘偶 and 人脉 skill levels are always equal; call it **L**. All
three scores are linear in **n = L + 9**.

The 途径技能 max curve is exactly `82 × n`, so every point on any benchmark
curve can be placed at a skill level. 27 distinct points fall between L6 and
L45. Below L6 the 途径 curve (624 and 1008) is not a multiple of 82, and
those points are not used.

## 途径技能

    score = 82 × n + c

c is a small offset that is not yet explained: it was 1 at L15, L16 and L17
(readings 1969, 2051 and 2133) and 3 at L38 (3857). The calculator does not
derive this item yet.

## 秘偶技能

    base  = floor(k × n)                         k: purple 22, gold 27.5, orange 34.32, red 42.9
    score = floor(base × (1 + 0.215 × (tier − 1)))

- **tier** depends only on the puppet's level, through
  `SecretPartnerSkillStarUpData`: levels 1, 10, 20, 30, 40 and 50 give tiers
  1 to 6. The puppet level itself adds nothing; only crossing into the next
  tier moves the score. The season caps the puppet level.
- **The base is floored before the tier multiplier is applied.** Applying the
  multiplier first misses gold tier 3 at L38 by one point (1847).
- **The max curve** is an orange puppet at the highest tier the season allows:
  tier 2 up to L11, tier 3 for L12–22, tier 4 for L23–35, tier 5 for L37–41,
  and tier 6 from L43. The formula reproduces all 27 points exactly. That is
  also the only evidence for the tier-6 multiplier, 2.075.

Readings at L38 (n = 47):

| quality | tier 1 | tier 2 | tier 3 | tier 4 | tier 5 |
|---|---|---|---|---|---|
| purple | | | | 1700 | 1923 |
| gold | | 1569 | 1847 | 2125 | 2403 |
| orange | 1613 | 1959 | 2306 | 2653 | 3000 |
| red | 2016 | | | | |

There is one more reading at L16 (n = 25): orange tier 2 scored 1042.

Red past tier 1 has no reading, so the page marks it as an estimate.

## 人脉技能

    score = floor(base × S / 40)
    base  = floor(28.6 × n)   gold      (= the 0★ score with no relation bonus)
            floor(22 × n)     purple    (= the purple puppet base)

- **S depends only on the connection's star and on its relation.** It does
  not change with the skill level, and all gold connections share the same S.
  Purple connections hold no relation effect in any relation.
- **The relation tier** is the lowest star among all of its members, plus 1.
  A relation is tier 0 while any member is missing, so the tier is never
  higher than the connection's own star + 1.
- Only relations of quality 1 or 2 that hold an effect for that member add
  anything. The quality-1 relations are 守护者们, 茶歇午后 and 无法释怀的死亡;
  the only quality-2 relation is 永远的守护者. Every quality-1 relation adds
  the same amount. Quality-0 relations add nothing, which is why 驭浪 always
  scores the no-relation value.

```
no relation, or tier 0:  S = 40 + 4 × star
quality 1, tier ≥ 1:     S = F1(star) − d1(star) × (star + 1 − tier)
quality 2, tier ≥ 1:     S = F2(star) − d2(star) × (star + 1 − tier),  d2 = 2 × d1
```

| star | F1 = 42 + 6 × star | d1 | F2 | d2 |
|---|---|---|---|---|
| 0 | 42 ✓ | — | 45 ✓ | — |
| 1 | 48 | 1.5 (inferred from d2) | 51 ✓ | 3 ✓ |
| 2 | 54 ✓ | 2 ✓ | 60 ✓ | 4 ✓ |
| 3 | 60 ✓ | 2.25 (from a single step) | 66 ✓ | 4.5 (unconfirmed) |
| 4 | 66 ✓ | 1.8 ✓ | 75 ✓ | 3.6 ✓ |
| 5 | 72 ✓ | 2 ✓ | 84 ✓ | 4 ✓ |

The 人脉技能 max curve is 5★ at a full quality-1 relation (S = 72). The gold
base reproduces all 27 points of that curve.

**Open question, 3★.** Taking d2 = 2 × 2.25 puts quality 2 at tier 1 below
quality 1 (S 52.5 against 53.25), which cannot be right. Either the 3★ d1 is
not uniform below tier 3, or 3★ breaks the doubling. The cells this decides
are marked as estimates on the page. Readings that would settle it: 3★ at a
quality-1 relation, tier 2 (L38 prediction 1864), and 3★ at 永远的守护者,
tier 2 or 3 (L38 predictions 1915 and 2066).

### Readings

Each row is the skill level, the connection, its star, the relation, the
relation's quality and tier, and the panel score.

| L | connection | star | relation | Q | tier | score |
|---|---|---|---|---|---|---|
| 38 | 阿尔杰 (驭浪) | 0 | — | 0 | — | 1344 |
| 38 | 阿尔杰 (驭浪) | 2 | — | 0 | — | 1612 |
| 38 | 阿尔杰 (驭浪) | 5 | — | 0 | — | 2016 |
| 38 | 邓恩 | 5 | 守护者们 | 1 | 6 | 2419 |
| 38 | 邓恩 | 5 | 无法释怀的死亡 | 1 | 5 | 2352 |
| 38 | 邓恩 | 4 | 守护者们 | 1 | 5 | 2217 |
| 38 | 邓恩 | 4 | 无法释怀的死亡 | 1 | 4 | 2157 |
| 38 | 邓恩 | 4 | 无法释怀的死亡 | 1 | 3 | 2096 |
| 38 | 邓恩 | 4 | quality 1 | 1 | 2 | 2036 |
| 38 | 阿兹克 | 3 | 无法释怀的死亡 | 1 | 4 | 2016 |
| 38 | 阿兹克 | 3 | 无法释怀的死亡 | 1 | 3 | 1940 |
| 38 | 阿兹克 / 佛尔思 / 奥黛丽 | 2 | quality 1 | 1 | 3 | 1814 |
| 38 | 邓恩 / 伦纳德 / 克莱恩 | 5 | 永远的守护者 | 2 | 6 | 2822 |
| 38 | 邓恩 / 克莱恩 | 4 | 永远的守护者 | 2 | 5 | 2520 |
| 38 | 邓恩 / 克莱恩 | 4 | 永远的守护者 | 2 | 4 | 2399 |
| 38 | 克莱恩 | 3 | 永远的守护者 | 2 | 4 | 2217 |
| 37 | 伦纳德 | 3 | 永远的守护者 | 2 | 4 | 2169 |
| 37 | 邓恩 | 4 | 永远的守护者 | 2 | 4 | 2347 |
| 37 | 邓恩 | 4 | quality 1 | 1 | 5 | 2169 |
| 37 | 邓恩 | 4 | quality 1 | 1 | 2 | 1992 |
| 30 | 克莱恩 / 伦纳德 | 2 | 永远的守护者 | 2 | 3 | 1672 |
| 30 | 邓恩 | 5 | 永远的守护者 | 2 | 3 | 2007 |
| 30 | 邓恩 | 5 | 无法释怀的死亡 | 1 | 1 | 1728 |
| 30 | 阿兹克 | 0 | — | 1 | 0 | 1115 |
| 30 | 阿兹克 | 0 | quality 1 | 1 | 1 | 1170 |
| 29 | 克莱恩 | 1 | 永远的守护者 | 2 | 1 | 1303 |
| 29 | 克莱恩 | 1 | 永远的守护者 | 2 | 2 | 1384 |
| 29 | 伦纳德 | 2 | 永远的守护者 | 2 | 1 | 1411 |
| 29 | 伦纳德 | 2 | 永远的守护者 | 2 | 2 | 1520 |
| 29 | 佛尔思 | 0 | 茶歇午后 | 1 | 1 | 1140 |
| 29 | 奥黛丽 | 2 | 茶歇午后 | 1 | 1 | 1357 |
| 25 | 克莱恩 | 0 | 永远的守护者 | 2 | 1 | 1093 |
| 25 | 邓恩 | 2 | 永远的守护者 | 2 | 1 | 1263 |
| 38 | purple | 5 | — | — | — | 1551 |
| 16 | purple | 5 | — | — | — | 825 |

Three readings from an earlier batch (4803, 4916 and 5028) match none of the
three skill items, alone or in any combination. Which item they came from was
not recorded.
