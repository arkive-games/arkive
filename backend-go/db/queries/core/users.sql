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

-- name: DeleteUser :execrows
DELETE FROM core.users WHERE id = $1;

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
