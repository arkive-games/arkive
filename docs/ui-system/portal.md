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
Game shortcuts use square library avatars, not title treatments. Prefer the
publisher's Steam games-list icon or app avatar: a recognizable character,
mascot or emblem that reads at small sizes. Otherwise crop a close-up from the
same game's art. Fill the tile without distorting the image. Do not center
a transparent library wordmark on a generic black plate. On load failure,
try the same game's thumbnail, then its cover. Keep labels and badges separate.
Game shortcuts and the update history shortcut use their respective latest
changelog dates and show the new badge through seven local calendar days after an update.
Glimmith and Phantom Blade Zero use the embedded 256-square PNG frames of
their Steam client icons (app IDs 4160210 and 4115450). Palworld uses its
yellow mascot app icon. The RO3 shortcut reuses the game's Poring card art.
No data stays empty; do not invent entries. Remove expired/deleted/inaccessible
selections. Retain current empty-section/mobile shelf treatment until explicitly
reviewed; these contextual choices do not reopen the completed page layout.

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
