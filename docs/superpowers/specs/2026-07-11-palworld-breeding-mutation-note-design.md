# Palworld breeding page — mutation explanation

**Date:** 2026-07-11
**Status:** approved (user picked "Add explanation UI"; placement defaulted to the
recommended info tooltip when no further preference was given)

## Goal

The breeding calculator says nothing about mutation, while the Passive Skills page
already badges mutation-pool passives. Add a small, always-visible mutation info
element to the breeding page that explains the mechanic in every supported language.

## Facts (verified against the game export, 2026-07-11)

- Mutated Pals hatch from **Mutated Eggs** (`PalEgg_MutationPal*`), which the game
  describes as "extremely rarely obtained, having undergone a special mutation"
  (`DT_ItemDescriptionText_Common`). They carry mutation-exclusive passives
  (`AddMutationPal` pool — already surfaced on the Passives page).
- The **Extravagant Vegetable Cake** (`Cake04`) placed at the **Breeding Farm**
  makes mutations more likely and talents grow more easily
  (`ITEM_DESC_Cake04`; `DA_BreedingItemEffectData`: `MutationRateBonusPercent: 2.0`,
  `TalentBonus 1–5`). The *base* mutation rate is native code, not in the export,
  so the UI text states no absolute numbers.
- Localized names for Mutated Egg, Extravagant Vegetable Cake, and Breeding Farm
  were extracted from the game L10N tables for all 17 app languages and are used
  verbatim in the translations (per the "prefer game L10N names" convention).

## Design

- **Trigger:** a violet badge (`● Mutation`) in the results-count row of
  `BreedingPage`, styled identically to the Passives page mutation badge, with
  `data-testid="breeding-mutation-info"`. Label reuses the existing
  `passive.mutation` i18n key.
- **Tooltip:** hover/focus shows a two-sentence localized explanation
  (new `breeding.mutationTip` key in `breedingStrings.ts`, all 17 languages):
  breeding rarely produces a Mutated Egg → the hatched Pal is mutated and gains a
  mutation-exclusive passive; an Extravagant Vegetable Cake at the Breeding Farm
  makes mutations more likely and talents grow more easily.
- `BreedingPage` gains a `TooltipProvider` wrapper (it has none today; the
  Passives page pattern is copied).

## Alternatives considered

- **Static footnote** under the list — always visible but permanent clutter.
- **Collapsible "About mutation" box** — room for more detail than the mechanic
  needs; heavier UI for two sentences.

## Testing

New `frontend/apps/palworld/e2e/breeding.spec.ts`: `/breeding` shows the badge;
hovering it shows the tooltip text (en-US default).

## Out of scope

Per-recipe mutation chances/pools (would need deeper data mining), Operating
Table implant details (covered on the Passives page).
