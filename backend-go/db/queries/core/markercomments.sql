-- Marker comments. Every write is idempotent where the client can legitimately
-- retry, and every read excludes hidden rows because hiding is the only takedown
-- that is reversible.

-- name: CreateMarkerComment :one
-- A top-level comment. No floor number, no ordering counter: the client sorts by
-- time or by likes, and unlike a forum thread there is no "floor" a reader quotes.
INSERT INTO core.marker_comments (id, game_key, map_id, marker_id, author_id, parent_id, body)
VALUES (sqlc.arg('id'), sqlc.arg('game_key'), sqlc.arg('map_id'), sqlc.arg('marker_id'),
        sqlc.arg('author_id'), NULL, sqlc.arg('body'))
RETURNING *;

-- name: CreateMarkerCommentReply :one
-- The composite foreign key refuses this outright when the parent is itself a
-- reply, or sits on a different marker, so the service's own checks are a better
-- message rather than the only defence.
INSERT INTO core.marker_comments (id, game_key, map_id, marker_id, author_id, parent_id, body)
VALUES (sqlc.arg('id'), sqlc.arg('game_key'), sqlc.arg('map_id'), sqlc.arg('marker_id'),
        sqlc.arg('author_id'), sqlc.arg('parent_id'), sqlc.arg('body'))
RETURNING *;

-- name: GetMarkerCommentByID :one
SELECT * FROM core.marker_comments WHERE id = $1;

-- name: UpdateMarkerComment :one
UPDATE core.marker_comments SET body = sqlc.arg('body'), edited_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMarkerComment :execrows
-- A soft delete: the row stays so reports against it stay answerable. See the
-- migration that added deleted_at.
UPDATE core.marker_comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL;

-- name: SetMarkerCommentHidden :one
-- All three columns move together, which marker_comments_hidden_together requires.
UPDATE core.marker_comments SET
    hidden_at     = CASE WHEN sqlc.arg('hidden')::boolean THEN now() ELSE NULL END,
    hidden_by     = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('actor_id')::uuid ELSE NULL END,
    hidden_reason = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('reason')::text ELSE NULL END
WHERE id = sqlc.arg('id')
RETURNING *;

-- One page of a marker's top-level comments, with the counters the drawer needs
-- in the same round trip rather than one query per comment.
--
-- 'popular' counts likes; 'latest' is newest first. Both break ties by id so a
-- page boundary is stable — without it, two comments created in the same
-- microsecond can swap places between pages and a reader sees one twice.
-- name: ListMarkerComments :many
SELECT
    c.*,
    (SELECT count(*) FROM core.marker_comments r
        WHERE r.parent_id = c.id AND r.hidden_at IS NULL AND r.deleted_at IS NULL) AS reply_count,
    (SELECT count(*) FROM core.marker_comment_likes l
        WHERE l.comment_id = c.id) AS like_count,
    EXISTS (
        SELECT 1 FROM core.marker_comment_likes l
        WHERE l.comment_id = c.id AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked
FROM core.marker_comments c
WHERE c.game_key = sqlc.arg('game_key')
  AND c.map_id = sqlc.arg('map_id')
  AND c.marker_id = sqlc.arg('marker_id')
  AND c.parent_id IS NULL
  AND c.hidden_at IS NULL
  AND c.deleted_at IS NULL
ORDER BY
    CASE WHEN sqlc.arg('sort')::text = 'popular'
        THEN (SELECT count(*) FROM core.marker_comment_likes l WHERE l.comment_id = c.id) END DESC NULLS LAST,
    c.created_at DESC,
    c.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountMarkerComments :one
SELECT count(*) FROM core.marker_comments
WHERE game_key = sqlc.arg('game_key')
  AND map_id = sqlc.arg('map_id')
  AND marker_id = sqlc.arg('marker_id')
  AND parent_id IS NULL
  AND hidden_at IS NULL
  AND deleted_at IS NULL;

-- A single comment's replies, oldest first: a conversation reads in the order it
-- happened, unlike the top-level list where the best answer should float.
-- name: ListMarkerCommentReplies :many
SELECT
    c.*,
    (SELECT count(*) FROM core.marker_comments r
        WHERE r.parent_id = c.id AND r.hidden_at IS NULL AND r.deleted_at IS NULL) AS reply_count,
    (SELECT count(*) FROM core.marker_comment_likes l
        WHERE l.comment_id = c.id) AS like_count,
    EXISTS (
        SELECT 1 FROM core.marker_comment_likes l
        WHERE l.comment_id = c.id AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked
FROM core.marker_comments c
WHERE c.parent_id = sqlc.arg('parent_id') AND c.hidden_at IS NULL AND c.deleted_at IS NULL
ORDER BY c.created_at, c.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountMarkerCommentReplies :one
SELECT count(*) FROM core.marker_comments
WHERE parent_id = sqlc.arg('parent_id') AND hidden_at IS NULL AND deleted_at IS NULL;

-- One comment's like state, for the responses that return a single comment rather
-- than a page of them.
-- name: MarkerCommentReactions :one
SELECT
    (SELECT count(*) FROM core.marker_comment_likes l
        WHERE l.comment_id = sqlc.arg('comment_id')) AS like_count,
    EXISTS (
        SELECT 1 FROM core.marker_comment_likes l
        WHERE l.comment_id = sqlc.arg('comment_id') AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked;

-- name: LikeMarkerComment :exec
INSERT INTO core.marker_comment_likes (comment_id, user_id) VALUES ($1, $2)
ON CONFLICT (comment_id, user_id) DO NOTHING;

-- name: UnlikeMarkerComment :exec
DELETE FROM core.marker_comment_likes WHERE comment_id = $1 AND user_id = $2;

-- name: CreateMarkerCommentReport :one
-- Same contract as the forum's: re-reporting is not an error and does not add a
-- row, and re-reporting something already answered reopens it, because a second
-- complaint about content a moderator let stand is new information.
INSERT INTO core.forum_reports (id, reporter_id, post_id, comment_id, marker_comment_id, reason, detail)
VALUES ($1, $2, NULL, NULL, $3, $4, $5)
ON CONFLICT (reporter_id, post_id, comment_id, marker_comment_id) DO UPDATE SET
    reason = excluded.reason,
    detail = excluded.detail,
    state = 'open',
    handled_by = NULL,
    handled_at = NULL
RETURNING *;

-- name: ListHiddenMarkerComments :many
-- The counterpart to ListHiddenForumComments: without it a hidden marker comment
-- could be restored only by someone who already knew its id.
SELECT * FROM core.marker_comments
WHERE hidden_at IS NOT NULL AND deleted_at IS NULL
  AND (sqlc.narg('games')::text[] IS NULL OR game_key = ANY (sqlc.narg('games')::text[]))
ORDER BY hidden_at DESC, id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountHiddenMarkerComments :one
SELECT count(*) FROM core.marker_comments
WHERE hidden_at IS NOT NULL AND deleted_at IS NULL
  AND (sqlc.narg('games')::text[] IS NULL OR game_key = ANY (sqlc.narg('games')::text[]));
