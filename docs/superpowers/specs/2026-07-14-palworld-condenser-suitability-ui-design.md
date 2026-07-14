# Palworld: Best-Suitability Highlight + Condenser Projection UI

Date: 2026-07-14
Status: approved (brainstormed with visual mockups; user picked style A for both
detail rows and compact pills)

## Background

Palworld 1.0's Pal Essence Condenser upgrades work suitability: each condenser
star (+1 rank, ranks 2–5) grants +1 to one suitability, and the 4th star grants
+1 to all. The exact distribution algorithm was reverse-engineered from
`Palworld-Win64-Shipping.exe` (July 8 build,
`UPalIndividualCharacterParameter::GetRankBasedWorkSuitabilityBonus`, impl RVA
`0x2f6f150`; picker `0x2f6e400`; priority table `0x789caf0`):

- Let `levels` = the pal's suitabilities (level > 0), `best` = the species'
  `BestWorkSuitability` field from `DT_PalMonsterParameter`. Each star's choice
  sees levels updated by previous stars.
- **Single suitability**: every star targets it (stars 1–3 = +3, star 4 = +1).
- **Star 1**: `best` (regardless of levels).
- **Star 2**: the suitability at the 2nd-highest *distinct* level; if there is
  no 2nd distinct level, `best` again.
- **Star 3**: if the pal has exactly 2 suitabilities → `best` (hardcoded);
  otherwise 3rd-highest distinct level → fallback 2nd-highest → fallback `best`.
- **Star 4**: +1 to *all* suitabilities.
- **Tie-break**: among suitabilities at the chosen level, first in the fixed
  priority table = `EPalWorkSuitability` enum order (Kindling, Watering,
  Planting, Electricity, Handiwork, Gathering, Lumbering, Mining, Medicine,
  Cooling, Transporting, Farming). **OilExtraction is absent from the table**:
  its level still participates in the distinct-value list, but it can never be
  picked; it only gains from star 4.

All required data (`work` levels, `bestWork`) is already in the frontend
`pals.json` artifact.

## Scope

1. Highlight the pal's `bestWork` in: pal detail page, pal list table, catalog
   hover card.
2. Pal detail page: show the max-condensed final level next to each
   suitability's current level (`Lv6 →8`), with a tooltip listing which star
   grants each +1.
3. Info caption under the detail work panel explaining the ★/gold highlight.

Out of scope: condensed-levels toggle in the list, →N on hover-card pills,
pipeline/data changes, book (Applied Technique) bonuses in the simulation.

## Design

### 1. `apps/palworld/src/lib/condenser.ts` (new)

Pure module, no storage/fetch/i18n:

```ts
export interface StarUpgrade { star: 1 | 2 | 3 | 4; from: number; to: number }
export interface CondenseEntry { base: number; final: number; stars: StarUpgrade[] }
export function simulateCondense(
  work: Partial<Record<WorkType, number>>,
  bestWork: WorkType,
): Map<WorkType, CondenseEntry>
```

Implements the algorithm above. `CONDENSE_PRIORITY: WorkType[]` mirrors the
binary's table (enum order minus `OilExtraction`). Defensive fallback: if
`bestWork` is missing from `work`, use the highest-level suitability in
priority order (the binary's DB fallback; unreachable with current data).

Unit tests (`condenser.test.ts`, vitest, colocated like
`useFilteredPals.test.ts`):

- Single suitability → +3 from stars 1–3 plus +1 from star 4 (matches the
  user's in-game test).
- Anubis (Handcraft 6 best, Mining 3, Transport 2) → 8/5/4 with stars
  ★1·★4 / ★2·★4 / ★3·★4.
- Two suitabilities (Bastet: Collection 1, MonsterFarm 1 best) → best +3,
  other +2 (stars ★1·★3·★4 / ★2·★4).
- Best not highest (Serpent: Watering 3, MonsterFarm 2 best) → star 2's
  distinct-level lookup collapses and falls back to best; best gets ★1–★4.
- Three-way tie at the picked level → first in priority order wins.
- Oil Extraction present → never targeted by stars 1–3, +1 at star 4.

### 2. Pal detail page

- `WorkSuitability` atom (`features/pals/components/atoms.tsx`):
  - `highlight` prop semantics unchanged, but the caller now passes
    `work === pal.bestWork` (replacing the max-level-tie logic in
    `PalDetailPage.tsx`).
  - Highlight style: gold — amber border/background tint; ★ glyph
    (text-amber) after the label.
  - New props for the projection: `final?: number`, `upgrades?: StarUpgrade[]`,
    plus localized tooltip strings. Badge renders `Lv{base} →{final}` (arrow
    part in emerald) when `final > base`; the badge is wrapped in
    `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@gamemap/ui`. Tooltip
    body: title line, then one line per upgrade: `★{n}  Lv{from} → {to}`.
- Caption under the work grid (muted, text-xs):
  "★ Best work suitability — condenser stars upgrade it first" (localized).

### 3. Pal list + hover card

- `PalTable.tsx`: the work pill for `pal.bestWork` gets the gold treatment
  (amber border + tint). No ★ glyph, no →N (dense rows).
- `features/catalog/components/hover.tsx` `WorkBadge`: new `best?: boolean`
  prop, same gold treatment.

### 4. Strings

New `PalStrings` keys (all 17 locales, inline translations following the
existing file conventions):

- `workBestCaption` — the ★ legend caption.
- `condenseTooltipTitle` — tooltip heading ("Condenser upgrades").

Star lines are composed from the existing `lv` string + `★{n}` (no new key
needed). Work names come from data enums.

## Error handling

The simulation is total: it returns entries for every suitability with level
> 0 and never throws. Pals without `bestWork` (not present in current data)
fall back as described. UI renders nothing extra when `upgrades` is empty.

## Testing / verification

- `pnpm --filter palworld test` (vitest) for the simulation.
- `pnpm --filter palworld typecheck` / lint per workspace conventions.
- Manual dev-server check (port 15174): Anubis, Lamball, a single-suitability
  pal, a two-suitability pal; list table and hover card gold pills.
- Known pre-existing failure: ko-KR smoke e2e (unrelated).

## Workflow

Implemented in a git worktree; merged back with rebase per repo convention.
