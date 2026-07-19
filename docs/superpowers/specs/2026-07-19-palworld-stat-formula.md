# Palworld Pal Stat Formula — every enhancement system, with export-verified constants

Date: 2026-07-19. Companion to the data audit. Answers "how are pal stats enhanced, and what
is the formula for any pal?" Every constant below is **verified from the raw export**
(`Blueprint/System/BP_PalGameSetting.json` + DataTables) unless marked **[native]** — those
live in compiled code (`PalIndividualCharacterParameter`) and carry the community-measured
value.

## The six enhancement systems

| system | in-game surface | data source | effect |
|---|---|---|---|
| **Level** | EXP (exp.json curve) | `StatusCalculate_*` constants | linear per-level growth (below) |
| **IVs / talents** | hidden 0–100 per HP/Attack/Defense | `DT_TalentUpItem` fruits: +10 each | ×(1 + IV·0.3/100) **[native rate]** |
| **Condense** (Essence Condenser) | stars 1–4 with duplicate pals | `CharacterMaxRank=5`, dupes/star `4/8/12/24`, bonus `StatusCalculate_GenkaiToppa_PerAdd=0.05` | **+5 % per star** (max +20 %); also partner-skill rank +1/star |
| **Souls** (Statue of Power) | per-stat ranks with Pal Souls | ladder = `DT_CharacterUpgradeMasterDataTable` (20 ranks; `PalUpgradeStone1..4` = Small/Medium/Large/Giant Pal Souls; reset gold per rank) | +3 % per rank **[native rate]** per stat (HP/Attack/Defense/WorkSpeed) |
| **Friendship / bond** | trust ranks −3…10 | thresholds `DT_FriendshipRankTable` (rank 1 = 6 000 pts, …); per-rank gains = `DT_PalMonsterParameter` `Friendship_HP/ShotAttack/Defense/CraftSpeed` | **flat, species-specific** add per rank (e.g. SheepBall +5.5 HP, +3.7 ATK, +2.5 DEF / rank) |
| **Awakening** | element awakening items | `DT_PalAwakeningItemElement`; `AwakeningStatusMultiply=1.1` | ×1.1 |

Corrected in this pass: the emitted `pals[].friendship` field is the **bond-rank** growth
(the trust system), not the condenser — the condenser bonus is the global +5 %/star rate, not
a species column. UI/label/docs updated accordingly.

## The formula (any pal)

Let `HP_b, ATK_b, DEF_b, CS_b` be the species base stats (our `pals.json` `stats`: `hp`,
`shotAttack`/`meleeAttack`, `defense`, `craftSpeed`), `L` = level, `IV_*` ∈ 0…100,
`Stars` ∈ 0…4 (condense), `Soul_*` ∈ 0…20, `Bond` ∈ 0…10, `Awake` ∈ {0,1}.

```
HP      = floor( 500 + 5·L + HP_b · 0.5   · L · (1 + IV_HP  · 0.003) )
          · (1 + 0.05·Stars) · (1 + 0.03·Soul_HP)  [· 1.1 if Awake]
          + Friendship_HP  · Bond

Attack  = floor( 100       + ATK_b · 0.075 · L · (1 + IV_ATK · 0.003) )
          · (1 + 0.05·Stars) · (1 + 0.03·Soul_ATK) [· 1.1 if Awake]
          + Friendship_ShotAttack · Bond

Defense = floor(  50       + DEF_b · 0.075 · L · (1 + IV_DEF · 0.003) )
          · (1 + 0.05·Stars) · (1 + 0.03·Soul_DEF) [· 1.1 if Awake]
          + Friendship_Defense · Bond

WorkSpeed = CS_b · (1 + 0.05·Stars) · (1 + 0.03·Soul_CS)
            + Friendship_CraftSpeed · Bond            (level-independent)
```

Export-verified pieces: the 500/0.5 (HP), 100/0.075 (Attack), 0.075 (Defense) level
constants; +5 %/condense-star; ×1.1 awakening; +10 IV per fruit; the soul ladder costs; the
per-rank bond adds. **[native]** pieces (community-measured, matching in-game numbers): the
`5·L` flat HP term, the Defense base constant 50, the IV coefficient 0.3 %, the soul +3 %/rank,
the exact floor/ordering of the multipliers and where the flat bond adds enter.
`StatusCalculate_TribeMultiply_CraftSpeed = 0.7` scales effective work speed at stations.

Wild-pal *enemy* forms additionally apply the per-species `enemyScaling` multipliers
(`Enemy*Rate`, audit §9), and alpha/boss codenames carry their own stat rows.

## Worked example — Anubis (base: HP 100, ATK 116, DEF 100) at L 60, perfect IVs (100), 4 stars, souls 20/20/20, bond 10, no awakening

```
HP      = floor(500 + 300 + 100·0.5·60·1.3) ·1.2·1.6 + 5.5·10? →
          floor(800 + 3900)=4700 → 4700·1.2·1.6 = 9024 (+ bond HP)
Attack  = floor(100 + 116·0.075·60·1.3)=floor(778.6)=778 → 778·1.2·1.6 = 1493 (+ bond)
```

(Numbers are the formula applied verbatim; in-game rounding at each step can shift results by
±1–2. Use it as the model; spot-verify against a live pal before presenting exact values.)
