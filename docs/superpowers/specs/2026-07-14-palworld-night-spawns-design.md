# Palworld day/night spawn info — design

2026-07-14

## Raw-data findings

- `DT_PalWildSpawner.json` rows carry `OnlyTime: EPalOneDayTimeType` — the only
  time restriction in the spawn system. Distribution (current export):
  `Undefined` 1462 rows (no restriction, spawns day **and** night), `Night` 229
  rows (spawn point active only at night). No `Day`-only rows exist.
  `OnlyWeather` is `Undefined` on every row (unused).
- Night rows by spawner type: 227 `Common` (wild area spawns) + 2 `FieldBoss`
  (`BOSS_GrimGirl` at `yamijima_plateau_pink_G_BOSS_2`, `BOSS_LilyQueen_Dark`
  at `sakura_purple_D_LilyQueen_Dark`).
- `DT_PalSpawnerPlacement.RespawnCoolTime` is 0 on 8235/8253 rows — there is no
  meaningful respawn-interval data to surface.
- `DT_PalMonsterParameter.Nocturnal` (195 pals) is a *behavioral* flag (works
  through the night in base) and is already surfaced as the "Sleepless"
  filter/badge. Distinct from spawn time; unchanged by this feature.
- Granularity is per (spawner, pal): only 4 pals are night-only at every
  location (NegativeKoala, WizardOwl, CactusDoll_Dark, WindChimes_Ice); 28 pals
  have some day and some night locations. So the flag lives on each spawn
  point/marker, not on the pal entry.

## Pipeline (tools/apps/palworld/maps)

- `extract.py` — the per-spawner pal aggregation gains a `nightOnly` flag: set
  when the first row listing a pal is `Night`, cleared as soon as any row for
  the same (spawner, pal) has no time restriction. Present-only-when-true in
  `parsed.json` (`palSpawns[].pals[].nightOnly`).
  Field bosses: after the boss list is built (both the UI boss table and the
  FieldBoss-placement path), any boss whose (pal, rounded coords) matches a
  night-only FieldBoss spawner row gets `nightOnly: true` — this covers both
  the placement-only bosses and those deduped against the UI table.
- `emit.py` — a pal-spawn cluster marker gets `nightOnly: true` only when
  **all** clustered points are night-only (a mixed cluster also spawns in
  daytime). Field-boss markers pass the flag through. The locale description
  stays a pure level range ("Lv.X–Y"); night labels are frontend i18n, because
  the game ships no bare localized "Night" string to reuse.

## Data contract

- `MarkerInstance` (types.ts) and `markerInstanceSchema` (schemas.ts) gain
  optional `nightOnly?: boolean`.

## Frontend (apps/palworld)

- `App.tsx` — pass `nightOnly` through to engine markers; the marker popup
  shows a moon icon + localized "Only appears at night." line for night-only
  wild clusters and field bosses.
- `lib/pals.ts` — `loadPalSpawns` copies the marker flag onto each
  `SpawnPoint` (`night?: boolean`), wild and boss points alike.
- `PalSpawnMap.tsx` — night-only wild points ring indigo (boss points keep the
  red ring; boss identity wins visually). Legend gains a "Night" entry when
  night points are present; when *every* spawn point of the pal is night-only
  the map shows the "Only appears at night." note instead.
- `palStrings.ts` — two new strings in all 17 languages: `nightOnly` (short
  chip/legend label) and `nightOnlyNote` (sentence).

## Out of scope

- Paldeck list filter for "spawns at night" (the existing Sleepless filter is a
  different concept; a spawn-time filter can be added later if asked).
- Weather-conditioned spawns (unused in data).
- Respawn cooldown timers (no data).

## Verification

- Unit: extend `test_extract.py` (night aggregation vs. mixed rows) and
  `test_emit.py` (marker flag on all-night clusters, absent on mixed; field
  boss passthrough).
- Regenerate `data-palworld` (extract + emit), sanity-diff, commit separately.
- Live: dev server on :15174 — NightFox/WizardOwl detail page (night ring +
  note) and a night cluster popup + GrimGirl field-boss popup on the main map.
