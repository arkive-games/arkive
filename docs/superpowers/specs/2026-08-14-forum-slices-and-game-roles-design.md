# Forum Slices 2–9 — Reactions, Images, Social Graph, Feeds, Notifications, Moderation, Privacy, and Game Roles

Status: design. Supersedes nothing; extends `2026-08-13-forum-backend-design.md`, which built slice 1
(posts and comments) and named the other seven to fix their boundaries.

This document covers the remaining seven slices, adds an eighth the frontend already draws but no
design had claimed — **game roles and administration** — and settles two forward constraints the
product owner has stated:

1. **Marker comments are coming**, as a game-scoped feature distinct from this global forum.
2. **Each game should own its tables.**

Both are structural. They are decided here rather than discovered later, because the cheapest moment
to choose a partitioning strategy is while every affected table is still empty
(`GET /forum/posts` returns `count: 0` in production today).

---

## 1. Scope and order

Slice 1 shipped two tables and nine endpoints. Everything below is new. The order is forced by
dependencies, with one deliberate change from the original list: **roles move to the front**, because
moderation cannot be specified without them and because the cabin UI has been drawing an
owner/administrator panel against no model at all.

```
9. Roles and game administration   <- first; moderation depends on it
2. Reactions                       <- needs 1
4. Social graph                    <- independent
3. Post images                     <- needs 1, platform/blob
5. Feeds, ranking and search       <- needs 1, 2
6. Notifications                   <- needs 1, 2, 4
7. Moderation                      <- needs 1, 9
8. Privacy                         <- needs 1, 4
```

Each slice is one migration, one package or one package extension, and one PR.

---

## 2. The two forward constraints, and what they force now

### 2.1 Per-game tables: LIST partitioning inside `core`, not a schema per game

The architecture document sets an invariant that decides this: **no cross-schema foreign keys**
(`2026-08-08-go-backend-architecture-design.md` §2). It also records, in §3.1, why global and
game-scoped concerns were merged into one `core` module — splitting them

> would put a cross-schema seam on the hottest join in the system (`comments → users`, on every
> comment list) and, under the no-cross-schema-FK invariant, cost real referential integrity for a
> boundary that would never be exercised.

So "each game owns its tables" must not be read as "each game owns a schema". A `aion2.marker_comments`
table could not reference `core.users(id)`, and marker comments join to users on every single read.

**Decision: game-scoped tables live in `core` and are LIST-partitioned on the game key.**

```sql
CREATE TABLE core.marker_comments (
    id      uuid NOT NULL,
    game    text NOT NULL CHECK (game = ANY (core.game_keys())),
    ...
    PRIMARY KEY (id, game)
) PARTITION BY LIST (game);

CREATE TABLE core.marker_comments_aion2
    PARTITION OF core.marker_comments FOR VALUES IN ('aion2');
```

This gives every property being asked for:

| | |
|---|---|
| Each game has its own table | literally — one physical relation per game, with its own indexes and its own vacuum |
| The users foreign key survives | the partitioned parent and `core.users` are in one schema; Postgres 18 supports FKs from a partitioned table |
| A game's data can be dropped or archived alone | `DROP TABLE core.marker_comments_aion2`, no `DELETE` scan |
| The upgrade to topology 3 stays a deploy change | `ALTER TABLE … DETACH PARTITION` moves one game's relation into its own schema when it earns isolation |

The cost is that the partition key must appear in the primary key, so game-scoped tables use
`PRIMARY KEY (id, game)` rather than `PRIMARY KEY (id)`. That is a real ergonomic tax and it is
accepted: it is the price of the detach path.

Rejected: a single heap table with a `game` column and no partitioning. It satisfies the FK
requirement but not the stated constraint, and converting a populated heap into a partitioned table
later is a rewrite under lock — exactly the migration this document exists to avoid.

Rejected: a schema per game now. It buys deploy isolation that nothing has asked for, and pays for it
by deleting the `→ users` foreign key from the hottest join in the system, permanently.

### 2.2 The forum itself cannot be per-game, and that is not a contradiction

