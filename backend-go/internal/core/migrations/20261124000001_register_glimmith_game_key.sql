-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION core.game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT ARRAY['aion2', 'gmzz', 'palworld', 'vrising', 'sts2', 'ro3', 'pbz', 'oss', 'glimmith'] $$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION core.marker_game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT core.game_keys() $$;
-- +goose StatementEnd

-- Forward-only: removal requires an audit of data that references this key.
