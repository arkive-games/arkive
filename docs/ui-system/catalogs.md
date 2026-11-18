# All Games and Tool Library

## Shared catalog ordering

Manual default order. Favorites require login and are separate for games/tools.
Anonymous users and signed-in users with no favorites see default order.
Otherwise resolve search/type membership first, then matching favorites first;
keep default relative order in both groups. Sign-out restores default order.
Favorites never restore excluded results or navigate. Request behavior is in
[States](state-matrix.md#task-transitions).

## All Games

- Include every introduced game regardless of homepage promotion.
- Retain search and nonexclusive game-type filters/counts. Counts need not sum
  to the total; item-level type badges are not required.
- Show cover, game icon/name, short description and separate favorite action.
  The available item's whole non-command area opens its game entry; no extra
  Enter Game link. Keep commands independent, never nested inside a link.
- Only not-yet-launched games show Pending Launch and have no unusable game link.
  Available games have no launch-status label; temporary failure is not pending.

## Tool Library composition and targets

No visible title/intro. Desktop: continuous All / game types (same as All Games) /
Other filter on the left; short tool/game search on the right; results and
status below. No game-per-tab filter, ownership dropdown or Favorites Only.
Result counts need no new heading band. Existing three-column cards are a visual
reference, not a permanent column count or a rebuild mandate.

| Target | Action |
| --- | --- |
| Tool icon, name or description | Open the specific tool |
| Associated game name with an Arkive entry | Open the game entry |
| Associated game name without an entry | Open that tool |
| Favorite | Favorite this tool only; require login |

Use independent links/buttons with stable focus order. Retain actual game
association/logo; unassociated utilities need no invented game. Registry targets
may use any verified route, not only `/tools/` paths.

## Association, types, and Other

Association, game types and game-entry availability are independent. Other
includes tools for games without an Arkive entry and unassociated utilities;
it does not require a missing game name/type. Membership may overlap and is
deduplicated before ordering.

| Tool | Membership | Game-name link |
| --- | --- | --- |
| Listed single-player survival game | All, Single-player, Survival | Game entry |
| Single-player game without an entry | All, Single-player, Other | Tool |
| No associated game | All, Other | Absent |

Search matches tool name, description and associated game name. With All selected,
a game-name query finds every associated tool even if its title omits that name
or the game has no page. A type filter narrows results; changing query/filter
retains the other. Launching a game entry changes the game-name target; automatic
removal from Other and optional result grouping remain open.

## Visual and responsive reference

Use [Visual foundations](visual-direction.md#shape-height-and-spacing) and the
[catalog preview](catalog-controls-preview.html) for the reviewed equal-height
pill controls, arrow, card and toolbar-gap roles. Exact 1440px measurements are
in [Live audit](live-visual-audit.md), not universal widths or tool-card tokens.
Mobile catalog reflow remains contextual/provisional: keep controls and separate
actions reachable, no horizontal overflow, and clear the top-right menu button and safe areas. Tool
long-label/overflow checks are recorded in [Evidence](evidence.md); broader mobile
redesign remains deferred in [Adoption](adoption.md).
