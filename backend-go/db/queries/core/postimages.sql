-- name: AttachForumPostImage :one
-- Re-attaching at the same position replaces it, so a client correcting one slot does not
-- have to detach first and does not leave a gap if the second call never arrives.
INSERT INTO core.forum_post_images (post_id, position, object_key, width, height)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (post_id, position) DO UPDATE SET
    object_key = excluded.object_key,
    width      = excluded.width,
    height     = excluded.height
RETURNING *;

-- name: DetachForumPostImage :execrows
DELETE FROM core.forum_post_images WHERE post_id = $1 AND position = $2;

-- name: ListForumPostImages :many
SELECT * FROM core.forum_post_images WHERE post_id = $1 ORDER BY position;

-- name: ListForumPostImagesForPosts :many
-- One query for a page of posts rather than one per post, matching how a page of authors
-- is loaded.
SELECT * FROM core.forum_post_images
WHERE post_id = ANY (sqlc.arg('post_ids')::uuid[])
ORDER BY post_id, position;

-- name: CountForumPostImages :one
SELECT count(*) FROM core.forum_post_images WHERE post_id = $1;

-- name: CountForumPostImagesByKey :one
-- How many rows still reference one object.
--
-- Object keys are content-addressed and scoped to the uploader, so the same account
-- uploading the same image twice produces the same key — and nothing makes object_key
-- unique, so several rows legitimately share one object. Deleting on the assumption that a
-- displaced key is unreferenced would take an object another post is still rendering, with
-- no error anywhere and no way back.
SELECT count(*) FROM core.forum_post_images WHERE object_key = $1;

-- name: ListForumPostImageKeys :many
-- The keys a post holds, read before the rows cascade away with it so they can be
-- reference-counted afterwards.
SELECT object_key FROM core.forum_post_images WHERE post_id = $1;