`core.forum_posts.game_ids` is a `text[]`: a post may carry five games or none. A row that belongs to
five games cannot be partitioned by game, and a global board is the point — slice 1's design opens by
calling it "the global forum that lives on the meta site", explicitly not the game-scoped package
reserved for marker comments.

So the constraint applies to **genuinely game-scoped data** — marker comments, progress, feedback —
and not to forum posts. A game "cabin" in the UI is a *view* over the global board:
`GET /forum/posts?gameId=palworld`, answered by the existing GIN index on `game_ids`.

Making the forum per-game instead would mean giving up multi-game posts, and would fragment a board
that has no posts yet across four tables. If that is ever wanted, it is a product decision about
whether a post can span games, not a storage decision — and it should be taken before there is data.

### 2.3 One place to add a game: an immutable function, not a domain

Architecture §5 already fixes the representation:

> `games` is a **compile-time registry in Go**, not a table. Game keys are referenced by game-scoped
> tables as plain `text` with a check constraint; there is no FK, because games are code, not data.

Taken literally, every game-scoped table repeats the list and adding a game edits N constraints. One
declaration that all of them share is better. Three mechanisms were tried against
`postgres:18`; the results below are measured, not reasoned.

**Decision: an `IMMUTABLE` function returning the list, referenced from an ordinary check constraint
on each column.**

```sql
CREATE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'palworld', 'vrising', 'sts2'] $$;

-- scalar column, e.g. role_grants.game
CHECK (game = ANY (core.game_keys()))
-- array column, e.g. forum_posts.game_ids
CHECK (game_ids <@ core.game_keys())
```

Adding a game is then **one statement**, whatever the table count and whatever the column shapes:

```sql
CREATE OR REPLACE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'palworld', 'vrising', 'sts2', 'lostark'] $$;
```

Verified: valid scalars and arrays are accepted, an unknown scalar and an unknown array element are
both rejected by name, the replace immediately admits the new key, and unknown keys are still rejected
afterwards. Also verified through a full `pg_dump` → `psql` restore cycle — the function is restored
before the tables that reference it, and the restored constraint still enforces. That last check
matters because a constraint calling a function is exactly the kind of thing that can restore as a
no-op and be discovered during an incident.

**Rejected: `CREATE DOMAIN core.game_key AS text CHECK (VALUE IN …)`.** It reads better and it is what
this design originally specified, but it does not survive contact with an array column, and it fails in
the worst available way:

```
ALTER DOMAIN core.game_key DROP CONSTRAINT game_key_check;   -- succeeds
ALTER DOMAIN core.game_key ADD  CONSTRAINT game_key_check …; -- ERROR: cannot alter type
    -- "core.game_key" because column "forum_posts.game_ids" uses it
```

`ALTER DOMAIN … ADD CONSTRAINT` is refused whenever *any* column of the domain's **array** type exists
— and since the `DROP` in front of it has already committed, the migration leaves the domain carrying
**zero constraints**. The probe that found this then inserted `['lostark']` successfully against a
supposedly restricted domain. A scalar-only domain does alter cleanly, so the trap only springs when
someone later adds an array column — which is the worst possible time to find it.

Two smaller reasons the function wins even ignoring that: sqlc types a domain column as `interface{}`
rather than `string` (measured on this toolchain — a scratch migration generated
`ScratchProbeByGame(ctx context.Context, game interface{})`), requiring a `sqlc.yaml` override to undo;
and a plain `text`/`text[]` column with a check constraint needs no override at all.

**The one asymmetry to know.** Postgres does not revalidate existing rows when the function body
changes. *Widening* the list cannot invalidate anything, so adding a game is safe. *Narrowing* it —
retiring a game — would leave rows violating a constraint that no longer checks them, so that operation
needs an explicit audit rather than just a replace. Retiring a game is not otherwise contemplated
anywhere in this project.

This also closes a live gap: `forum_posts.game_ids` has **no** constraint today beyond
`cardinality(game_ids) <= 5`, so `gameIds: ["not-a-game"]` is accepted and stored, while the
migration's own comment claims a registry that does not exist. See §12.

