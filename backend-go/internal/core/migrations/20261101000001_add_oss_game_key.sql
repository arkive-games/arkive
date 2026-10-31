-- +goose Up
-- Register Order of the Sinking Star as a shared platform game identity.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'gmzz', 'palworld', 'vrising', 'sts2', 'ro3', 'pbz', 'oss'] $$;
-- +goose StatementEnd

-- Forward-only: removal requires an audit of data that references this key.
