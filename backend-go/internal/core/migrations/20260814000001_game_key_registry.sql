-- +goose Up
-- The game-key registry, as one function every check constraint shares.
--
-- Games are code, not data (architecture design §5), so this is deliberately not a
-- table: a row would have to be seeded per environment and could disagree with the
-- deployment. The Go side is internal/core/games; adding a game means editing both
-- in one commit.
--
-- Why a function and not `CREATE DOMAIN core.game_key AS text CHECK (VALUE IN …)`,
-- which reads better: ALTER DOMAIN … ADD CONSTRAINT is refused while any column of
-- the domain's *array* type exists, and forum_posts.game_ids is exactly that. The
-- DROP CONSTRAINT that has to precede it commits first, so the migration would
-- leave the domain carrying no constraint at all while appearing to succeed. That
-- was measured, not assumed. A function covers scalar and array columns alike,
-- needs no sqlc type override, and survives dump/restore with the constraint still
-- enforcing.
--
-- Adding a game is one CREATE OR REPLACE of this function. Note that Postgres does
-- not revalidate existing rows when the body changes: widening the list cannot
-- invalidate anything, but *removing* a game would leave rows violating a
-- constraint that no longer checks them, so that needs an explicit audit.

-- +goose StatementBegin
CREATE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'palworld', 'vrising', 'sts2'] $$;
-- +goose StatementEnd

-- The forum has carried `game_ids text[]` with no membership constraint since it
-- shipped, so `gameIds: ["not-a-game"]` was accepted and stored while the table's
-- own comment claimed a registry that did not exist. `<@` is containment: every
-- element must be a known key. An empty array trivially satisfies it, which is
-- correct — a post need not be about any game.
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    ADD CONSTRAINT forum_posts_game_ids_known CHECK (game_ids <@ core.game_keys());
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE core.forum_posts DROP CONSTRAINT forum_posts_game_ids_known;
-- +goose StatementEnd
-- +goose StatementBegin
DROP FUNCTION core.game_keys();
-- +goose StatementEnd
