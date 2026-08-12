# Forum Backend — Posts and Comments

Date: 2026-08-13
Status: accepted

The meta app ships a forum that exists entirely in the browser: `ForumPage.tsx` renders
fixtures, and `UserSystemState.tsx` keeps what a visitor writes in `localStorage`. This gives
it a server.

## 1. Scope, and why this is one slice of eight

The frontend already models far more than a posting API. Taken together, `ForumPage.tsx` and
`UserSystemState.tsx` imply eight subsystems:

| | Surface already rendered |
|---|---|
| Posts | title, body, channel, `gameIds[]`, topic, `tags[]`, `imageSrcs[]`, `videoUrl` |
| Comments | counts per post, likes per comment |
| Reactions | `likedPostIds`, `likedCommentIds`, `bookmarkedPostIds` |
| Social graph | `followedUserIds`, fans and following lists, public profiles |
| Notifications | replies, mentions, likes, system; read state; six preference toggles |
| Feeds | a `hot` channel and `recommended`/`latest`/`featured` tabs |
| Media | several images per post, plus a video URL |
| Privacy and moderation | profile/posts/activity visibility; no reporting yet |

Building those together would be a month of unreviewable work, and the dependencies force an
order anyway:

```
1. Posts + comments        <- this document; the spine everything else hangs off
2. Reactions               <- needs 1
3. Post images             <- needs 1; reuses platform/blob and core/uploads
4. Social graph            <- mostly independent
5. Feeds and ranking       <- needs 1, 2
6. Notifications           <- needs 1-4 as event sources
7. Moderation              <- needs 1
8. Privacy                 <- needs 1, 4
```

**This document covers posts and comments only.** Everything else is named here to fix the
boundaries, exactly as the architecture document did for `core`.

### 1.1 This is not the reserved `comments` package

`2026-08-08-go-backend-architecture-design.md` reserves `internal/core/comments`, described as
game-scoped and taking a game key — comments attached to a map marker. The forum is global: it
lives on `meta` and treats games as *tags*, so a post can carry five of them or none.

They are different things that share a noun. The forum gets `internal/core/forum`; the reserved
package stays reserved for marker comments.

## 2. Schema

### 2.1 Posts

```sql
core.forum_posts (
  id        uuid PRIMARY KEY,
  post_no   bigint GENERATED ALWAYS AS IDENTITY UNIQUE,   -- the permalink
  author_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  channel   text NOT NULL CHECK (channel IN ('general','official','games')),
  title     text NOT NULL,
  body      text NOT NULL,                                -- raw markdown, never rendered here
  topic     text CHECK (topic IN ('guide','question','testing','discussion')),
  game_ids  text[] NOT NULL DEFAULT '{}' CHECK (cardinality(game_ids) <= 5),
  tags      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags)     <= 10),

  next_comment_no bigint NOT NULL DEFAULT 1,              -- see 2.3
  created_at, updated_at, edited_at
)
```

`post_no` follows the account `uid` precedent: the uuid stays the primary key and internal
handle, a number from an identity sequence is the public identity, so a permalink is
`/forum/p/1042` and never changes or repeats.

`game_ids` is an array rather than a join table because there is nothing to join *to* — the
architecture document makes games a compile-time registry in Go, not a table. A GIN index
answers `game_ids @> ARRAY['palworld']` directly. The cardinality limits match the composer's
own caps (`FORUM_GAME_MAX_COUNT`, `FORUM_TAG_MAX_COUNT`).

`hot` is a derived feed, never a stored channel.

### 2.2 Comments, and a two-level limit the schema enforces

