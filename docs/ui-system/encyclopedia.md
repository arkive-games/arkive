# Encyclopedia

## Desktop shell and search

Reference: [Ragnarok 3 Talents](https://ro3.arkive.games/talents).
After shared top navigation: left category/subsection directory beside right
category filters/search, then game-owned content. Do not repeat the selected
category as a right-side title/intro. Search only the current category, e.g.
Talents searches talents, not the whole encyclopedia.
Use the shared capsule search and panel-frame directory toggle from the visual
foundations. Do not add click/hover tutorials, implementation commentary or
visible result-total summaries. Actual game descriptions and progress remain.

Reuse the actual game shell, not an older local approximation: wordmark, game
icon/name chip, then game-owned links (RO3: Home, Encyclopedia, Build Manual),
with current section active. Flush-top geometry and ordinary footer follow
[Visual foundations](visual-direction.md#shells-footers-and-boundaries).

One primary document scroller; detail surfaces may scroll internally. Use the
foundation content-width roles. Shared states come from [States](state-matrix.md);
loading reserves geometry and errors retain query/filters.

## Desktop sidebar

Start expanded with icons, labels and relevant children. Adjustable provisional
values, initially calibrated from RO3:

```css
--arkive-encyclopedia-rail-expanded: 11.5rem;
--arkive-encyclopedia-rail-collapsed: 4rem;
```

Collapse shows only primary icons, hides labels/inline children and releases
content width. Keep expand control, selected indication and accessible icon
names. Presentation collapse/loading must retain selected branch, search and
filters. Structural reference: supplied [ZCOOL](https://www.zcool.com.cn/recommend#tab_anchor)
screenshots; do not borrow its branding.

## Details and returning

Content schemas, graphs/tables/cards, detail page/panel/dialog and information
layout remain game/content-specific. Related-record links remain open.
Returning or closing detail restores game/category/subsection, query, filters,
page/reveal depth and stable scroll position. Restore data/depth before position.
Use `session_context` and precedence/lifetimes in
[State memory](../ARKIVE_STATE_MEMORY_SPEC.yaml); no extra cross-device promise.

## Mobile

Composition is deferred. Do not specify a drawer, icon rail, toolbar reflow or
content schema from the desktop design. Current pages are references needing
reconstruction, not finished standards or authorization to implement now.

## Local integration

Palworld's 14 reference categories and their detail pages now use the shared
desktop workspace. The rail reuses the top navigation's category inventory,
retains icon-only category links when collapsed and preserves tab-local collapse
across routes. Shared width tokens remain provisional. Category headings are
visually hidden on desktop; game-owned detail headings and existing mobile
composition remain intact. GMZZ's 12 reference routes reuse the same workspace,
with game-art category icons and nested roster/relations links. Its existing
filters/search sit in the right column on desktop; tools, the trade calculator
and existing mobile composition remain separate. AION2's overview, three type
hubs, group lists and details now reuse the workspace while retaining taxonomy
counts, subgroup destinations and expanded reading history. V Rising's V Blood
list/details and two knowledge pages reuse the directory; existing ready
subsections move into the active desktop branch, while incomplete categories
remain disabled and mobile category cards retain their composition. RO3's seven
categories use the shared directory frame with original artwork, row styling
and portal-based talent subsections. Folding hides those subsections without
unmounting them. PBZ's seven categories and their existing details now reuse
the directory with the top navigation's inventory and existing mobile-menu
icons. Its cards, filters, documents and skill sections retain their layout.
The six scoped game shells have passed local cross-game closeout: 47 category
routes for directory/overflow and six representative desktop/mobile pages for
shared controls, session reload and empty-result layout. This is local
verification, not production deployment or approval of deferred mobile design.

RO3's seven wiki categories now retain session-only query/facets, subsection,
paging, selected record and viewed levels/variants. Palworld's 14 reference
categories retain their applicable searches/facets and scroll; item/building
reveal depth and existing mobile paging survive return and reload. Explicit
technology links bypass a conflicting remembered query for the visit. Base-camp
reading position is scoped separately for desktop and existing mobile pages.
AION2 retains overview/type searches, hub group/faction, group/detail scroll
and sibling-catalog queries. New anchor links override ordinary context while
Back/reload resumes the linked visit's later position.
PBZ's six lists retain queries/facets and result-scoped scroll; detail reading
positions, weapon-level expansion and item-document pages are session-scoped.
Skills remember ordinary reading position; hash visits keep their existing
anchor behavior. V Rising's V Blood list/detail restore reading position while
retaining existing query/act/completion filters and progress ownership.
V Rising's parsed recipe/passive/building/research records retain independent
queries, reveal depth, passive disclosure and reading position. Existing
page-level context is adopted once without replacing newer subsection state.
GMZZ's reference pages retain applicable queries/facets, pagination,
per-entity reading disclosures and result-scoped scroll. Trade/Utopia view
preferences are device-local; other reading fields are tab-local. Explicit
piece links reveal their target without replacing ordinary piece filters.
Puppet browsing retains query/facets independently from its existing level
records. Trade reference sections retain independent positions; goods sorting
is a device preference, while commission filters/query/page are tab-local.
Calculators, editors and progress records keep their existing lifecycles.
STS2's card/character lists and details retain result/entity-scoped position.
Card facets are tab-local with the old device record retained as a migration
seed; the existing tab-local search key remains stable.
The shared scroll adapter waits for data and content height, preserves result
scope and yields to user input. Remaining categories still need adapters; no content or
mobile redesign is implied. Unavailable storage keeps the active page usable
without guaranteeing restoration after navigation.
