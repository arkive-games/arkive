-- +goose Up
-- Images attached to a post.
--
-- Keyed on the author rather than the post, because blob.Store has no copy or move: an
-- image cannot be written to a draft prefix and relocated once the post exists. The
-- account prefix lets an upload precede its post and makes orphan reclamation a scoped
-- List over one account rather than a bucket sweep.

-- +goose StatementBegin
CREATE TABLE core.forum_post_images (
    post_id uuid NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,

    -- Explicit ordering. Part of the primary key, so two images cannot claim the same
    -- slot and the client's arrangement survives a round trip.
    position smallint NOT NULL,

    object_key text NOT NULL,
    width      integer NOT NULL,
    height     integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (post_id, position),

    CONSTRAINT forum_post_images_position CHECK (position BETWEEN 0 AND 8),
    CONSTRAINT forum_post_images_size CHECK (width > 0 AND height > 0),

    -- The same defence users_avatar_key_shape provides, and it needs its own: a
    -- client-supplied string must never be able to become an arbitrary object key, and
    -- the avatar constraint does not cover this table.
    CONSTRAINT forum_post_images_key_shape CHECK (
        object_key ~ '^forum/u/[0-9]+/[A-Za-z0-9_-]{43}\.(jpg|png|gif|webp)$')
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.forum_post_images;
-- +goose StatementEnd
