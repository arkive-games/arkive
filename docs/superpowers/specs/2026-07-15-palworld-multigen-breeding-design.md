# Palworld — Multi-Generation Breeding Planner

Date: 2026-07-15
Status: approved for implementation

## Problem

The breeding calculator answers "what do A and B make" and "which pairs make C",
and the drill-down tree lets the user *manually* explore how to breed each
parent. What it cannot answer automatically: **"I own Parent A and want Child C
— what breeding chains get me there in up to N generations?"**

## Feature

A new **multi-generation mode** on the existing `/breeding` page (distinct from
the drill-down tree feature). The user selects:

- **Parent A** — a Pal they own (fixed ancestor, carried through the chain),
- **Child C** — the target,
- **Max generations** — 2 or 3.

The page lists every breeding chain from A to C within that budget:

- gen 1 (always included, shown first): `A + Y = C`
- gen 2: `A + X = B`, then `B + Y = C`
- gen 3 (only when max = 3): `A + X = B`, `B + Y = D`, `D + Z = C`

Direct recipes are prioritized (rendered as the first group, using the normal
`RecipeCard`), then 2-generation chains, then 3-generation chains.

## Result model — one entry per species path

With 286 Pals, enumerating concrete `(X, Y)` partner pairs explodes (a mid-rank
target from SheepBall has ~10 000 raw 3-gen combinations). Instead an entry is a
**species path** `A → B → C` / `A → B → D → C`, and each step in the entry lists
**all partner options** for that step:

```
Step 1:  A + (X₁ | X₂ | …) = B
Step 2:  B + (Y₁ | Y₂ | …) = C
```

Measured entry counts with the real dataset (path counts, not partner pairs):
2-gen ≤ ~100 per query; 3-gen up to ~10 000 raw.

### Detour filter (3-gen noise control)

A 3-gen path is only shown when it is not collapsible into an already-listed
shorter path:

- skip `A → B → D → C` when **B can make C directly** (then `A → B → C` is
  already listed and the D step is a pointless detour), and
- skip it when **D is a direct child of A** (then `A → D → C` is already
  listed).

Measured effect: SheepBall→FengyunDeeper 10 317 → 108; SheepBall→PinkRabbit
1 434 → 31; and for targets with no shortcuts (SheepBall→Anubis) all 79 paths
survive — the filter never hides the only routes.

Intermediates are also required to be distinct from A, C, and each other
(no cycles, no self-steps). Partner options have no restrictions — a partner
may be A itself, or any Pal, since the user must obtain partners either way.

## Algorithm (`lib/breedingChains.ts`, pure)

Types:

```ts
interface ChainStep { fixed: string; child: string; partners: Combo[] }
// steps.length 1–3; steps[i].child === steps[i+1].fixed; last child === C.
// Every partner Combo is oriented with `fixed` in slot a (genders travel).
interface BreedChain { steps: ChainStep[] }

findChains(engine, data, aId, cId, maxGen: 1 | 2 | 3): BreedChain[]
```

Building blocks (all O(n²) worst case, ~40k `childOf` calls ≈ 50 ms, memoized
by the page):

- `childrenOf(A)` — pair A with every Pal, group resulting combos by child
  (child === A excluded; covers unique combos and the two gendered ones).
- `parentsOf(C)` — full unordered-pair scan (same shape as the existing
  `buildChildIndex`), keeping only combos with child C, grouped by each parent.
- gen 1: `parentsOf(C).get(A)`;
  gen 2: `B ∈ childrenOf(A)`, `B ∉ {A, C}`, `parentsOf(C).get(B)` non-empty;
  gen 3: additionally `D ∈ childrenOf(B)`, `D ∉ {A, B, C}`, detour filter above.

Sort: fewer steps first; within a group, roster (Paldeck) order of the
intermediates (B, then D) — same ordering rule as the recipe list.

Legendaries fall out naturally: they have no parents (`parentsOf` empty ⇒ no
chains; "can't be bred" message reuses the roster data).

## UI

- **Mode toggle** above the pickers: `Recipes` | `Multi-generation`
  (segmented buttons). Multi mode is encoded in the URL as `?gen=2|3`
  (absent = classic mode), so plans are shareable and Back works.
- Multi mode pickers: **Parent A**, **Child**, and a **Max generations**
  select (2 / 3). Parent B and the drill-down `?tree=` are not part of this
  mode (`tree` is cleared when switching).
- `a`/`c` are shared with classic mode, so switching modes preserves the
  selection. Invalid ids are pruned by the existing sanitizer effect.
- Results (`features/breeding/BreedingChainsView.tsx`):
  - group headers: *Direct recipes*, *2-generation chains*,
    *3-generation chains*;
  - direct group renders normal `RecipeCard`s (fav star included);
  - a chain card shows one row per step: fixed-parent chip, `+`, partner
    chips (capped at 8 with a `+N` expander per step), `=`, child chip —
    reusing the `PalChip`/hover-card visual language from `RecipeCard`
    (chips link to the Paldeck, unique partners keep the amber mark, genders
    render on the two gendered combos);
  - chain list capped (60 initially) with a *Show N more* button;
  - empty/prompt states: "pick both A and C" hint; "no chain within N
    generations" message.
- i18n: new keys in `breedingStrings.ts` for all 17 languages.

## Not in scope

- Cost/step-count optimization beyond "fewer generations first" (no partner
  rarity weighting).
- Sending a chain into the drill-down tree view.
- Favouriting whole chains (only the direct-recipe group keeps fav stars).

## Testing

- Unit (vitest, synthetic roster like `breeding.test.ts`): direct-first
  ordering, 2-gen enumeration, 3-gen detour filter (both clauses), cycle
  exclusions, legendary target ⇒ empty, partner orientation (fixed parent in
  slot a), gendered-combo passthrough, maxGen=2 excludes 3-step chains.
- Typecheck + lint + full app test suite.
- Live verification on the dev server (port 15174) after rebase-merge.
