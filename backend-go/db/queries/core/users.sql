-- name: CreateUser :one
INSERT INTO core.users (id, name, email, hashed_password, is_active, is_superuser, is_verified)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM core.users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM core.users WHERE email = $1;

-- name: GetUserByName :one
SELECT * FROM core.users WHERE name = $1;

-- Resolves either kind of account number in one round trip.
--
-- No discriminator is needed because the two ranges cannot overlap: uid is
-- checked >= 10000 and special_uid <= 9999, so a given number can only ever
-- match one column. Both columns are uniquely indexed, and the planner answers
-- this with a BitmapOr over the two indexes rather than a scan.
-- name: GetUserByAnyUID :one
SELECT * FROM core.users WHERE uid = $1 OR special_uid = $1;

-- The COALESCE idiom cannot express clearing a column, because it reads NULL as
-- "leave unchanged". special_uid is the one column that must be clearable, so it
-- takes an explicit set_special_uid flag: false leaves the current value alone,
-- true writes special_uid through verbatim -- including NULL, which revokes.
-- name: UpdateUser :one
UPDATE core.users SET
    name            = COALESCE(sqlc.narg('name'), name),
    email           = COALESCE(sqlc.narg('email'), email),
    hashed_password = COALESCE(sqlc.narg('hashed_password'), hashed_password),
    is_active       = COALESCE(sqlc.narg('is_active'), is_active),
    is_superuser    = COALESCE(sqlc.narg('is_superuser'), is_superuser),
    is_verified     = COALESCE(sqlc.narg('is_verified'), is_verified),
    special_uid     = CASE WHEN sqlc.arg('set_special_uid')::boolean
                           THEN sqlc.narg('special_uid')::integer
                           ELSE special_uid END
WHERE id = sqlc.arg('id')
RETURNING *;

-- Accounts are never deleted, only deactivated: the row is the author of its
-- comments and contributions, so removing it would cascade that work away or
-- orphan it. Deactivation goes through UpdateUser's is_active flag. No delete
-- query exists here on purpose — the capability is absent rather than merely
-- unused.

-- Search preserves the Python endpoint's OR semantics: with both filters set a
-- user matching either one is returned, and with neither set every user is.
-- name: SearchUsers :many
SELECT * FROM core.users
WHERE (
        (sqlc.narg('name')::text IS NULL AND sqlc.narg('email')::text IS NULL)
     OR (sqlc.narg('name')::text  IS NOT NULL AND name  ILIKE '%' || sqlc.narg('name')::text  || '%')
     OR (sqlc.narg('email')::text IS NOT NULL AND email ILIKE '%' || sqlc.narg('email')::text || '%')
)
ORDER BY created_at DESC, id
LIMIT sqlc.arg('result_limit') OFFSET sqlc.arg('result_offset');

-- name: CountUsers :one
SELECT count(*) FROM core.users
WHERE (
        (sqlc.narg('name')::text IS NULL AND sqlc.narg('email')::text IS NULL)
     OR (sqlc.narg('name')::text  IS NOT NULL AND name  ILIKE '%' || sqlc.narg('name')::text  || '%')
     OR (sqlc.narg('email')::text IS NOT NULL AND email ILIKE '%' || sqlc.narg('email')::text || '%')
);

-- name: SuperuserExists :one
SELECT EXISTS (SELECT 1 FROM core.users WHERE is_superuser);

-- Setting and clearing an avatar are the same statement: a key assigns one, NULL
-- removes it. Unlike special_uid this needs no "leave unchanged" state, because
-- nothing edits an avatar as a side effect of another change.
-- name: SetUserAvatar :one
UPDATE core.users SET avatar_key = sqlc.narg('avatar_key')
WHERE id = sqlc.arg('id')
RETURNING *;

-- Counts administrators who could still sign in if the given account stopped
-- being one. Used to refuse the change that would leave the site with none.
-- name: CountOtherActiveSuperusers :one
SELECT count(*) FROM core.users
WHERE is_superuser AND is_active AND id <> sqlc.arg('excluding');

-- Serialises every change to the set of usable administrators. Held for the
-- duration of the transaction, so a check and the update it authorises cannot
-- interleave with another such pair. Without it two concurrent deactivations
-- each observe the other as the remaining administrator and both succeed.
-- name: LockAdminMembership :exec
SELECT pg_advisory_xact_lock(hashtext('core.users.admin_membership'));

-- Batch lookup for rendering authors on a page of forum posts, so a feed costs
-- one query for its authors instead of one per row.
-- name: GetUsersByIDs :many
SELECT * FROM core.users WHERE id = ANY(sqlc.arg('ids')::uuid[]);

-- name: GetUserIDsByNames :many
-- Resolves a batch of display names at once, for mentions. One round trip rather than one
-- per name: a body may legitimately name several people, and an abusive one names
-- thousands, so the cost must not scale with what the author typed.
-- Inactive accounts are omitted, matching every other name and uid lookup.
SELECT id, name FROM core.users
WHERE name = ANY (sqlc.arg('names')::text[]) AND is_active;
