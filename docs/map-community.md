# Persistent map contributions

`@gamemap/map-community` connects the AION2, Palworld, V Rising and PBZ marker
drawers to the shared Go API. The map shell renders data and calls callbacks;
it no longer fabricates successful local comments or uploads.

Signed-in accounts can publish, edit, delete, reply, like and report marker
comments. Text is public immediately. Targets include the game, artifact map
name and full marker identifier, so identical identifiers on different games or
maps do not share a thread. AION2 uses artifact names such as `World_L_B`.

Images use the existing S3-compatible storage configuration. Each image is
decoded, bounded to 4 MB and 3000 pixels per input edge, re-encoded without EXIF,
and resized to a maximum output edge of 2048 pixels. Comments accept up to
three attachments. Text and attachments commit in one database transaction;
failed requests retain the browser draft and reclaim uploaded objects.
Independent gallery contributions commit one image at a time.

Image records survive reloads in PostgreSQL. Pending or rejected images are
listed only for their author and staff for that game. Approved images appear
in public reads. Image URLs address the existing public object store; review
controls discovery in the API and site, not access to a URL already known to
the uploader. Hiding or deleting a comment also withdraws its attachments and
its replies' attachments from marker-image reads.

Game moderators and site administrators open **Image moderation** from their
account menu on any site. It leads to the portal's dedicated
`#moderation/images` page; there are no moderation controls inside map markers.
The phone portal also exposes the same destination in its site menu. The queue
includes all pending images within the account's moderation scope, with image
previews, uploader, game, map and marker identifiers, and paging. Failed reviews
keep their item; confirmed approvals or rejections refresh the queue. Signed-out
visitors are prompted to sign in, and ordinary accounts see an access-denied
state. The review API also supports withdrawing an already approved image.

The pending queue has no upload-date cutoff. It includes pending database records
within the reviewer's game scope, excluding attachments on hidden or deleted
comments. Approved and rejected images leave this queue. Built-in artifact images
and earlier browser-only previews have no contribution record to review and are
not imported automatically. An empty queue alone cannot establish which of these
conditions applies to a particular account.

The review page reuses the encyclopedia directory and wide-data frame. A compact
image list shows the uploader, upload time and marker location; choosing a row
opens the shared review dialog. Approval waits for the selected preview to load;
loading or failed previews cannot be approved. Confirmed decisions advance to the
next image, while failed decisions retain the selected contribution for retry.

## Publication behavior

| Content | Publication behavior |
| --- | --- |
| Map comment text | Public immediately after a successful submission. |
| Images attached to a map comment | Pending until image approval; the author and authorized staff can preview them. Other readers see the text first. |
| Forum posts and comments | Public immediately; no approval queue before publication. |
| Forum post images | Visible with the post after attachment succeeds; not part of the map-image queue. |

Map text and its attachments are saved atomically. An upload failure does not
publish a text-only fragment of that submission. The separate review states
control what other readers see after a successful submission. Forum validation,
upload processing and rate limits are not content approval; reports and staff
hiding operate after publication.

Deploy the backend before the frontend. The backend applies
`20261119000001_create_marker_images.sql` through the normal migration stream;
no new storage credentials or bucket are required. A reverse proxy must allow
the multipart comment request (up to 13 MB including framing), while the API
still enforces the 4 MB limit for each file. Older backends return an error
instead of a browser-only success.

## Verification

Validated with disposable local PostgreSQL 18 and MinIO, not production accounts
or production content. The frontend regression run passed 2004 tests; the Go
suite passed with database integration enabled. All four affected apps build,
their lint checks pass, and generated OpenAPI and frontend clients match.

Browser checks used a real local registration and cookie login. Palworld text,
attachments and gallery images survived a reload and loaded from S3. A separate
guest session saw text immediately, zero pending images, and both images after
approval through the administrator queue. AION2 and V Rising accepted their
existing underscore and long boss identifiers, and separate guests read the
saved comments. The 390-pixel mobile composer remains visible without horizontal
overflow. Async image loading remeasures desktop placement after a corrective
pan; a map-boundary regression checks that impossible corrections stop rendering.

The standalone moderation follow-up passed 2017 frontend tests and builds/lint
for the portal and Palworld. A real ordinary local account was denied the queue
and had no moderation menu item. After assigning the local administrator role,
the game's account menu opened the portal review route. The standalone page
approved one image, rejected another, and emptied its queue; a separate guest
read only the approved image. Desktop light/dark and 390-pixel phone views were
checked, including the phone menu entry and absence of point-level review controls.

For Windows browser checks, use Playwright CLI `run-code --filename` for scripts
containing URLs or selectors rather than passing JavaScript through a `.cmd`
shim. Keep generated evidence under ignored `output/playwright/`. A new workspace
package can resolve existing dependencies with an offline install; avoid an
unnecessary online resolution of the entire workspace.
