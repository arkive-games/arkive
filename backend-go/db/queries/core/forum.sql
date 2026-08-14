-- name: CreateForumPost :one
INSERT INTO core.forum_posts (id, author_id, channel, title, body, topic, game_ids, tags)
VALUES ($1, $2, $3, $4, $5, sqlc.narg('topic'), $6, $7)
RETURNING *;

-- name: GetForumPostByNo :one
SELECT * FROM core.forum_posts WHERE post_no = $1;

-- name: GetForumPostByID :one
SELECT * FROM core.forum_posts WHERE id = $1;

-- Partial edit, following the convention of UpdateUser: a NULL argument means
-- "leave unchanged". edited_at is stamped unconditionally, because reaching this
-- statement at all means an author changed something.
-- name: UpdateForumPost :one
UPDATE core.forum_posts SET
    title     = COALESCE(sqlc.narg('title'), title),
    body      = COALESCE(sqlc.narg('body'), body),
    topic     = CASE WHEN sqlc.arg('set_topic')::boolean
                     THEN sqlc.narg('topic')::text ELSE topic END,
    game_ids  = COALESCE(sqlc.narg('game_ids')::text[], game_ids),
    tags      = COALESCE(sqlc.narg('tags')::text[], tags),
    edited_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteForumPost :execrows
DELETE FROM core.forum_posts WHERE id = $1;

