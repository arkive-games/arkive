-- +goose Up
-- Support the identifiers already shipped by all map artifact repositories.
ALTER TABLE core.marker_comments DROP CONSTRAINT marker_comments_marker_shape;
ALTER TABLE core.marker_comments ADD CONSTRAINT marker_comments_marker_shape
    CHECK (marker_id ~ '^[A-Za-z0-9_-]{1,128}$');

CREATE TABLE core.marker_images (
    id uuid PRIMARY KEY,
    game_key text NOT NULL CHECK (game_key = ANY(core.game_keys())),
    map_id text NOT NULL CHECK (map_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    marker_id text NOT NULL CHECK (marker_id ~ '^[A-Za-z0-9_-]{1,128}$'),
    author_id uuid NOT NULL REFERENCES core.users(id),
    comment_id uuid REFERENCES core.marker_comments(id) ON DELETE CASCADE,
    position smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 2),
    object_key text NOT NULL UNIQUE CHECK (object_key ~ '^markers/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|gif|webp)$'),
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
    reviewed_by uuid REFERENCES core.users(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (comment_id, position),
    CHECK ((status = 'pending') = (reviewed_by IS NULL)),
    CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
CREATE INDEX marker_images_target ON core.marker_images(game_key, map_id, marker_id, created_at, id);
CREATE INDEX marker_images_review ON core.marker_images(game_key, created_at, id) WHERE status = 'pending';

-- +goose Down
DROP TABLE core.marker_images;

-- Existing cross-game identifiers survive a downgrade. New writes still use
-- the previous bound until this migration is applied again.
ALTER TABLE core.marker_comments DROP CONSTRAINT marker_comments_marker_shape;
ALTER TABLE core.marker_comments ADD CONSTRAINT marker_comments_marker_shape
    CHECK (marker_id ~ '^[A-Za-z0-9-]{1,40}$') NOT VALID;