```sql
core.forum_comments (
  id         uuid PRIMARY KEY,
  post_id    uuid NOT NULL REFERENCES core.forum_posts(id) ON DELETE CASCADE,
  parent_id  uuid,                                        -- NULL for a top-level comment
  author_id  uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  comment_no bigint,                                      -- the floor number; NULL on a reply

  depth        smallint GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END) STORED,
  parent_depth smallint GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN NULL ELSE 0 END) STORED,

  CONSTRAINT forum_comments_no_iff_top_level
    CHECK ((parent_id IS NULL) = (comment_no IS NOT NULL)),
  UNIQUE (post_id, comment_no),
  UNIQUE (id, depth),
  FOREIGN KEY (parent_id, parent_depth)
    REFERENCES core.forum_comments (id, depth) ON DELETE CASCADE,
  created_at, updated_at, edited_at
)
```

A thread has comments; a comment has replies; nothing nests further. That rule is enforced by
the schema rather than by application code, with no trigger:

- `depth` is **generated**, so it cannot be supplied or lied about.
- `parent_depth` is `0` whenever there is a parent, and the composite foreign key requires
  `(parent_id, 0)` to exist — so a reply's parent must itself be top-level.

Verified against PostgreSQL 18 from four angles: a top-level comment inserts, a reply to it
inserts at depth 1, **a reply to that reply is refused** by the foreign key, and supplying
`depth` at all is refused with `cannot insert a non-DEFAULT value`.

An earlier draft made `depth` an ordinary column with a `CHECK (depth IN (0,1))`. That had a
hole: a row could claim `depth 0` while holding a parent, which made it a legitimate parent for
a further reply and produced three levels through the back door. Generating the column closed
it, and this is recorded because the hole was invisible until it was tested for.

`UNIQUE (post_id, comment_no)` treats NULLs as distinct in PostgreSQL, so every reply can carry
`NULL` while floor numbers stay unique per thread.

### 2.3 Floor numbers, and why not `max + 1`

Only top-level comments are numbered. Numbering starts at 1 per thread and **a number is never
reused**: delete floor 20 and the next comment is 21.

`max(comment_no) + 1` cannot do that. It reads the surviving rows, so deleting the highest
comment hands its number straight back out. The allocator is instead a counter on the post,
advanced and consumed in a single statement:

```sql
WITH allocated AS (
  UPDATE core.forum_posts SET next_comment_no = next_comment_no + 1
  WHERE id = $1 RETURNING next_comment_no - 1 AS no
)
INSERT INTO core.forum_comments (post_id, comment_no, author_id, body)
SELECT $1, no, $2, $3 FROM allocated
RETURNING *
```

Four properties, all measured rather than argued:

| Property | Result |
|---|---|
| Sequential from 1 | floors 1–20 |
| Deleting 20 does not free it | next floor was **21** |
| Concurrent inserts | 8 writers, 40 inserts: 60 rows, 60 distinct numbers, 0 duplicates |
| A failed insert | counter unchanged, so no number is burned |

The `UPDATE` takes a row lock on the post, which serialises comment creation *per thread* —
the right granularity, since one thread's comments are low-rate and separate threads never
block each other. `UNIQUE (post_id, comment_no)` is the backstop if that reasoning is ever
wrong. Because the allocation and the insert are one statement, a failure rolls the counter
back with it, so gaps come only from deletions, which is what a reader expects when floor 20 is
missing.

### 2.4 Deletion cascades

Deleting a post deletes its comments. Deleting a top-level comment deletes its replies, and the
retired floor number stays retired. This is a deliberate choice over tombstoning: it means
deleting a comment removes replies other people wrote, which is the cost of a forum where
"delete" genuinely deletes.

## 3. HTTP surface

| Route | Auth | Notes |
|---|---|---|
| `GET /forum/posts` | public | `channel`, `gameId`, `tag`, `page`, `pageSize` |
| `GET /forum/posts/{postNo}` | public | |
| `POST /forum/posts` | user | rate limited per account |
| `PATCH /forum/posts/{postNo}` | author or admin | sets `edited_at` |
| `DELETE /forum/posts/{postNo}` | author or admin | |
| `GET /forum/posts/{postNo}/comments` | public | floors with their replies nested |
| `POST /forum/posts/{postNo}/comments` | user | optional `parentId` makes it a reply |
| `PATCH`/`DELETE /forum/comments/{id}` | author or admin | |

