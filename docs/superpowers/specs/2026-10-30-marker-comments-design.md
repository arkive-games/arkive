# Marker Comments — Design

Date: 2026-10-30
Status: accepted, implementing

Comments attached to a map marker, so a visitor can read and write notes under a marker
without leaving the map. Phantom Blade Zero is the first game to enable it; the backend
surface is game-scoped from the start so the other games cost only client wiring.

## 1. Decisions

- **Publish immediately.** No pre-publication review queue. A comment is visible the
  moment it is posted; the forum's moderation tools are how a bad one is dealt with.
- **No images.** Text only. The drawer already renders attachments as an empty list, and
  the backend has no comment-image store; adding one is a separate slice.
- **Replies, likes, sort, edit, delete, report.** The shared drawer
  (`frontend/packages/map-shell/src/MarkerDetailDrawer.tsx`) already has the full comment
  UI — sort toggle, like, reply, "view N replies", edit-free composer — so the client work
  is wiring, not a new surface.
- **Notifications on replies and likes**, through the forum's existing inbox and its
  per-kind preferences. A reader who muted comment likes on the forum is already muted
  here, because the kinds are shared.
- **No marker badge.** The map does not show which markers have comments. Nothing extra
  loads with a map.

## 2. What is not a backend resource

Markers, maps and subtypes live in the `data-<game>` artifact repositories, not in
Postgres. The architecture design (§1) fixes that: the backend owns dynamic and user data,
the pipeline owns game content. So a marker comment stores the three keys as opaque text
and the backend never joins against a marker table.

## 3. Data model

New tables in `core` (one migration, plus one for the PBZ game key):

```
core.marker_comments
  id             uuid PRIMARY KEY
  game_key       text NOT NULL CHECK (game_key = ANY (core.game_keys()))
  map_id         text NOT NULL CHECK (map_id   ~ '^[A-Za-z0-9_-]{1,64}$')
  marker_id      text NOT NULL CHECK (marker_id ~ '^[A-Za-z0-9-]{1,40}$')
  author_id      uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE
  parent_id      uuid REFERENCES core.marker_comments (id) ON DELETE CASCADE
  body           text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
  created_at     timestamptz NOT NULL DEFAULT now()
  edited_at      timestamptz
  hidden_at      timestamptz
  hidden_by      uuid REFERENCES core.users (id) ON DELETE SET NULL
  hidden_reason  text
  CHECK ((hidden_at IS NULL) = (hidden_by IS NULL))

core.marker_comment_likes
  comment_id uuid NOT NULL REFERENCES core.marker_comments (id) ON DELETE CASCADE
  user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE
  created_at timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (comment_id, user_id)
```

**One level of replies, enforced in the schema** with the same generated-column composite
foreign key the forum uses: `depth` is `GENERATED`, and `(parent_id, depth)` must resolve to
a row whose own `depth` is 0. A reply to a reply cannot be inserted by any code path, not
just by the service.

**Likes are a row, not a counter.** `ON CONFLICT DO NOTHING` makes a like idempotent, so a
double tap or a retried request is harmless. The count is a `count(*)` over an index.

**Hiding is not deleting**, as in the forum: the author hard-deletes, a moderator hides
reversibly and attributably, every public read filters `hidden_at IS NULL`, and a hidden
row answers 404 to everyone but the queue.

## 4. Reuse rather than duplication

- **Reports.** `core.forum_reports` gains a nullable `marker_comment_id`. Its
  "exactly one target" check widens to three, the per-reporter uniqueness gains the column,
  and the open-queue query learns to scope a marker comment by its own `game_key`. One
  queue, one set of reasons, one hide/restore flow.
- **Notifications.** `core.notifications` gains a nullable `marker_comment_id`. Kinds stay
  `reply` and `comment_like`, so `notification_preferences` needs no new row and the inbox
  keeps its two tabs.
- **Roles and principal.** Moderators come from `core.role_grants` through `roles.Service`.
  The comments package takes the forum's `Authorizer`-shaped interface, not the role
  model behind it.
- **Rate limit.** `FORUM_COMMENTS_PER_MINUTE`'s limiter, reused: the abuse being throttled
  is the same abuse, and a separate budget would only let someone double it.

