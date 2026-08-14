-- name: GrantRole :one
-- Idempotent: granting a role someone already holds returns the existing grant
-- rather than failing, so a double-click is not an error the client has to
-- interpret. DO UPDATE rather than DO NOTHING because DO NOTHING returns no row,
-- which would make the handler unable to answer with the grant.
INSERT INTO core.role_grants (id, user_id, role, game, granted_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, role, game) DO UPDATE SET role = core.role_grants.role
RETURNING *;

-- name: RevokeRole :execrows
DELETE FROM core.role_grants
WHERE user_id = $1 AND role = $2 AND game = $3;

-- name: ListRoleGrantsForGame :many
-- The public cabin query: who staffs this game. Administrators before moderators,
-- then oldest grant first, so the ordering is stable and reads as a hierarchy.
SELECT * FROM core.role_grants
WHERE game = $1
ORDER BY CASE role WHEN 'game_admin' THEN 0 ELSE 1 END, created_at, id;

-- name: ListRoleGrantsForUser :many
SELECT * FROM core.role_grants
WHERE user_id = $1
ORDER BY game, role;

-- name: ListRoleGrantsForUserInGame :many
-- The authorization query. Narrow on purpose: it answers "what may this account do
-- in this game" without loading grants for games the request has nothing to do with.
SELECT * FROM core.role_grants
WHERE user_id = $1 AND game = $2;
