-- +goose Up
-- Widens avatar_key to the two key shapes the avatar feature now writes.
--
-- The previous constraint accepted only content-addressed keys of the form
-- avatars/<43-char digest>.256.(jpg|png). Two things changed:
--
--   1. Uploads moved under a per-account prefix, avatars/u/<uid>/<digest><ext>.
--      The prefix belongs to exactly one account, so superseded avatars can be
--      reclaimed by deleting the rest of that prefix — which is what makes
--      orphaned objects impossible without a bucket-wide sweep. The digest stays
--      in the name so the object is still immutable and cacheable for a year.
--
--   2. The stored format now follows the upload rather than being normalised to
--      JPEG or PNG, so the extension may also be .gif or .webp.
--
-- Preset avatars are referenced through the same column, under their own shared
-- prefix, so that choosing a preset and uploading a picture are one code path
-- with one URL scheme.
--
-- No data migration is needed: this column shipped in the same development cycle
-- and no deployment has written a key in the old shape. Were that not true, the
-- old pattern would have to stay accepted here.
-- +goose StatementBegin
ALTER TABLE core.users DROP CONSTRAINT users_avatar_key_shape;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE core.users
    ADD CONSTRAINT users_avatar_key_shape CHECK (
        avatar_key IS NULL
        -- avatars/u/<uid>/<43-char base64url digest><ext>
        OR avatar_key ~ '^avatars/u/[0-9]+/[A-Za-z0-9_-]{43}\.(jpg|png|gif|webp)$'
        -- avatars/presets/<id>.<ext>
        OR avatar_key ~ '^avatars/presets/[a-z0-9-]{1,64}\.(jpg|png|gif|webp)$'
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE core.users DROP CONSTRAINT users_avatar_key_shape;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE core.users
    ADD CONSTRAINT users_avatar_key_shape CHECK (
        avatar_key IS NULL
        OR avatar_key ~ '^avatars/[A-Za-z0-9_-]{43}\.256\.(jpg|png)$'
    );
-- +goose StatementEnd
