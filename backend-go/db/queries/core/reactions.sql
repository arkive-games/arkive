-- Reactions. Every write is idempotent, because the client is asking for an end
-- state: liking a post twice must mean the same as liking it once, so a double tap
-- or a retried request is not an error anyone has to interpret.

-- name: LikeForumPost :exec
INSERT INTO core.forum_post_likes (post_id, user_id) VALUES ($1, $2)
ON CONFLICT (post_id, user_id) DO NOTHING;

-- name: UnlikeForumPost :exec
DELETE FROM core.forum_post_likes WHERE post_id = $1 AND user_id = $2;

-- name: BookmarkForumPost :exec
INSERT INTO core.forum_post_bookmarks (post_id, user_id) VALUES ($1, $2)
ON CONFLICT (post_id, user_id) DO NOTHING;

-- name: UnbookmarkForumPost :exec
DELETE FROM core.forum_post_bookmarks WHERE post_id = $1 AND user_id = $2;

-- name: LikeForumComment :exec
INSERT INTO core.forum_comment_likes (comment_id, user_id) VALUES ($1, $2)
ON CONFLICT (comment_id, user_id) DO NOTHING;

-- name: UnlikeForumComment :exec
DELETE FROM core.forum_comment_likes WHERE comment_id = $1 AND user_id = $2;

-- One comment's like state, for the responses that return a single comment rather
-- than a page of them.
-- name: ForumCommentReactions :one
SELECT
    (SELECT count(*) FROM core.forum_comment_likes l
        WHERE l.comment_id = sqlc.arg('comment_id')) AS like_count,
    EXISTS (
        SELECT 1 FROM core.forum_comment_likes l
        WHERE l.comment_id = sqlc.arg('comment_id') AND l.user_id = sqlc.narg('viewer_id')::uuid
    ) AS liked;
