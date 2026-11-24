# Portal Homepage

Preserve layout/order: carousel > mixed visual entry shelf > selected tools >
popular community posts > homepage footer. No recent-use or capability hero.

| Module | Content and destination |
| --- | --- |
| Carousel | Editorial/popularity recommendations; open the game |
| Entry shelf | Manually configured games, tools, catalogs, updates or future destinations; open real target |
| Selected tools | Editorial/popularity subset of Tool Library; open specific tool; retain lower-right game logo |
| Popular posts | Title, excerpt, author, time, channel, comments; open specific post |

The shelf is not the complete game directory. Carousel/shelf selections are independent; catalog
favorites/order are not automatically inherited. Tool/post counts are unfixed;
homepage selections are not the complete Tool Library even when inventories match.
Game shortcuts and the update history shortcut use their respective latest
changelog dates and show the new badge through seven local calendar days after an update.
No data stays empty; do not invent entries. Remove expired/deleted/inaccessible
selections. Retain current empty-section/mobile shelf treatment until explicitly
reviewed; these contextual choices do not reopen the completed page layout.

## Game shortcut icon selection

Use the square icon players recognize when launching the game or finding it in
their Steam games list. This rule is for homepage game tiles, not carousel banners
or tool illustrations.

1. **Keep a confirmed icon.** A new game or a shelf reorder is not a reason to
   replace another game's artwork. An original icon can contain lettering or a
   dark background: keep both. Lord of Mysteries keeps its gold lettering on
   deep red; Ragnarok Online 3 keeps its red 3 on white.
2. **Find the original before choosing a substitute.** Reuse a matching project
   asset, or obtain the icon from the game's client, official launcher or Steam
   games list for the correct title and edition. For Steam, use the client/list
   icon, not the library logo or store banner. Use desktop screenshots to
   identify a match, not as source pixels: shortcut arrows and system badges
   are not part of the artwork.
3. **Only crop when the original is unavailable.** Propose a square close-up
   from the same game's official art with one recognizable subject. Do not
   substitute unrelated card art, AI redraws, or a wide title placed on a
   generic black tile. A temporary load failure falls back to the game's own
   thumbnail or cover; it does not change the selected icon.
4. **Record provenance and review the change.** Name the asset and its source
   in the change description (project asset, launcher, Steam app ID, or official
   URL). If the upstream origin is unknown, say so. Before publishing a crop,
   a choice between conflicting originals, or a replacement for a confirmed
   icon, show the actual homepage tile at desktop and phone sizes for approval.
   Check that the image is undistorted and the update badge does not hide its
   identifying detail. Keep labels and badges separate from the asset.

Source examples: Glimmith and Phantom Blade Zero use the 256-square PNG frames
from Steam client icons for app IDs 4160210 and 4115450. Palworld reuses the
project's yellow mascot icon, checked against the local Steam client.

## Game shortcut selection and order

- The hard ceiling is **11 game tiles**. All Games, Tools, Forum and Update History
  follow the games in that order when available. They do not count as games.
- The editorial roster has seven occupied slots. A normal promotion replaces one
  named game in an existing slot, even below the ceiling. Record the incoming and
  outgoing IDs in the change. Registering a game or publishing its site does not
  allocate a slot; removing a tile does not remove the game from All Games.
- Sort selected, available games from left to right by observed Arkive demand,
  highest first. Use the sum of pageviews attributable to each game in Baidu
  Tongji's daily top ten pages over seven consecutive completed Beijing dates.
  This is a site-traffic sample, not total game traffic or worldwide popularity.
  Attribute game subdomains to their game and the portal's Glimmith tutorial
  route to Glimmith; exclude general portal pages. Equal scores use editorial
  slot order. Games absent from the sample follow in slot order (unknown, not zero).
- Refresh the checked-in snapshot when reviewing the shelf and before a replacement.
  From the frontend workspace run
  `node scripts/refresh-home-game-ranking.mjs <daily-report-directory> <last-complete-YYYY-MM-DD>`.
  Review the generated order before publishing. Keep the last verified snapshot when
  a report is missing or invalid. Do not commit raw analytics or change a visitor's
  order based on their own clicks or favorites.

## Live portal footer reference

The root [homepage](https://arkive.games/) has the blue sea footer; `#games`
uses the ordinary neutral footer. Roles are owned by
[Visual foundations](visual-direction.md#shells-footers-and-boundaries).
The [footer copy](home-footer-copy.html) reads deployed localized HTML/CSS,
including wave paths/wordmark; do not manually redraw it. Static reference only:
production dialogs and scroll-driven voyage are not included. No homepage rebuild.
