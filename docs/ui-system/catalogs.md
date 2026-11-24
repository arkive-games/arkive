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

### Game cover intake

- For a new or replacement cover, start at the game's official developer or
  publisher website. Prefer its promotional key art or a press kit linked from
  that site. Record the official source page, the original asset URL when
  available, and any reuse or credit requirements in the change description.
  A search result, fan upload or wallpaper mirror is not a source. If no
  suitable official image can be used, flag the missing cover for editorial
  review rather than substituting unofficial art.
- Choose a recognizable subject or scene that fills the card. Reject
  letterboxing, a small logo on a blank field, and art where featureless sky,
  white space or another flat background dominates the final crop. A bright
  snow scene with a clear subject is not blank merely because it is light.
- Preview the actual cover at both the desktop **4:3** and phone **1:1** card
  sizes with `object-fit: cover`. Adjust the focal point first; if either crop
  loses the face, main subject or signature feature, pick another official
  composition. Do not stretch the image or add padding to make it fit.
  The separate game icon and homepage carousel are not substitutes for this check.

Cover sources:

- **Order of the Sinking Star:** [official game site](https://www.orderofthesinkingstar.com/en/),
  [introduction artwork](https://cdn.orderofthesinkingstar.com/oss_assets/images/home/introduction/bg2.webp).
  The catalog uses the original WebP, with the character as its crop anchor.
- **The Artisan of Glimmith:** [publisher's game index](https://www.983media.com/983-interactive)
  links to the [official Steam gallery](https://store.steampowered.com/app/4160210/The_Artisan_of_Glimmith/).
  The [green stained-glass puzzle screenshot](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4160210/875dbc4b7e827fa3f339ee768df706579c8a1ac2/ss_875dbc4b7e827fa3f339ee768df706579c8a1ac2.1920x1080.jpg)
  is resized to WebP for the catalog. Source links identify the rights holders;
  they do not imply a separate reuse license.

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
