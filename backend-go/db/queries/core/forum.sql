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
-- name: ListForumPosts :many
SELECT
    p.*,
    (SELECT count(*) FROM core.forum_comments c WHERE c.post_id = p.id) AS comment_count
FROM core.forum_posts p
WHERE (sqlc.narg('channel')::text IS NULL OR p.channel = sqlc.narg('channel')::text)
  AND (sqlc.narg('game_id')::text IS NULL OR p.game_ids @> ARRAY[sqlc.narg('game_id')::text])
  AND (sqlc.narg('tag')::text     IS NULL OR p.tags     @> ARRAY[sqlc.narg('tag')::text])
  AND (sqlc.narg('author_id')::uuid IS NULL OR p.author_id = sqlc.narg('author_id')::uuid)
ORDER BY p.created_at DESC, p.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountForumPosts :one
SELECT count(*) FROM core.forum_posts p
WHERE (sqlc.narg('channel')::text IS NULL OR p.channel = sqlc.narg('channel')::text)
  AND (sqlc.narg('game_id')::text IS NULL OR p.game_ids @> ARRAY[sqlc.narg('game_id')::text])
  AND (sqlc.narg('tag')::text     IS NULL OR p.tags     @> ARRAY[sqlc.narg('tag')::text])
  AND (sqlc.narg('author_id')::uuid IS NULL OR p.author_id = sqlc.narg('author_id')::uuid);

-- name: CountForumPostComments :one
SELECT count(*) FROM core.forum_comments WHERE post_id = $1;

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

-- A thread's comments in one response: floors in order, each reply directly after
-- the floor it belongs to. Ordering by the floor number of the comment or of its
-- parent keeps a reply adjacent to its parent without a second query.
-- name: ListForumComments :many
SELECT c.*
FROM core.forum_comments c
LEFT JOIN core.forum_comments parent ON parent.id = c.parent_id
WHERE c.post_id = $1
ORDER BY COALESCE(c.comment_no, parent.comment_no), c.depth, c.created_at, c.id;