### 2.4 Marker comments: the shape reserved, and the addressing trap

Not built here. The shape is reserved so that slices 6–8 (notifications, moderation, privacy) are
built against an interface marker comments can join later rather than being retrofitted.

```sql
CREATE TABLE core.marker_comments (
    id           uuid NOT NULL,
    game         text NOT NULL CHECK (game = ANY (core.game_keys())),
    marker_key   text NOT NULL,   -- stable identity, NOT an index; see below
    data_version text NOT NULL,   -- the build this was written against
    author_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    body         text NOT NULL,
    parent_id    uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, game)
) PARTITION BY LIST (game);
```

**The trap, and it is a data-corruption trap, not a design preference.** Architecture §1.1 records
that marker *progress* is index-addressed — a bitset keyed on `markers.index_in_subtype`, assigned by
a data build — and that a rebuild which reorders markers shifts every user's progress to the wrong
markers, "a data-corruption bug with no error and no obvious symptom".

A comment anchored the same way is worse: progress silently mis-attributes a checkbox, whereas a
comment silently reattaches a paragraph of user-written text to a different place on the map. So
marker comments **must not** be index-addressed. They anchor on a `marker_key` that the pipeline
guarantees stable across builds, and they record the `data_version` they were written against so a
violation is detectable after the fact.

That guarantee is the same one §1.1 already requires before progress ships — append-only indices per
`(map, layer)`, with a `tools` test asserting it across data versions. **Marker comments inherit that
prerequisite: they cannot ship before it exists.** This document does not discharge it.

---

## 3. Slice 9 — Roles and game administration

### 3.1 What exists, and what it cannot express

Authorization today is a single boolean: `auth.Principal.IsSuperuser`, sourced from
`core.users.is_superuser`. There is no other privilege bit anywhere. `canPostToChannel` is labelled in
its own comment as "a placeholder for a permission system that does not exist yet".

The UI already draws what is missing: a per-game cabin management panel naming an **owner** and an
**administrator**, with an "Apply" button. There is no role model behind any of it.

### 3.2 Site admin stays a column; only game-scoped roles become rows

**Decision: `role_grants` holds game-scoped roles only. Site-wide admin remains `users.is_superuser`.**

That is deliberately asymmetric, because `is_superuser` is not merely a flag — it carries machinery
that would all have to be ported for no functional gain:

- a last-administrator invariant (`ensureAnotherAdminRemains`) enforced under a membership lock, so
  the final usable admin cannot be demoted or deactivated;
- a bootstrap route (`POST /users/become-superuser`) that succeeds only while no admin exists;
- eight route guards already reading it through `RequireSuperuser`.

Re-homing that into a grants table means reimplementing the invariant against a different shape and
living with a window in which the column and the table disagree about who is an administrator. The
gain would be uniformity, which is not worth a security-relevant divergence.

```sql
CREATE TABLE core.role_grants (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    role       text NOT NULL,
    game       text NOT NULL,
    granted_by uuid REFERENCES core.users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT role_grants_role_check CHECK (role IN ('game_admin', 'game_moderator')),
    CONSTRAINT role_grants_game_check CHECK (game = ANY (core.game_keys())),
    CONSTRAINT role_grants_unique UNIQUE (user_id, role, game)
);

CREATE INDEX role_grants_game_idx ON core.role_grants (game, role);
CREATE INDEX role_grants_user_idx ON core.role_grants (user_id);
```

`game` is `NOT NULL`: every row here is game-scoped by construction, so there is no nullable-scope
case to get wrong and no need for `NULLS NOT DISTINCT` on the unique key.

`granted_by` is `ON DELETE SET NULL` rather than `CASCADE` — deleting the granting administrator must
not silently revoke the grants they made.

### 3.3 One authorizer, called by name

`canPostToChannel` is replaced by a `roles` package exposing one decision function, keeping the
property its comment asked for — that replacing the policy is a change to one place rather than a hunt
through handlers.

