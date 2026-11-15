# Map Marker Details and Coordinates

Reuse current AION2 detail content structure, placement, scrolling, selection,
close behavior, Details/Comments views, and game-specific sections, except below.

## Coordinates and copy

Display `(A, B, C)` when valid height is available, otherwise `(A, B)`. Use the
game's own coordinate order/axes; do not assume Z or the third value is vertical.
A pointer's 2D position cannot establish height: omit unknown height instead of
inventing zero. No separate height line.

Retain AION2's copy entry interaction. Copy only the displayed plain tuple with
the same values/order: no labels, game/map names, prose, or links. Show no copy
success/failure message, toast, or status-dependent icon substitution. Keep the
normal identifiable copy action and accessible name. This deliberately differs
from older canonical copy-feedback rules.

## Details footer

Move coordinates from their former location to lower-left, replacing Add Image;
remove that Add Image entry and the old coordinate duplicate. Show only location
icon + tuple + copy icon, without visible Position/Coordinates/Copy text.
Mark as Completed stays lower-right when tracking applies; progress follows
[map workspace](map-workspace.md). Existing gallery content and comment image
attachments remain under the AION2 baseline.

## Comments

Remove the row containing comment total, Popular, and Latest. Keep comments,
composer, and other AION2 behavior; no new default ordering is prescribed.
