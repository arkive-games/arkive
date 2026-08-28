-- +goose Up
-- Register the first Lord of Mysteries site so forum posts can use the same
-- permanent key as the portal and data pipeline.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'gmzz', 'palworld', 'vrising', 'sts2'] $$;
-- +goose StatementEnd

-- This registry expansion is intentionally forward-only. Removing a game key would
-- require an application/data audit before the database constraint can be narrowed.
