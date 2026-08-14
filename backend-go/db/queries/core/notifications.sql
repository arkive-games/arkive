-- name: CreateNotification :exec
-- Gated on the recipient's preference for this kind, in the statement rather than in Go:
-- the check and the insert are then one round trip and cannot race a preference change.
-- An absent preferences row means every default, which COALESCE supplies.
INSERT INTO core.notifications (id, recipient_id, kind, actor_id, post_id, comment_id, body)
SELECT sqlc.arg('id'), sqlc.arg('recipient_id'), sqlc.arg('kind'),
       sqlc.narg('actor_id')::uuid, sqlc.narg('post_id')::uuid,
       sqlc.narg('comment_id')::uuid, sqlc.narg('body')::text
WHERE COALESCE((
    SELECT CASE sqlc.arg('kind')
        WHEN 'reply'        THEN p.reply
        WHEN 'mention'      THEN p.mention
        WHEN 'post_like'    THEN p.post_like
        WHEN 'comment_like' THEN p.comment_like
        WHEN 'follow'       THEN p.follow
        WHEN 'system'       THEN p.system
    END
    FROM core.notification_preferences p
    WHERE p.user_id = sqlc.arg('recipient_id')
), true)
-- The self-notification constraint would reject this anyway; skipping it here keeps a
-- like on your own post from failing the request that caused it.
AND sqlc.narg('actor_id')::uuid IS DISTINCT FROM sqlc.arg('recipient_id');

-- name: ListNotifications :many
SELECT * FROM core.notifications
WHERE recipient_id = sqlc.arg('recipient_id')
  AND (NOT sqlc.arg('unread_only')::boolean OR read_at IS NULL)
ORDER BY created_at DESC, id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountNotifications :one
SELECT count(*) FROM core.notifications
WHERE recipient_id = sqlc.arg('recipient_id')
  AND (NOT sqlc.arg('unread_only')::boolean OR read_at IS NULL);

-- name: CountUnreadNotifications :one
-- Answered by notifications_unread_idx, so the badge does not scan the inbox.
SELECT count(*) FROM core.notifications WHERE recipient_id = $1 AND read_at IS NULL;

-- name: MarkNotificationRead :execrows
-- Scoped by recipient as well as id, so one account cannot mark another's as read by
-- guessing a uuid.
UPDATE core.notifications SET read_at = now()
WHERE id = sqlc.arg('id') AND recipient_id = sqlc.arg('recipient_id') AND read_at IS NULL;

-- name: MarkAllNotificationsRead :execrows
UPDATE core.notifications SET read_at = now()
WHERE recipient_id = $1 AND read_at IS NULL;

-- name: GetNotificationPreferences :one
SELECT
    COALESCE(p.reply,        true) AS reply,
    COALESCE(p.mention,      true) AS mention,
    COALESCE(p.post_like,    true) AS post_like,
    COALESCE(p.comment_like, true) AS comment_like,
    COALESCE(p.follow,       true) AS follow,
    COALESCE(p.system,       true) AS system
FROM core.users u
LEFT JOIN core.notification_preferences p ON p.user_id = u.id
WHERE u.id = $1;

-- name: SetNotificationPreferences :one
INSERT INTO core.notification_preferences (user_id, reply, mention, post_like, comment_like, follow, system)
VALUES (
    sqlc.arg('user_id'),
    COALESCE(sqlc.narg('reply'), true),
    COALESCE(sqlc.narg('mention'), true),
    COALESCE(sqlc.narg('post_like'), true),
    COALESCE(sqlc.narg('comment_like'), true),
    COALESCE(sqlc.narg('follow'), true),
    COALESCE(sqlc.narg('system'), true)
)
ON CONFLICT (user_id) DO UPDATE SET
    reply        = COALESCE(sqlc.narg('reply'),        core.notification_preferences.reply),
    mention      = COALESCE(sqlc.narg('mention'),      core.notification_preferences.mention),
    post_like    = COALESCE(sqlc.narg('post_like'),    core.notification_preferences.post_like),
    comment_like = COALESCE(sqlc.narg('comment_like'), core.notification_preferences.comment_like),
    follow       = COALESCE(sqlc.narg('follow'),       core.notification_preferences.follow),
    system       = COALESCE(sqlc.narg('system'),       core.notification_preferences.system)
RETURNING reply, mention, post_like, comment_like, follow, system;
