-- name: CreateMarkerImage :one
INSERT INTO core.marker_images (id, game_key, map_id, marker_id, author_id, comment_id, position, object_key, width, height, status, reviewed_by, reviewed_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, sqlc.arg('status'), CASE WHEN sqlc.arg('status')::text = 'published' THEN $5::uuid ELSE NULL::uuid END, CASE WHEN sqlc.arg('status')::text = 'published' THEN now() ELSE NULL END) RETURNING *;

-- name: GetMarkerImage :one
SELECT * FROM core.marker_images WHERE id = $1;

-- name: ReviewMarkerImage :one
UPDATE core.marker_images SET status = $2, reviewed_by = $3, reviewed_at = now()
WHERE id = $1 RETURNING *;

-- name: ListMarkerImages :many
SELECT i.* FROM core.marker_images i
LEFT JOIN core.marker_comments c ON c.id = i.comment_id
LEFT JOIN core.marker_comments p ON p.id = c.parent_id
WHERE i.game_key = sqlc.arg('game_key') AND i.map_id = sqlc.arg('map_id') AND i.marker_id = sqlc.arg('marker_id')
  AND (i.status = 'published' OR i.author_id = sqlc.narg('viewer_id')::uuid OR sqlc.arg('can_review')::boolean)
  AND (i.comment_id IS NULL OR (c.hidden_at IS NULL AND c.deleted_at IS NULL AND p.hidden_at IS NULL AND p.deleted_at IS NULL))
ORDER BY i.created_at, i.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountMarkerImages :one
SELECT count(*) FROM core.marker_images i
LEFT JOIN core.marker_comments c ON c.id = i.comment_id
LEFT JOIN core.marker_comments p ON p.id = c.parent_id
WHERE i.game_key = sqlc.arg('game_key') AND i.map_id = sqlc.arg('map_id') AND i.marker_id = sqlc.arg('marker_id')
  AND (i.status = 'published' OR i.author_id = sqlc.narg('viewer_id')::uuid OR sqlc.arg('can_review')::boolean)
  AND (i.comment_id IS NULL OR (c.hidden_at IS NULL AND c.deleted_at IS NULL AND p.hidden_at IS NULL AND p.deleted_at IS NULL));

-- name: ListPendingMarkerImages :many
SELECT i.* FROM core.marker_images i
LEFT JOIN core.marker_comments c ON c.id = i.comment_id
LEFT JOIN core.marker_comments p ON p.id = c.parent_id
WHERE (sqlc.arg('games')::text[] IS NULL OR i.game_key = ANY(sqlc.arg('games')::text[])) AND i.status = 'pending'
  AND (i.comment_id IS NULL OR (c.hidden_at IS NULL AND c.deleted_at IS NULL AND p.hidden_at IS NULL AND p.deleted_at IS NULL))
ORDER BY i.created_at, i.id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountPendingMarkerImages :one
SELECT count(*) FROM core.marker_images i
LEFT JOIN core.marker_comments c ON c.id = i.comment_id
LEFT JOIN core.marker_comments p ON p.id = c.parent_id
WHERE (sqlc.arg('games')::text[] IS NULL OR i.game_key = ANY(sqlc.arg('games')::text[])) AND i.status = 'pending'
  AND (i.comment_id IS NULL OR (c.hidden_at IS NULL AND c.deleted_at IS NULL AND p.hidden_at IS NULL AND p.deleted_at IS NULL));
