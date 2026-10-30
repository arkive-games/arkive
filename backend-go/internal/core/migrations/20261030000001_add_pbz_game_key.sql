-- +goose Up
-- Register Phantom Blade Zero so forum posts and marker comments can use the same
-- permanent key as its app directory, data pipeline, artifact repositories and DNS
-- name. Marker comments are its first consumer in this database.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'gmzz', 'palworld', 'vrising', 'sts2', 'ro3', 'pbz'] $$;
-- +goose StatementEnd

-- This registry expansion is intentionally forward-only. Removing a game key would
-- require an application/data audit before the database constraint can be narrowed.

-- +goose Down
-- Deliberately empty. The registry is forward-only: every down-migration that
-- removed a key would have to prove no row still carries it, and the wider array
-- invalidates nothing — a check constraint that admits more values than it used to
-- cannot be violated by data that already passed it. Restoring the old array here
-- would also make this file the last definition the registry drift test reads, so a
-- rollback section would quietly become the answer to "what keys exist".