Posts and floors are addressed by number; uuids stay internal. Replies are the exception: they
are addressed by uuid in the mutation routes, because a reply has no floor number and those
routes are operation targets rather than links anyone shares. If notifications later need to
deep-link one reply, the counter mechanism of §2.3 applies unchanged to a `next_reply_no` on the
comment row.

Pagination is offset and limit, as the composer's five-page pager already expects. The
consequence is recorded rather than hidden: on an append-heavy feed, offsets **duplicate** rows
as new posts arrive, which the frontend de-duplicates, and **skip** rows when posts are deleted,
which it cannot. At slice-1 volume that is acceptable; the ranked `recommended` and `featured`
feeds of a later slice reorder constantly and will need keyset pagination.

Authors appear as `UserPublic` — uid, name, `avatarUrl` — so the forum inherits the account
number and avatar work rather than restating it.

`commentCount` is a lateral subquery for now. A counter column is the upgrade path if the feed
ever gets slow, and it sits behind the DTO.

## 4. Who may post where

`official` is administrators only. `general` and `games` are open to any signed-in account.

That rule lives in one function, `canPostToChannel(principal, channel)`, deliberately: it is a
hardcoded placeholder for a permission system that does not exist yet, and keeping it in one
named place is what makes replacing it a change to one function rather than a hunt through
handlers.

## 5. Abuse controls

Posting and commenting are rate limited **per account** using the existing
`auth.RateLimiter.AllowKey`, which the avatar upload already keys on the account uuid rather
than the address — the caller is known, so throttling by IP would penalise everyone behind one
NAT while doing nothing about one account in a loop. Settings: `FORUM_POSTS_PER_MINUTE`
(default 2) and `FORUM_COMMENTS_PER_MINUTE` (default 10).

Authors may edit and delete their own posts and comments; administrators may delete anything.
Reporting, hiding and takedown are the moderation slice.

## 6. Markdown is stored raw, and that puts a requirement on the frontend

Bodies are stored exactly as written and rendered client-side. The backend never renders
markdown, which keeps a sanitiser bug out of the stored data.

**This makes the renderer a security boundary, and it is worth being explicit about why.** The
meta app is served from `*.tc-imba.com`, and `AUTH_COOKIE_DOMAIN` scopes the session cookie to
that whole registrable domain for cross-subdomain sign-in. A markdown renderer that permits raw
HTML would therefore turn any post into stored XSS with access to that cookie — session theft
across every Arkive site, from text anybody can submit.

The backend cannot prevent that; it can only avoid contributing to it. So the requirement is
recorded here as a condition of this design:

- the renderer must have raw HTML disabled;
- post and comment bodies must never reach `dangerouslySetInnerHTML`;
- link targets must be restricted to `http`/`https`, since `javascript:` in a markdown link is
  the other common route.

Bounds enforced server-side: title 1–200 characters, body 1–20000, tag 1–32 each.

## 7. Tests

Against a real PostgreSQL, because the invariants are schema invariants:

- the two-level rule from all four angles of §2.2, including that `depth` cannot be supplied;
- floor numbers: sequential, not reused after a delete, unique under concurrent inserts, and
  not burned by a failed insert;
- cascades: post to comments, comment to replies;
- array cardinality caps.

Service level, against the in-memory harness: ownership (author edits, non-author gets 403 and
not 404), the administrator override, `official` refused to a non-administrator, rate limiting
per account, and every validation bound.

HTTP level, through the existing `internal/core` harness: the full create-read-comment-reply
flow, pagination, and that an anonymous caller can read but not write.

## 8. Out of scope

Reactions, images, follows, feeds, notifications, moderation and privacy — each its own slice
per §1. Also: editing windows (an author may edit indefinitely, with `edited_at` recorded),
comment pagination (a thread returns its comments in one response), and full-text search.

No app changelog entry: this is backend work with no user-visible surface until the frontend
calls it.