```go
type Action string

const (
    ActionPostOfficial   Action = "post:official"
    ActionFeaturePost    Action = "post:feature"
    ActionHideContent    Action = "content:hide"
    ActionHandleReport   Action = "report:handle"
    ActionGrantGameRole  Action = "role:grant"
)

// Can answers one authorization question. game is "" for a site-wide question.
func (s *Service) Can(ctx context.Context, p auth.Principal, a Action, game string) (bool, error)
```

Rules, all in that one function:

| Action | Site admin | `game_admin` of a relevant game | `game_moderator` of a relevant game |
|---|---|---|---|
| `post:official` | ✔ | ✘ | ✘ |
| `post:feature` | ✔ | ✔ | ✘ |
| `content:hide` | ✔ | ✔ | ✔ |
| `report:handle` | ✔ | ✔ | ✔ |
| `role:grant` | ✔ | ✔ (moderator only, own game) | ✘ |

"Relevant game" for a forum post means any key in its `game_ids`. A post tagged with no game is
site-admin territory only — otherwise a `game_admin` of one game could moderate the general channel.

**Roles are loaded lazily, not in the principal middleware.** The middleware runs on every request
including anonymous ones and currently costs exactly one query; adding a roles read there would tax
every public feed request to answer a question almost none of them ask. `Can` reads the grants for one
user and memoises the result in the request context.

### 3.4 Endpoints

```
GET    /roles/games/{game}            listGameRoles      (public: cabin shows its staff)
PUT    /roles/games/{game}/{uid}      grantGameRole      (site admin, or game_admin for moderator)
DELETE /roles/games/{game}/{uid}      revokeGameRole     (same)
GET    /users/me/roles                listOwnRoles       (signed in)
```

`listGameRoles` being public is what lets the cabin panel render real staff instead of two hardcoded
avatars. It returns `UserPublic` plus the role, and nothing else.

---

## 4. Slice 2 — Reactions

Three narrow tables, not one polymorphic one.

```sql
CREATE TABLE core.forum_post_likes (
    post_id    uuid NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX forum_post_likes_user_idx ON core.forum_post_likes (user_id, created_at DESC);
```

`core.forum_comment_likes` (`comment_id`) and `core.forum_post_bookmarks` (`post_id`) have the same
shape.

**Why not `reactions(target_type, target_id, kind)`.** A polymorphic target column cannot carry a
foreign key, so a like outlives the post it was for and every count silently includes orphans. It also
forces a `target_type` predicate into every read, on an index the planner uses less well than a
dedicated two-column primary key. Three tables cost two extra migrations and buy cascade-correct
deletes for free.

**Counts stay computed.** The existing feed query already computes `comment_count` as a correlated
subquery; likes and bookmarks follow that precedent rather than introducing a second pattern. A
trigger-maintained counter column is the known next step, and the condition that earns it is a
measurement on a real feed page, not a guess. Recorded here so it is a decision rather than an
oversight.

**The viewer's own state** (`liked`, `bookmarked` per row) is an `EXISTS` against the viewer's id. That
requires the feed to know who is asking — see §11.

```
PUT    /forum/posts/{postNo}/like        likePost        (signed in, idempotent)
DELETE /forum/posts/{postNo}/like        unlikePost
PUT    /forum/posts/{postNo}/bookmark    bookmarkPost
DELETE /forum/posts/{postNo}/bookmark    unbookmarkPost
PUT    /forum/comments/{id}/like         likeComment
DELETE /forum/comments/{id}/like         unlikeComment
```

`PUT` rather than `POST`, because liking twice must mean the same as liking once —
`ON CONFLICT DO NOTHING`.

---

## 5. Slice 4 — Social graph

```sql
CREATE TABLE core.user_follows (
    follower_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    followee_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT user_follows_not_self CHECK (follower_id <> followee_id)
);
CREATE INDEX user_follows_followee_idx ON core.user_follows (followee_id, created_at DESC);
```

Self-follow is refused by the schema, not by a service check, so no code path can create one.

```
PUT    /users/{uid}/follow      followUser      (signed in, idempotent)
DELETE /users/{uid}/follow      unfollowUser
GET    /users/{uid}/followers   listFollowers   (paginated, privacy-gated)
GET    /users/{uid}/following   listFollowing   (paginated, privacy-gated)
```

