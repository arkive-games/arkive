-- name: GetUserPrivacy :one
-- COALESCE rather than a required row: an account that has never touched its settings
-- has no row, and everything defaults to public.
SELECT
    COALESCE(p.profile_visibility,  'public') AS profile_visibility,
    COALESCE(p.posts_visibility,    'public') AS posts_visibility,
    COALESCE(p.activity_visibility, 'public') AS activity_visibility
FROM core.users u
LEFT JOIN core.user_privacy p ON p.user_id = u.id
WHERE u.id = $1;

-- name: SetUserPrivacy :one
-- Upsert, so the first change creates the row and later ones update it. A NULL argument
-- leaves that setting alone, matching how UpdateUser treats a partial edit.
INSERT INTO core.user_privacy (user_id, profile_visibility, posts_visibility, activity_visibility)
VALUES (
    sqlc.arg('user_id'),
    COALESCE(sqlc.narg('profile_visibility'),  'public'),
    COALESCE(sqlc.narg('posts_visibility'),    'public'),
    COALESCE(sqlc.narg('activity_visibility'), 'public')
)
ON CONFLICT (user_id) DO UPDATE SET
    profile_visibility  = COALESCE(sqlc.narg('profile_visibility'),  core.user_privacy.profile_visibility),
    posts_visibility    = COALESCE(sqlc.narg('posts_visibility'),    core.user_privacy.posts_visibility),
    activity_visibility = COALESCE(sqlc.narg('activity_visibility'), core.user_privacy.activity_visibility)
RETURNING profile_visibility, posts_visibility, activity_visibility;
