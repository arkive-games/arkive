-- Moderation. Hiding is reversible and attributed; reports are an audit trail.

-- name: SetForumPostHidden :one
-- All three columns move together, which forum_posts_hidden_together requires.
UPDATE core.forum_posts SET
    hidden_at     = CASE WHEN sqlc.arg('hidden')::boolean THEN now() ELSE NULL END,
    hidden_by     = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('actor_id')::uuid ELSE NULL END,
    hidden_reason = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('reason')::text ELSE NULL END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: SetForumCommentHidden :one
UPDATE core.forum_comments SET
    hidden_at     = CASE WHEN sqlc.arg('hidden')::boolean THEN now() ELSE NULL END,
    hidden_by     = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('actor_id')::uuid ELSE NULL END,
    hidden_reason = CASE WHEN sqlc.arg('hidden')::boolean THEN sqlc.narg('reason')::text ELSE NULL END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: CreateForumReport :one
-- Re-reporting the same target is not an error and does not create a second row: the
-- reporter has already said this once, and a duplicate would only pad the queue.
-- Re-reporting something already handled reopens it, because a second complaint about
-- content a moderator let stand is new information.
INSERT INTO core.forum_reports (id, reporter_id, post_id, comment_id, reason, detail)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (reporter_id, post_id, comment_id) DO UPDATE SET
    reason = excluded.reason,
    detail = excluded.detail,
    state = 'open',
    handled_by = NULL,
    handled_at = NULL
RETURNING *;

-- name: ResolveForumReport :one
UPDATE core.forum_reports SET
    state = sqlc.arg('state'),
    handled_by = sqlc.narg('handled_by')::uuid,
    handled_at = now()
WHERE id = sqlc.arg('id') AND state = 'open'
RETURNING *;

-- name: GetForumReport :one
SELECT * FROM core.forum_reports WHERE id = $1;

-- name: ListOpenForumReports :many
-- Oldest first: the complaint that has waited longest is the one to answer.
--
-- Scoped by game when a game's moderator asks, through the tags on the reported post
-- or on the post the reported comment belongs to. A site administrator passes no
-- scope and sees everything.
SELECT r.* FROM core.forum_reports r
LEFT JOIN core.forum_posts p        ON p.id = r.post_id
LEFT JOIN core.forum_comments c     ON c.id = r.comment_id
LEFT JOIN core.forum_posts cp       ON cp.id = c.post_id
WHERE r.state = 'open'
  AND (sqlc.narg('games')::text[] IS NULL
       OR COALESCE(p.game_ids, cp.game_ids) && sqlc.narg('games')::text[])
ORDER BY r.created_at, r.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountOpenForumReports :one
SELECT count(*) FROM core.forum_reports r
LEFT JOIN core.forum_posts p    ON p.id = r.post_id
LEFT JOIN core.forum_comments c ON c.id = r.comment_id
LEFT JOIN core.forum_posts cp   ON cp.id = c.post_id
WHERE r.state = 'open'
  AND (sqlc.narg('games')::text[] IS NULL
       OR COALESCE(p.game_ids, cp.game_ids) && sqlc.narg('games')::text[]);

-- name: ListHiddenForumPosts :many
-- What a moderator can see that a reader cannot.
SELECT * FROM core.forum_posts
WHERE hidden_at IS NOT NULL
  AND (sqlc.narg('games')::text[] IS NULL OR game_ids && sqlc.narg('games')::text[])
ORDER BY hidden_at DESC, id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountHiddenForumPosts :one
SELECT count(*) FROM core.forum_posts
WHERE hidden_at IS NOT NULL
  AND (sqlc.narg('games')::text[] IS NULL OR game_ids && sqlc.narg('games')::text[]);