The "following only" feed filter becomes one predicate on the existing list query:
`AND p.author_id IN (SELECT followee_id FROM core.user_follows WHERE follower_id = $viewer)`.

---

## 6. Slice 3 — Post images

```sql
CREATE TABLE core.forum_post_images (
    post_id    uuid     NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    position   smallint NOT NULL,
    object_key text     NOT NULL,
    width      integer  NOT NULL,
    height     integer  NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, position),
    CONSTRAINT forum_post_images_position CHECK (position BETWEEN 0 AND 8),
    CONSTRAINT forum_post_images_key_shape
        CHECK (object_key ~ '^forum/u/[0-9]+/[A-Za-z0-9_-]{43}\.(jpg|png|gif|webp)$')
);
```

The key-shape check mirrors `users_avatar_key_shape`, which exists so a client-supplied string can
never become an arbitrary object key. Post images need their own; the avatar constraint does not cover
this table.

**Keyed on the author's `uid`, not the post number.** `blob.Store` is `Put`/`Delete`/`List`/`PublicURL`
— there is deliberately no `Get`, and no copy or move. So an image cannot be uploaded to a draft
prefix and relocated when the post is created. Keying on the author instead means upload can precede
the post, and it makes orphan reclamation a scoped `List` over one user's prefix rather than a bucket
sweep — the same reason avatars are keyed on `uid`.

