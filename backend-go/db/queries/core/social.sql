-- The follow graph. Writes are idempotent for the same reason reactions are: the
-- caller is stating an end state, so a retry or a double tap must not be an error.

-- name: FollowUser :exec
INSERT INTO core.user_follows (follower_id, followee_id) VALUES ($1, $2)
ON CONFLICT (follower_id, followee_id) DO NOTHING;

-- name: UnfollowUser :exec
DELETE FROM core.user_follows WHERE follower_id = $1 AND followee_id = $2;

-- name: CountFollowers :one
SELECT count(*) FROM core.user_follows WHERE followee_id = $1;

-- name: CountFollowing :one
SELECT count(*) FROM core.user_follows WHERE follower_id = $1;

-- name: IsFollowing :one
SELECT EXISTS (
    SELECT 1 FROM core.user_follows
    WHERE follower_id = sqlc.narg('follower_id')::uuid AND followee_id = sqlc.arg('followee_id')
);

-- name: ListFollowers :many
-- Newest first: a follower list is read to see who arrived, not alphabetically.
SELECT follower_id, created_at FROM core.user_follows
WHERE followee_id = $1
ORDER BY created_at DESC, follower_id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: ListFollowing :many
SELECT followee_id, created_at FROM core.user_follows
WHERE follower_id = $1
ORDER BY created_at DESC, followee_id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');
