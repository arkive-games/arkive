-- +goose Up
-- Records which stored object is an account's picture.
--
-- The column holds a complete object key, such as
-- "avatars/9f8a...c3.256.jpg", not a URL. The public address is assembled from
-- configuration at read time, so putting a CDN in front of the bucket, or moving
-- buckets entirely, is a configuration change rather than a data migration.
--
-- Keys are the base64url SHA-256 of the *encoded* bytes, which means two
-- accounts that upload the same picture share one object. That is also why
-- nothing deletes objects when this column changes: the key may still be another
-- account's avatar.
-- +goose StatementBegin
ALTER TABLE core.users
    ADD COLUMN avatar_key text,
    -- A key is generated, never supplied by a client, so anything outside the
    -- shape this service writes is a bug rather than bad input. The check keeps
    -- such a bug from becoming a broken URL on every page that renders the
    -- account.
    ADD CONSTRAINT users_avatar_key_shape CHECK (
        avatar_key IS NULL
        OR avatar_key ~ '^avatars/[A-Za-z0-9_-]{43}\.256\.(jpg|png)$'
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE core.users DROP COLUMN avatar_key;
-- +goose StatementEnd