**Re-encode, do not pass through.** The avatar pipeline strips EXIF as a side effect of always
decoding and re-encoding; there is no metadata parser. Post images reuse that discipline and its
decode-order rules (header-only `DecodeConfig` for dimensions before allocating pixels; format taken
from the decoder, never from the client's content type), but not its 256×256 centre crop — a post image
keeps its aspect ratio, bounded by a max edge.

**Deletes are best-effort, as everywhere else here.** The DB row goes by cascade; the object is
reclaimed after. Worth knowing before copying the helper: `RemoveSupersededUploads` returns on the
first failed `Delete`, so one pass is not exhaustive — it is self-healing across calls, not within one.

```
POST   /forum/posts/{postNo}/images        attachImage   (author, rate limited per account)
DELETE /forum/posts/{postNo}/images/{pos}  detachImage   (author)
```

---

## 7. Slice 5 — Feeds, ranking and search

**Sort.** `sort=new|hot|top`, default `new` (today's only order, `created_at DESC, id`).
`hot` ranks on engagement decayed by age; `top` on raw engagement in a window. The score is computed
in the query, not stored, until a measurement says otherwise.

**Featured becomes editorial, with an actor.** `forum_posts.featured_at timestamptz` and
`featured_by uuid REFERENCES core.users (id) ON DELETE SET NULL`, set through `ActionFeaturePost`.
This is the honest replacement for the fixture boolean that currently serves three different meanings
in the UI at once.

**Search: trigram, not `tsvector`.** The obvious move is a generated `tsvector` column with a GIN
index. It is the wrong one here: the content is mixed Chinese and English, and Postgres' default
configurations do not segment CJK — `to_tsvector('simple', …)` would index a whole Chinese sentence as
one token and match almost nothing. `pg_trgm` with a GIN index on `lower(title || ' ' || body)`
supports substring matching that behaves acceptably for both scripts, and it is an extension already
available in the `postgres:18` image. A real CJK-segmenting index (`pgroonga`, `pg_bigm`) is a
container change and is out of scope; this is recorded so the choice reads as deliberate.

---

## 8. Slice 6 — Notifications

```sql
CREATE TABLE core.notifications (
    id           uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    kind         text NOT NULL,
    actor_id     uuid REFERENCES core.users (id) ON DELETE CASCADE,
    post_id      uuid REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    comment_id   uuid REFERENCES core.forum_comments (id) ON DELETE CASCADE,
    body         text,
    read_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT notifications_kind_check CHECK (kind IN
        ('reply', 'mention', 'post_like', 'comment_like', 'follow', 'system')),
    -- A system message has no actor; everything else has one.
    CONSTRAINT notifications_actor_check CHECK ((kind = 'system') = (actor_id IS NULL)),
    -- Acting on your own content notifies nobody. Enforced here so no code path can.
    CONSTRAINT notifications_no_self CHECK (actor_id IS NULL OR actor_id <> recipient_id)
);

CREATE INDEX notifications_inbox_idx  ON core.notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON core.notifications (recipient_id) WHERE read_at IS NULL;
```

The partial index is what makes the unread badge a cheap count rather than a scan of a growing inbox.

**Written synchronously, in the same transaction as the action that caused it.** There is no queue in
this system and adding one for a single `INSERT` would be the largest piece of new infrastructure in
this document. The failure mode is honest: if the notification cannot be written, the like or reply
that caused it fails too, rather than succeeding into a silently empty inbox.

**Preferences are columns, not JSON**, so a typo is a compile error rather than a silently ignored
key:

```sql
CREATE TABLE core.notification_preferences (
    user_id      uuid PRIMARY KEY REFERENCES core.users (id) ON DELETE CASCADE,
    reply        boolean NOT NULL DEFAULT true,
    mention      boolean NOT NULL DEFAULT true,
    post_like    boolean NOT NULL DEFAULT true,
    comment_like boolean NOT NULL DEFAULT true,
    follow       boolean NOT NULL DEFAULT true,
    system       boolean NOT NULL DEFAULT true,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
```

An absent row means every default, so nothing needs backfilling.

**Mentions** are parsed from the stored markdown by the existing `forum/markdown` package and resolved
to accounts. Fan-out is capped per post, because a body listing fifty names is a notification bomb
with a legitimate-looking shape.

---

## 9. Slice 7 — Moderation

**Hiding is not deleting.** Authors keep the hard `DELETE` they have today. Moderators get a soft hide,
so the action is reversible and auditable:

```sql
ALTER TABLE core.forum_posts
    ADD COLUMN hidden_at     timestamptz,
    ADD COLUMN hidden_by     uuid REFERENCES core.users (id) ON DELETE SET NULL,
    ADD COLUMN hidden_reason text,
    ADD CONSTRAINT forum_posts_hidden_together
        CHECK ((hidden_at IS NULL) = (hidden_by IS NULL));
```

Same three columns on `core.forum_comments`. Every public read gains `AND hidden_at IS NULL`; a
moderator's queue omits it.

```sql
CREATE TABLE core.forum_reports (
    id          uuid PRIMARY KEY,
    reporter_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    post_id     uuid REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    comment_id  uuid REFERENCES core.forum_comments (id) ON DELETE CASCADE,
    reason      text NOT NULL,
    detail      text,
    state       text NOT NULL DEFAULT 'open',
    handled_by  uuid REFERENCES core.users (id) ON DELETE SET NULL,
    handled_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT forum_reports_reason_check CHECK (reason IN
        ('spam', 'abuse', 'offtopic', 'illegal', 'other')),
    CONSTRAINT forum_reports_state_check CHECK (state IN ('open', 'upheld', 'rejected')),
    -- Exactly one target. Two nullable foreign keys keep referential integrity that a
    -- polymorphic (target_type, target_id) pair would have to give up.
    CONSTRAINT forum_reports_one_target CHECK (num_nonnulls(post_id, comment_id) = 1),
    -- One report per reporter per target. NULLS NOT DISTINCT is required: under the default,
    -- NULLs compare unequal and the same reporter could file unlimited reports on one post.
    CONSTRAINT forum_reports_once UNIQUE NULLS NOT DISTINCT (reporter_id, post_id, comment_id)
);
```

`NULLS NOT DISTINCT` is the detail that makes the unique constraint mean what it says. Slice 1 relied
on the opposite default deliberately, to let every reply carry a `NULL` floor number; here the same
default would defeat the constraint entirely.

Authorization is `ActionHandleReport` / `ActionHideContent` from §3.3, so a `game_moderator` of
Palworld can act on Palworld-tagged content and nothing else. This is the slice that pays for roles
being built first.

---

## 10. Slice 8 — Privacy

```sql
CREATE TABLE core.user_privacy (
    user_id            uuid PRIMARY KEY REFERENCES core.users (id) ON DELETE CASCADE,
    profile_visibility  text NOT NULL DEFAULT 'public',
    posts_visibility    text NOT NULL DEFAULT 'public',
    activity_visibility text NOT NULL DEFAULT 'public',
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_privacy_levels CHECK (
        profile_visibility  IN ('public', 'followers', 'private') AND
        posts_visibility    IN ('public', 'followers', 'private') AND
        activity_visibility IN ('public', 'followers', 'private'))
);
```

An absent row is all-public, so no backfill: reads `LEFT JOIN` and `COALESCE`.

**One distinction worth stating, because getting it wrong would be a content-moderation bug wearing a
privacy setting.** `posts_visibility` governs whether *someone else's profile page* lists a user's
posts. It does **not** remove those posts from the global feed. Withdrawing content from the board is
deletion (the author's) or hiding (a moderator's) — never a privacy toggle. A setting that silently
unpublished content would give authors a takedown mechanism that leaves the post reachable by
permalink, which is worse than either honest option.

---

## 11. Cross-cutting: the feed becomes viewer-aware

Reactions, the following-only filter and privacy all need to know who is asking. `GET /forum/posts` is
public and reads no principal today.

The mechanism already exists and is unused: the principal middleware runs on the whole module router
*before* huma, so it populates a principal for public routes too, and it **never rejects** — anonymous,
expired, forged and stale-fingerprint callers all arrive identically as "no principal". `PrincipalFrom`
exists for exactly this and currently has no non-test caller. The feed handlers become its first real
use.

Two consequences to carry:

- **A viewer-aware response must never be cached publicly.** Any caching layer added in front of these
  routes needs `Cache-Control: private`, or one user's `liked` flags get served to another.
- **Anonymous responses stay the current shape**, with `liked`/`bookmarked` false rather than absent, so
  clients need no branch.

---

## 12. Conformance fixes that land first

Three defects found while writing this, all corrections to shipped work rather than new features. They
go in one PR ahead of slice 9, because later slices build on them:

1. **`game_ids` is unvalidated.** The migration comment claims "games are a compile-time registry in
   Go", architecture §5 requires a check constraint, and neither exists — `normaliseList` only trims,
   dedupes and bounds length. Fixed by the `core.game_keys()` check of §2.3 plus `enum` tags on the
   request bodies, which also narrows the generated TS to a union so a mismatch between `sites.ts` and
   the server becomes a compile error.
2. **The author filter is plumbed but unreachable.** `ListForumPosts` and `CountForumPosts` both accept
   `author_id`, the index exists, and `ListFilter.AuthorID` is passed to SQL — but the handler never
   sets it. Exposing it is one query parameter, and it is what "my posts" and public profile post lists
   need.
3. **`PostRead.channel` generates as bare `string`** while `CreatePostBody.channel` is a proper union,
   because the response DTO is missing its `enum` tag.

Validation belongs on writes only. The `gameId` **query** parameter stays unconstrained, so a stale
link returns an empty feed rather than a 422.

---

## 13. Out of scope

- **Marker comments**, beyond the reserved shape in §2.4. They are blocked on the stable-marker-key
  guarantee from architecture §1.1, which lives in `tools`.
- **Progress and feedback**, the other two game-scoped packages. They inherit §2.1's partitioning and
  §2.4's addressing rule when they are built.
- **A CJK-segmenting search index.** §7 ships trigram; `pgroonga`/`pg_bigm` is a container change.
- **Denormalised counters.** §4 records the condition that would earn them.
- **Redis-backed rate limiting for the new write endpoints.** They use the same in-process
  `auth.RateLimiter` as posting and avatar upload, with their own instances, and inherit the same known
  limitation: the allowance multiplies once the service runs as more than one process.
- **Editing windows, and moving site admin into `role_grants`** (§3.2).
- **No app changelog entry** for any of these slices until the frontend calls them; this is backend work
  with no user-visible surface on its own.
