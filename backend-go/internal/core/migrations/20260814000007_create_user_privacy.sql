-- +goose Up
-- Per-account visibility settings.
--
-- An absent row means everything public, so nothing needs backfilling and a new account
-- needs no insert: reads LEFT JOIN and COALESCE. That also means deleting the row is a
-- valid way to reset to defaults.

-- +goose StatementBegin
CREATE TABLE core.user_privacy (
    user_id uuid PRIMARY KEY REFERENCES core.users (id) ON DELETE CASCADE,

    -- Who may see the profile itself.
    profile_visibility text NOT NULL DEFAULT 'public',

    -- Who may see this account's posts *listed on its profile*. This is deliberately
    -- not the same as whether the posts are published: a post stays in the global feed
    -- and at its permalink regardless. Withdrawing content is deletion (the author's)
    -- or hiding (a moderator's), never a privacy toggle -- a setting that silently
    -- unpublished content would hand authors a takedown that leaves the post reachable
    -- by link, which is worse than either honest option.
    posts_visibility text NOT NULL DEFAULT 'public',

    -- Who may see the follow graph and reaction history.
    activity_visibility text NOT NULL DEFAULT 'public',

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT user_privacy_levels CHECK (
        profile_visibility  IN ('public', 'followers', 'private') AND
        posts_visibility    IN ('public', 'followers', 'private') AND
        activity_visibility IN ('public', 'followers', 'private'))
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER user_privacy_set_updated_at
    BEFORE UPDATE ON core.user_privacy
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.user_privacy;
-- +goose StatementEnd
