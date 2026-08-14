-- +goose Up
-- Notifications, and the per-kind preferences that gate them.

-- +goose StatementBegin
CREATE TABLE core.notifications (
    id           uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    kind         text NOT NULL,

    -- Who caused it. NULL only for a system message, which nobody caused.
    actor_id uuid REFERENCES core.users (id) ON DELETE CASCADE,

    -- What it is about. Both may be NULL (a follow is about neither), and a comment
    -- notification carries both so a client can link to the comment in its thread.
    post_id    uuid REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    comment_id uuid REFERENCES core.forum_comments (id) ON DELETE CASCADE,

    -- System messages only. Everything else is rendered from kind plus the references
    -- above, so that a display string is never frozen into the database in one
    -- language.
    body text,

    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT notifications_kind_check CHECK (kind IN
        ('reply', 'mention', 'post_like', 'comment_like', 'follow', 'system')),

    -- A system message has no actor; everything else has one.
    CONSTRAINT notifications_actor_check CHECK ((kind = 'system') = (actor_id IS NULL)),

    -- Acting on your own content notifies nobody. Enforced here rather than in the
    -- service so that no future code path can produce one: an inbox full of your own
    -- likes is the kind of bug that ships.
    CONSTRAINT notifications_no_self CHECK (actor_id IS NULL OR actor_id <> recipient_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX notifications_inbox_idx ON core.notifications (recipient_id, created_at DESC);
-- +goose StatementEnd

-- Partial, which is what makes the unread badge a cheap count rather than a scan of an
-- inbox that only grows.
-- +goose StatementBegin
CREATE INDEX notifications_unread_idx ON core.notifications (recipient_id)
    WHERE read_at IS NULL;
-- +goose StatementEnd

-- Explicit columns rather than a jsonb blob, so a typo in a preference name is a
-- compile error instead of a setting that silently never applies. An absent row means
-- every default, so nothing needs backfilling.
-- +goose StatementBegin
CREATE TABLE core.notification_preferences (
    user_id      uuid PRIMARY KEY REFERENCES core.users (id) ON DELETE CASCADE,
    reply        boolean NOT NULL DEFAULT true,
    mention      boolean NOT NULL DEFAULT true,
    post_like    boolean NOT NULL DEFAULT true,
    comment_like boolean NOT NULL DEFAULT true,
    follow       boolean NOT NULL DEFAULT true,
    system       boolean NOT NULL DEFAULT true,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER notification_preferences_set_updated_at
    BEFORE UPDATE ON core.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.notification_preferences;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE core.notifications;
-- +goose StatementEnd