## 5. Validation of game, map and marker

Three layers, each catching what the one before cannot:

1. **Game** — the wire type's enum is generated from `internal/core/games.Keys`, so an
   unknown game is a 422 before the handler runs. Adding `pbz` there and to
   `core.game_keys()` in the same commit is the whole change.
2. **Format** — `map_id` and `marker_id` are ASCII-anchored patterns, in the DTO for an
   early message and in the table's `CHECK` so no future code path bypasses it. The
   bounds come from the data: PBZ's 2,476 markers are lowercase-plus-hyphen and at most
   30 characters; its map ids are PascalCase (`DengDingShanDao`), which a lowercase rule
   would have rejected.
3. **Existence, on create only** — a `MarkerIndex` fetches `<DATA_BASE_URL>/version.json`
   and the game's `markers/<map>.json`, and answers whether a marker exists; the whole of
   PBZ is 592 KB. The cache is keyed by the artifact's `version`, so a re-emit invalidates
   it instead of serving a stale set, and it is filled lazily per map.
   - **Reads never consult it.** A re-emit that renames or drops a marker must not make
     its existing comments unreadable.
   - **It fails open.** If the data host is unreachable, create accepts on format and logs
     it: a backend that refuses comments because a different repository is redeploying is
     worse than a rare orphan row.

## 6. API

Every item is addressed flat by its id, as `/forum/comments/{id}` already is. The collection
carries its own prefix; the parent keys travel in the query string on the collection and in
the body on create.

```
GET    /map-markers/comments?game=&map=&marker=&sort=latest|popular&page=&pageSize=
POST   /map-markers/comments                       {game, map, marker, body, parentId?}
GET    /map-markers/comments/{id}/replies?page=&pageSize=
PATCH  /map-markers/comments/{id}                  {body}
DELETE /map-markers/comments/{id}
PUT    /map-markers/comments/{id}/like             idempotent, like
DELETE /map-markers/comments/{id}/like             idempotent, unlike
POST   /map-markers/comments/{id}/report           {reason, detail?}
PUT    /map-markers/comments/{id}/hidden           {hidden, reason?}  (moderator)
```

Why not `/markers/{game}/{map}/{marker}/comments/{id}`:

- The parent segments would be redundant — the uuid identifies the row — and every
  handler would have to compare them against the row, which is a check that gets forgotten.
- A moderator acting from a queue knows a comment id, not its marker, so the nested form
  forces a lookup first — which is why the forum's own moderation endpoints are flat.
- The path prefix is `/map-markers`, not `/markers`, because the collection is the only
  resource here; a `/markers` root would imply the API owns markers.

`popular` orders by like count then recency; `latest` by `created_at DESC`. Both are
stable within a page via the id tiebreak.

## 7. Client

- **`@gamemap/api-core`** regenerates from the committed OpenAPI document, so the new
  operations and types are typed without hand-writing them. `scripts/api-drift-check.mjs`
  fails CI if the committed spec and the server disagree.
- **`@gamemap/map-shell` does not change.** It must stay free of storage, fetch and i18n
  (`shared packages are storage-free`), so the fetch/state hook cannot live there. It
  lives in the app, `frontend/apps/pbz/src/lib/markerComments.ts`, exactly as the forum's
  lives in `apps/meta/src/useForum.ts`. A second game wanting it is the signal to lift it
  into a shared package, not a reason to put it there now.
- **PBZ switches its marker popup to `MarkerDetailDrawer`** — the same component palworld,
  aion2 and vrising use, with `comments` wired and `gallery` empty. It replaces
  `MarkerPopupCard` on both layouts: desktop floating, mobile pinned above the tab bar,
  which is how palworld already runs it (`anchored={!isMobile}`).
- **Deep links.** The map route gains a `marker` search param so a notification can open
  the exact marker. It is a query parameter on `/`, so `edgeone.json` needs no new rule,
  but the route tree must be regenerated for `tsr`.
- **Strings** go in the app's existing `markerDetail.*` keys — PBZ's i18n is a copy of the
  shared drawer labels, so the section reads in the site's language.

## 8. Out of scope

Images, pre-publication review, a marker-side comment count or badge, @mentions inside
marker comments, and comment sorting by author. Progress and feedback remain unported.
