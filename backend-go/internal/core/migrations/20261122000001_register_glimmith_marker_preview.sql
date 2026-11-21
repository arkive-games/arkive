-- +goose Up
-- Map previews can accept marker contributions without becoming forum game tags.
-- +goose StatementBegin
CREATE FUNCTION core.marker_game_keys() RETURNS text[]
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT array_append(core.game_keys(), 'glimmith') $$;
-- +goose StatementEnd

ALTER TABLE core.marker_comments DROP CONSTRAINT marker_comments_game_key_check;
ALTER TABLE core.marker_comments ADD CONSTRAINT marker_comments_game_key_check
    CHECK (game_key = ANY(core.marker_game_keys()));
ALTER TABLE core.marker_images DROP CONSTRAINT marker_images_game_key_check;
ALTER TABLE core.marker_images ADD CONSTRAINT marker_images_game_key_check
    CHECK (game_key = ANY(core.marker_game_keys()));

-- +goose Down
-- Keep existing preview contributions but disallow new ones on older servers.
ALTER TABLE core.marker_comments DROP CONSTRAINT marker_comments_game_key_check;
ALTER TABLE core.marker_comments ADD CONSTRAINT marker_comments_game_key_check
    CHECK (game_key = ANY(core.game_keys())) NOT VALID;
ALTER TABLE core.marker_images DROP CONSTRAINT marker_images_game_key_check;
ALTER TABLE core.marker_images ADD CONSTRAINT marker_images_game_key_check
    CHECK (game_key = ANY(core.game_keys())) NOT VALID;
DROP FUNCTION core.marker_game_keys();
