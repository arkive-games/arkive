-- name: LockOwner :exec
-- Serialises every write that depends on how many characters an owner has, so two
-- concurrent creates cannot both see nine and both insert. Transaction-scoped: the
-- lock is released by the commit or rollback that ends the caller's transaction.
SELECT pg_advisory_xact_lock(sqlc.arg('key')::bigint);

-- name: CountOwnedCharacters :one
SELECT count(*) FROM gmzz.characters WHERE owner_id = $1;

-- name: ListOwnedCharacters :many
SELECT id, public_id, owner_id, name, server_id, uid, show_uid, visibility, sort_order,
       schema_version, revision, created_at, updated_at
FROM gmzz.characters
WHERE owner_id = $1
ORDER BY sort_order, created_at;

-- name: GetCharacterByPublicID :one
SELECT * FROM gmzz.characters WHERE public_id = $1;

-- name: InsertCharacter :one
-- Appended after the owner's last character. A public_id collision returns no row
-- instead of failing, so the caller can draw another id without aborting its
-- transaction.
INSERT INTO gmzz.characters (
    public_id, owner_id, name, server_id, uid, show_uid, visibility, sort_order, schema_version, data
) VALUES (
    sqlc.arg('public_id'), sqlc.arg('owner_id'), sqlc.arg('name'), sqlc.narg('server_id'), sqlc.narg('uid'),
    sqlc.arg('show_uid'), sqlc.arg('visibility'),
    (SELECT COALESCE(max(sort_order), -1) + 1 FROM gmzz.characters WHERE owner_id = sqlc.arg('owner_id')),
    sqlc.arg('schema_version'), sqlc.arg('data')
)
ON CONFLICT (public_id) DO NOTHING
RETURNING *;

-- name: UpdateCharacter :one
-- Applies only when the stored revision is the one the caller last read; zero rows
-- means the character is gone, is not the caller's, or has moved on. The service
-- tells those apart with a second read.
UPDATE gmzz.characters SET
    name           = sqlc.arg('name'),
    server_id      = sqlc.narg('server_id'),
    uid            = sqlc.narg('uid'),
    show_uid       = sqlc.arg('show_uid'),
    visibility     = sqlc.arg('visibility'),
    schema_version = sqlc.arg('schema_version'),
    data           = sqlc.arg('data'),
    revision       = revision + 1,
    updated_at     = now()
WHERE public_id = sqlc.arg('public_id')
  AND owner_id  = sqlc.arg('owner_id')
  AND revision  = sqlc.arg('revision')
RETURNING *;

-- name: DeleteCharacter :execrows
DELETE FROM gmzz.characters WHERE public_id = $1 AND owner_id = $2;

-- name: SetCharacterOrder :exec
UPDATE gmzz.characters SET sort_order = sqlc.arg('sort_order')
WHERE public_id = sqlc.arg('public_id') AND owner_id = sqlc.arg('owner_id');
