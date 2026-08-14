-- +goose Up
-- Moderation: hiding content, and the reports that ask for it.
--
-- Hiding is not deleting. Authors keep the hard DELETE they already have; a moderator
-- gets a reversible, attributable hide instead, because a takedown that destroys the
-- evidence cannot be reviewed, appealed or undone. Every public read gains
-- `hidden_at IS NULL`; the moderation queue is what looks past it.

-- +goose StatementBegin
ALTER TABLE core.forum_posts
    ADD COLUMN hidden_at     timestamptz,
    ADD COLUMN hidden_by     uuid REFERENCES core.users (id) ON DELETE SET NULL,
    ADD COLUMN hidden_reason text,
    -- A hidden post always records who hid it, the same pairing the featured columns
    -- use. SET NULL on the actor would break this, so the constraint is on hidden_by
    -- being present at all rather than on it pointing anywhere in particular.
    ADD CONSTRAINT forum_posts_hidden_together
        CHECK ((hidden_at IS NULL) = (hidden_by IS NULL));
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE core.forum_comments
    ADD COLUMN hidden_at     timestamptz,
    ADD COLUMN hidden_by     uuid REFERENCES core.users (id) ON DELETE SET NULL,
    ADD COLUMN hidden_reason text,
    ADD CONSTRAINT forum_comments_hidden_together
        CHECK ((hidden_at IS NULL) = (hidden_by IS NULL));
-- +goose StatementEnd

-- Partial indexes: the queue reads only hidden rows, and there will be few.
-- +goose StatementBegin
CREATE INDEX forum_posts_hidden_idx ON core.forum_posts (hidden_at DESC)
    WHERE hidden_at IS NOT NULL;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_comments_hidden_idx ON core.forum_comments (hidden_at DESC)
    WHERE hidden_at IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.forum_reports (
    id          uuid PRIMARY KEY,
    reporter_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,

    -- Two nullable foreign keys and a check, rather than a polymorphic
    -- (target_type, target_id) pair. The polymorphic form cannot carry either key, so
    -- a report would outlive the thing it was about; this keeps both cascades and
    -- still admits exactly one target.
    post_id    uuid REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    comment_id uuid REFERENCES core.forum_comments (id) ON DELETE CASCADE,

    reason     text NOT NULL,
    detail     text,
    state      text NOT NULL DEFAULT 'open',
    handled_by uuid REFERENCES core.users (id) ON DELETE SET NULL,
    handled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT forum_reports_reason_check CHECK (reason IN
        ('spam', 'abuse', 'offtopic', 'illegal', 'other')),
    CONSTRAINT forum_reports_state_check CHECK (state IN ('open', 'upheld', 'rejected')),
    CONSTRAINT forum_reports_one_target CHECK (num_nonnulls(post_id, comment_id) = 1),
    CONSTRAINT forum_reports_handled_together
        CHECK ((state = 'open') = (handled_at IS NULL)),

    -- One report per reporter per target. NULLS NOT DISTINCT is load-bearing: under
    -- the default, NULLs compare unequal, so the same reporter could file unlimited
    -- reports on one post because the comment_id NULLs would never collide. The forum
    -- schema relies on the opposite default elsewhere -- every reply carries a NULL
    -- floor number -- which is exactly why this needs saying.
    CONSTRAINT forum_reports_once UNIQUE NULLS NOT DISTINCT (reporter_id, post_id, comment_id)
);
-- +goose StatementEnd

-- The queue: open reports, oldest first, because the oldest complaint has waited
-- longest.
-- +goose StatementBegin
CREATE INDEX forum_reports_open_idx ON core.forum_reports (created_at)
    WHERE state = 'open';
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_reports_post_idx ON core.forum_reports (post_id) WHERE post_id IS NOT NULL;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_reports_comment_idx ON core.forum_reports (comment_id) WHERE comment_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.forum_reports;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX core.forum_comments_hidden_idx;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX core.forum_posts_hidden_idx;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE core.forum_comments
    DROP CONSTRAINT forum_comments_hidden_together,
    DROP COLUMN hidden_reason, DROP COLUMN hidden_by, DROP COLUMN hidden_at;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    DROP CONSTRAINT forum_posts_hidden_together,
    DROP COLUMN hidden_reason, DROP COLUMN hidden_by, DROP COLUMN hidden_at;
-- +goose StatementEnd
