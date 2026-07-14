# Palworld Partner Skills Page — Design

Date: 2026-07-14
Status: approved (auto mode; user reviewed the interactive design round)

## Goal

A `/partner-skills` index page listing every pal's partner skill, with **category** and
**power** facets, wired into the global search. Partner skills map 1:1 to pals, so there is
no detail route — clicking an entry navigates to `/pals/$id`. Additionally, surface more
real per-level values from the raw game data — most notably the **ranch (Pal Ranch)
production counts per partner-skill level** that prior-generation wikis showed.

Per user direction: the **list page does not show per-rank values**; all per-rank numbers
live on the pal detail page.

## Raw-data findings (verified against the game export 2026-07-14)

### Ranch production chain (new)

The "produces X at the Ranch" counts per partner-skill level are a three-table chain:

1. `Blueprint/Character/Monster/PalActorBP/<X>/BP_<X>.json` →
   `PalStaticCharacterParameterComponent.SpawnItem.FieldLotteryNameByRank` — maps rank
   `"1"`…`"10"` → a field-lottery name (e.g. `CharacterSpawnItem_Wool_5`). The BP path per
   CharacterID comes from `DataTable/Character/DT_PalBPClass.json`.
2. `DataTable/Common/DT_FieldLotteryNameDataTable.json` — per-slot probability percent
   (all ranch lotteries in the current data use a single slot at 100%).
3. `DataTable/Item/DT_ItemLotteryDataTable.json` — rows with `FieldName` = lottery name:
   `SlotNo`, `WeightInSlot`, `StaticItemId`, `MinNum`, `MaxNum`.

36 CharacterIDs carry the map (incl. `BOSS_*` variants not in the roster; ~32 roster pals),
each with **10 ranks**. Examples: Chikipi `Egg 1–1` (rank 1) → `4–11` (rank 10); Vixy
(CuteFox) has a weighted multi-item pool per rank (PalSphere/Arrow/Money/Bone, higher-tier
spheres appearing at higher ranks).

### Other real values currently dropped by the pipeline

- `DT_PartnerSkill.TriggerType` — `PlayerTrigger` / `OpenTreasure` / `PalRevive` /
  `PlayerRevive` (distinguishes auto-triggered skills).
- `DT_PartnerSkillParameter.ActiveSkill.SkillName` (action name, e.g. `SearchMine`,
  `UniqueRideShooting_Minigun`) — not emitted, but needed to categorize actions.
- The unlock item's `IconName` in `DT_ItemDataTable` (`SkillUnlock_Saddle` ×108,
  `SkillUnlock_Gloves` (glider) ×10, `SkillUnlock_Harness` ×5, plus weapon icons
  AssaultRifle/SMG/Shotgun/Minigun/Grenadelauncher/Launcher/MultiMissile/Hammer/Choker/
  Headband) — a clean data-driven **Mount / Glider / Weapon** signal.
- Attack-shape partner skills store only `wazaId`/`element`; the waza's `Power` is not
  emitted (needed for the Power column).

Checked and rejected: no dedicated "partner skill production" table exists; the
per-rank buff values (`EffectValue1..4`) and attack multipliers
(`ActiveSkill_MainValueByRank`) are already emitted.

## Tools changes (`tools/apps/palworld/encyclopedia.py`)

Extend the emitted `partnerSkill` object (in `data-palworld/pals.json`):

- `farm` — ranch production, one entry per rank (index = rank−1, up to 10 ranks):
  `[[{item, weight, min, max}, …] × ranks]`. Weights are the raw `WeightInSlot`; the
  frontend derives percentage share per rank. Emitted only for pals whose BP carries
  `SpawnItem.FieldLotteryNameByRank`. Warn (not fail) if a lottery uses more than one slot
  or a slot probability ≠ 100 so the shape stays honest.
- `action.name` — the `SkillName` key (raw enum, e.g. `SearchMine`).
- `action.triggerType` — emitted only when not `PlayerTrigger` (`OpenTreasure` /
  `PalRevive` / `PlayerRevive`).
- `gear` — the unlock item's `IconName` minus the `SkillUnlock_` prefix
  (`Saddle`, `Gloves`, `Harness`, `AssaultRifle`, …). Only when `unlockItem` present.
- `power` — the waza `Power` (attack shape only).

No new locale files; category labels are client-side (same approach as the passives page).

## Frontend changes (`frontend/apps/palworld`)

### Catalog builder (`src/lib/pals.ts`)

`buildPartnerSkills(bundle)` → one entry per pal with a localized partner-skill name:
`{ palId, palName, palIcon, zukanIndex, skillName, description, shape, element?, power?,
categories[] }`.

- `shape`: `attack` | `buff` | `action` | `gear` (unlock-item-only skills, e.g. plain
  mounts) — pals with a skill name but an empty `partnerSkill` object are still listed.
- `categories` (a set, like `passiveCategories`):
  - `mount` — `gear === 'Saddle'`
  - `glider` — `gear === 'Gloves'`
  - `weapon` — remaining gear icons (Harness, AssaultRifle, SMG, …) or
    `UniqueRideShooting_*`/weapon action names
  - `ranch` — `farm` present
  - `attack` — attack shape
  - `combat` / `move` / `work` / `utility` — from buff effect types via a static
    effect-type → category map (mirrors the passives-page pattern); action names
    (Heal*, Search*, NightVision, Stealth, OpenTreasure, Revive*) map to `utility`.

### List page (`src/features/pals/PartnerSkillsPage.tsx`, route `/partner-skills`)

Follows `ActiveSkillsPage` structure (ContentPage + chip filters + table):

- Filters: **element** chips (attack-shape element), **category** chips (above), text
  search over pal name + skill name + description.
- Table columns: Pal (icon + name), Partner Skill (name + one-line description),
  Category badges, Power (attack shape only; sortable default sort = zukan index).
  **No per-rank values.**
- Row click → `/pals/$id` (whole row is a link like the active-skills table's name cell).

### Pal detail page

- Partner-skill section gains a **ranch production table** when `farm` is present:
  ranks (Lv1…Lv10) × produced items with count ranges (`1–5`) and share % for weighted
  pools. Item cells link to `/items/$id`. This is where per-rank values live.
- Show the `gear` badge (mount/glider/weapon) and non-player `triggerType` note.

### Navigation + search

- TopNav "Pals" dropdown + BottomTabBar "More" sheet gain "Partner Skills"
  (`nav.partnerSkills`, translated in all 17 locales; reuse the game's own term where the
  pal locale files provide one).
- `GlobalSearchWidget` gains a `partnerSkills` source: name = localized skill name,
  detail = pal name, icon = pal icon; select → `/pals/$id`.

## Error handling

- Pals without a localized partner-skill name are omitted from the page and search index.
- Missing lottery rows / multi-slot lotteries: warn at emit time, emit what resolves.
- Frontend treats `farm`, `gear`, `power`, `action.name`, `action.triggerType` as optional
  (older data files stay compatible).

## Testing

- tools: unit test for the new `_farm_items` parser against a fixture (SheepBall-shaped);
  re-run existing encyclopedia tests.
- frontend: typecheck + build + existing e2e smoke; manual live check on :15174 (list
  filters, row nav, ranch table on Chikipi/Vixy, global search entry).
