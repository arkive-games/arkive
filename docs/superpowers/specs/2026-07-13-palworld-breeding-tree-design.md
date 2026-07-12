# Palworld — Multi-layer Breeding Tree (design)

2026-07-13. Status: approved for implementation (user requested the feature and
selected defaults were taken autonomously: unlimited nesting, capped full parent
lists, URL-encoded tree state).

## Goal

On the breeding calculator (`/breeding`), clicking a recipe card `A + B = C`
focuses that recipe: the rest of the list is hidden and, below the focused
recipe, the page shows **how to breed parent A** and **how to breed parent B**
(each a list of recipes producing that Pal). Those sub-recipes are clickable in
the same way, recursively — building an arbitrarily deep breeding plan.

## Interaction

- Any `RecipeCard` on the breeding page is clickable (whole card; clicks on
  inner links/buttons keep their own behavior). An explicit expand icon-button
  on the card provides a keyboard-accessible affordance.
- Clicking a card in the main list enters **tree mode**: the grid is replaced by
  the tree view. Pickers (`Parent A/B/Child`) stay; changing any picker exits
  tree mode (the focused recipe may no longer match the query).
- Tree view per node:
  - the focused recipe card, with a collapse (×) button;
  - two indented sections, `How to breed <A>` and `How to breed <B>`, each
    listing every recipe that yields that Pal **excluding pairs that contain the
    Pal itself** (useless for obtaining it), rendered with `hideResult` (the
    result is the section header), capped at 12 with a "show N more" button
    (+12 per click, local state);
  - clicking a recipe in a section focuses it within that section and recurses.
  - a Pal with no such recipes (legendaries are self-bred only) shows an empty
    state: "Can't be bred from other Pals — catch one instead."
- An "All recipes" button (shown only in tree mode) exits tree mode, keeping the
  current picker selection. "Clear" clears everything as today.

## State

The tree lives in the URL (`?tree=…`), matching the page's "URL is the source
of truth" pattern — Back collapses the last click, the view is shareable.

```ts
interface BreedTreeNode {
  a: string; b: string          // parent pal ids
  ag?: 'M'|'F'; bg?: 'M'|'F'    // only for the two gender-specific combos
  l?: BreedTreeNode             // chosen recipe for breeding `a`
  r?: BreedTreeNode             // chosen recipe for breeding `b`
}
```

The child `c` is never stored — it is re-derived via the engine (`childOf`),
which also revalidates stale/hand-edited URLs. TanStack Router serializes the
nested object as JSON in the search param.

- `validateSearch` (route): structural check only (`parseTreeParam`), depth-capped.
- Page effect (like the existing id-cleanup): `sanitizeTree` against loaded
  data — parents must be real ids, the node's combo must exist (orientation- and
  gender-normalized), and a subtree's resolved child must equal the parent slot
  it hangs under; invalid subtrees are dropped with a `replace` navigation.

## Logic (lib/breeding.ts, pure & unit-tested)

- `buildChildIndex(engine, data)` — one pass over all unordered pairs →
  `Map<childId, Combo[]>` (memoized in the page, computed only in tree mode;
  ~67k `childOf` calls, one-time).
- `recipesToBreed(index, palId)` — the index list minus pairs containing
  `palId`, same sort as the main list.
- `resolveNode(engine, node)` — the node's `Combo` oriented so `node.a` stays in
  slot A (genders travel), or `null` if invalid.
- `sanitizeTree(engine, ids, node, expectedChild?)` — see above.
- `setSubtree(root, path, sub)` — immutable update for clicks/collapses.

## Rendering

New `features/breeding/BreedingTreeView.tsx`, recursive, vertical layout with
left-border indentation per level (`border-l pl-3`-style) — scales to unlimited
depth and to mobile, unlike nested columns. Reuses `RecipeCard` (new optional
`onSelect` prop; the fav star and expand button share one trailing actions
cell). Favourite stars are not shown inside tree sections (drilling context).

## i18n

New `BreedingStrings` keys, translated for all 17 locales following existing
tone/terms: `howToBreed`, `allRecipes`, `collapse`, `expandRecipe`, `selfOnly`,
`showMoreRecipes`.

## Testing

- Vitest: child index, self-pair exclusion + legendary empty case, resolveNode
  orientation/gender matching, sanitizeTree pruning, setSubtree.
- Playwright (`e2e/breeding.spec.ts`): from the default special-recipes view,
  click the first card → focused card + two "How to breed" sections appear;
  Back returns to the list.