-- Feed listing, with every filter optional.
--
-- The comment count is a lateral subquery rather than a stored counter: it is
-- correct by construction, and a counter column can replace it behind the DTO if
-- the feed ever gets slow.
-- The viewer's own state (`liked`, `bookmarked`) needs no NULL guard: when no viewer
-- is supplied, `user_id = NULL` is never true, so EXISTS is false and an anonymous
-- reader sees the same shape with both flags off. That keeps clients from needing a
-- branch for signed-out reads.
-- name: ListForumPosts :many
SELECT
    p.*,
    (SELECT count(*) FROM core.forum_comments c WHERE c.post_id = p.id AND c.hidden_at IS NULL) AS comment_count,
    (SELECT count(*) FROM core.forum_post_likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT count(*) FROM core.forum_post_bookmarks b WHERE b.post_id = p.id) AS bookmark_count,
    EXISTS (
        SELECT 1 FROM core.forum_post_likes l
        WHERE l.post_id = p.id AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked,
    EXISTS (
        SELECT 1 FROM core.forum_post_bookmarks b
        WHERE b.post_id = p.id AND b.user_id = sqlc.narg('viewer_id')::uuid
    ) AS bookmarked
FROM core.forum_posts p
WHERE p.hidden_at IS NULL
  AND (sqlc.narg('channel')::text IS NULL OR p.channel = sqlc.narg('channel')::text)
  AND (sqlc.narg('game_id')::text IS NULL OR p.game_ids @> ARRAY[sqlc.narg('game_id')::text])
  AND (sqlc.narg('tag')::text     IS NULL OR p.tags     @> ARRAY[sqlc.narg('tag')::text])
  AND (sqlc.narg('author_id')::uuid IS NULL OR p.author_id = sqlc.narg('author_id')::uuid)
  -- The "following only" feed. IN rather than a join, so a post is not duplicated
  -- and the predicate composes with every other filter.
  AND (sqlc.narg('followed_by')::uuid IS NULL OR p.author_id IN (
      SELECT f.followee_id FROM core.user_follows f
      WHERE f.follower_id = sqlc.narg('followed_by')::uuid))
  AND (sqlc.narg('featured')::boolean IS NULL
       OR (p.featured_at IS NOT NULL) = sqlc.narg('featured')::boolean)
  -- The expression matches forum_posts_search_idx exactly, which is what lets a
  -- substring query use the trigram index instead of scanning every body.
  AND (sqlc.narg('query')::text IS NULL
       OR lower(p.title || ' ' || p.body) LIKE '%' || lower(sqlc.narg('query')::text) || '%')
ORDER BY
    -- One statement rather than three, so every filter above is written once. A CASE
    -- per sort collapses to NULL for the orders not chosen, and NULLS LAST keeps those
    -- from dominating; `created_at DESC, id` is both the default order and the
    -- tie-break that makes paging deterministic under the other two.
    CASE WHEN sqlc.arg('sort')::text = 'top' THEN
        (SELECT count(*) FROM core.forum_post_likes l WHERE l.post_id = p.id)
    END DESC NULLS LAST,
    -- Engagement decayed by age. Comments weigh double: writing one costs more than
    -- tapping a heart, so it is the stronger signal that a thread is alive. The +2 and
    -- the 1.5 exponent are a starting shape, not a tuned result -- recorded as such
    -- because a ranking formula invites being mistaken for one.
    CASE WHEN sqlc.arg('sort')::text = 'hot' THEN
        ((SELECT count(*) FROM core.forum_post_likes l WHERE l.post_id = p.id)
         + 2 * (SELECT count(*) FROM core.forum_comments c WHERE c.post_id = p.id AND c.hidden_at IS NULL) + 1)
        / power(extract(epoch FROM (now() - p.created_at)) / 3600.0 + 2, 1.5)
    END DESC NULLS LAST,
    p.created_at DESC, p.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- The predicates must stay identical to ListForumPosts, or the pager offers pages the
-- feed will not return. Sorting is absent on purpose: it cannot change a count.
-- name: CountForumPosts :one
SELECT count(*) FROM core.forum_posts p
WHERE p.hidden_at IS NULL
  AND (sqlc.narg('channel')::text IS NULL OR p.channel = sqlc.narg('channel')::text)
  AND (sqlc.narg('game_id')::text IS NULL OR p.game_ids @> ARRAY[sqlc.narg('game_id')::text])
  AND (sqlc.narg('tag')::text     IS NULL OR p.tags     @> ARRAY[sqlc.narg('tag')::text])
  AND (sqlc.narg('author_id')::uuid IS NULL OR p.author_id = sqlc.narg('author_id')::uuid)
  AND (sqlc.narg('followed_by')::uuid IS NULL OR p.author_id IN (
      SELECT f.followee_id FROM core.user_follows f
      WHERE f.follower_id = sqlc.narg('followed_by')::uuid))
  AND (sqlc.narg('featured')::boolean IS NULL
       OR (p.featured_at IS NOT NULL) = sqlc.narg('featured')::boolean)
  AND (sqlc.narg('query')::text IS NULL
       OR lower(p.title || ' ' || p.body) LIKE '%' || lower(sqlc.narg('query')::text) || '%');

-- name: SetForumPostFeatured :one
-- Both columns move together, which the forum_posts_featured_together constraint
-- requires: a featured post always records who featured it.
UPDATE core.forum_posts SET
    featured_at = CASE WHEN sqlc.arg('featured')::boolean THEN now() ELSE NULL END,
    featured_by = CASE WHEN sqlc.arg('featured')::boolean THEN sqlc.narg('actor_id')::uuid ELSE NULL END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: CountForumPostComments :one
SELECT count(*) FROM core.forum_comments WHERE post_id = $1 AND hidden_at IS NULL;

-- Everything a single post's DTO needs beyond its own row, in one round trip rather
-- than one query per counter.
-- name: ForumPostReactions :one
SELECT
    (SELECT count(*) FROM core.forum_comments c
        WHERE c.post_id = sqlc.arg('post_id') AND c.hidden_at IS NULL) AS comment_count,
    (SELECT count(*) FROM core.forum_post_likes l
        WHERE l.post_id = sqlc.arg('post_id')) AS like_count,
    (SELECT count(*) FROM core.forum_post_bookmarks b
        WHERE b.post_id = sqlc.arg('post_id')) AS bookmark_count,
    EXISTS (
        SELECT 1 FROM core.forum_post_likes l
        WHERE l.post_id = sqlc.arg('post_id') AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked,
    EXISTS (
        SELECT 1 FROM core.forum_post_bookmarks b
        WHERE b.post_id = sqlc.arg('post_id') AND b.user_id = sqlc.narg('viewer_id')::uuid
    ) AS bookmarked;

-- Creates a top-level comment and allocates its floor number in one statement.
--
-- The number comes from a counter on the post, not from max(comment_no) + 1:
-- deleting the highest comment must not hand its number to the next one. The
-- UPDATE takes a row lock on the post, which serialises comment creation for
-- that thread and nothing else, and because both halves are one statement a
-- failed insert rolls the counter back rather than burning a number.
-- name: CreateForumComment :one
WITH allocated AS (
    UPDATE core.forum_posts
    SET next_comment_no = next_comment_no + 1
    WHERE id = sqlc.arg('post_id')
    RETURNING next_comment_no - 1 AS comment_no
)
INSERT INTO core.forum_comments (id, post_id, parent_id, author_id, body, comment_no)
SELECT sqlc.arg('id'), sqlc.arg('post_id'), NULL, sqlc.arg('author_id'),
       sqlc.arg('body'), allocated.comment_no
FROM allocated
RETURNING *;

-- Creates a reply. No floor number is allocated: only top-level comments are
-- numbered, and the schema refuses a comment_no on a row that has a parent.
--
-- The composite foreign key refuses this outright if parent_id names a reply
-- rather than a top-level comment, which is what keeps the thread two levels deep.
-- name: CreateForumReply :one
INSERT INTO core.forum_comments (id, post_id, parent_id, author_id, body, comment_no)
VALUES ($1, $2, $3, $4, $5, NULL)
RETURNING *;

-- name: GetForumCommentByID :one
SELECT * FROM core.forum_comments WHERE id = $1;

-- name: UpdateForumComment :one
UPDATE core.forum_comments SET body = $2, edited_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteForumComment :execrows
DELETE FROM core.forum_comments WHERE id = $1;

-- A page of a thread's comments: floors in order, each reply directly after the
-- floor it belongs to. Ordering by the floor number of the comment or of its
-- parent keeps a reply adjacent to its parent without a second query.
--
-- Bounded, unlike an earlier version. This endpoint is public and unauthenticated,
-- so a thread with ten thousand long comments would otherwise let anyone ask the
-- server to build a response of hundreds of megabytes.
-- name: ListForumComments :many
SELECT
    c.*,
    (SELECT count(*) FROM core.forum_comment_likes l WHERE l.comment_id = c.id) AS like_count,
    EXISTS (
        SELECT 1 FROM core.forum_comment_likes l
        WHERE l.comment_id = c.id AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked
FROM core.forum_comments c
-- The parent join is for ordering only and deliberately does not exclude a hidden
-- parent: a reply is its own author's words, so hiding the comment above it must not
-- take it down, and the parent's floor number is still what the reply sorts under.
LEFT JOIN core.forum_comments parent ON parent.id = c.parent_id
WHERE c.post_id = sqlc.arg('post_id') AND c.hidden_at IS NULL
ORDER BY COALESCE(c.comment_no, parent.comment_no), c.depth, c.created_at, c.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');
