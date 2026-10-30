-- +goose Up
-- Marker comments: notes readers leave under a map marker.
--
-- This is the game-scoped comments package the architecture design reserves as
-- core/comments, distinct from core.forum_* which is the site-wide board. Marker
-- comments are first-class here rather than folded into core.forum_comments,
-- because their target is not a row this database owns at all: markers, maps and
-- subtypes live in the data-<game> artifact repositories, so a marker comment can
-- carry no foreign key and has nothing to join to.
--
-- The three location columns are therefore opaque text guarded by a shape check,
-- exactly as the architecture design prescribes for pipeline-produced identifiers,
-- and by the shared game-key registry for the one of them the backend does know.
-- +goose StatementBegin
CREATE TABLE core.marker_comments (
    id       uuid PRIMARY KEY,
    game_key text NOT NULL,
    map_id   text NOT NULL,
    marker_id text NOT NULL,

    author_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    parent_id uuid,
    body      text NOT NULL,

    -- Generated, so no caller can supply a depth that disagrees with parent_id.
    -- The composite foreign key below then makes a reply-to-a-reply impossible
    -- for every code path, not just the service that usually refuses it.
    depth        smallint NOT NULL GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END) STORED,
    parent_depth smallint GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN NULL ELSE 0 END) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    edited_at  timestamptz,

    -- Hiding is reversible and attributed, as in the forum: the author keeps the
    -- hard DELETE, a moderator gets this instead, because a takedown that destroys
    -- the evidence cannot be reviewed or undone.
    hidden_at     timestamptz,
    hidden_by     uuid REFERENCES core.users (id) ON DELETE SET NULL,
    hidden_reason text,

    CONSTRAINT marker_comments_game_key_check
        CHECK (game_key = ANY (core.game_keys())),

    -- Bounds from the data, not from imagination. PBZ's marker ids are a prefix
    -- and a ten-character hex digest, at most 30 characters; its map ids are
    -- PascalCase (DengDingShanDao), which a lowercase-only rule would have refused.
    -- Both are ASCII-anchored so a fullwidth digit cannot arrive disguised as one.
    CONSTRAINT marker_comments_map_shape
        CHECK (map_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT marker_comments_marker_shape
        CHECK (marker_id ~ '^[A-Za-z0-9-]{1,40}$'),

    -- Runes are counted by char_length, matching the forum's comment limit.
    CONSTRAINT marker_comments_body_length
        CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),

    CONSTRAINT marker_comments_hidden_together
        CHECK ((hidden_at IS NULL) = (hidden_by IS NULL)),

    -- The referenced side of the composite foreign key below. The location columns
    -- are part of it so a reply cannot be filed under a different marker from its
    -- parent: without them, (parent_id, parent_depth) alone would accept a reply
    -- whose parent lives on another map, and deleting the parent would then cascade
    -- into a marker it never belonged to.
    CONSTRAINT marker_comments_id_location_depth_key
        UNIQUE (id, game_key, map_id, marker_id, depth),
    CONSTRAINT marker_comments_parent_is_top_level
        FOREIGN KEY (parent_id, game_key, map_id, marker_id, parent_depth)
        REFERENCES core.marker_comments (id, game_key, map_id, marker_id, depth)
        ON DELETE CASCADE
);
-- +goose StatementEnd

-- A marker's thread: the index the list read walks, filtered because hidden rows
-- are excluded from every public read and few enough that a partial index is
-- smaller than the table.
-- +goose StatementBegin
CREATE INDEX marker_comments_marker_idx
    ON core.marker_comments (game_key, map_id, marker_id, created_at DESC, id)
    WHERE hidden_at IS NULL;
-- +goose StatementEnd

-- Replies are lazy: the drawer asks for a thread's top-level comments first and
-- fetches one comment's replies when expanded.
-- +goose StatementBegin
CREATE INDEX marker_comments_parent_idx
    ON core.marker_comments (parent_id, created_at, id)
    WHERE parent_id IS NOT NULL AND hidden_at IS NULL;
-- +goose StatementEnd

-- The moderation queue reads only hidden rows, and there will be few.
-- +goose StatementBegin
CREATE INDEX marker_comments_hidden_idx
    ON core.marker_comments (hidden_at DESC, id)
    WHERE hidden_at IS NOT NULL;
-- +goose StatementEnd

-- name: set_updated_at is core.set_updated_at(), defined with core.users.
-- +goose StatementBegin
CREATE TRIGGER marker_comments_set_updated_at
    BEFORE UPDATE ON core.marker_comments
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- Likes are a row and not a counter on the comment: an INSERT ... ON CONFLICT DO
-- NOTHING is idempotent, so a double tap or a retried request means what it says,
-- and a count is an index-only scan over a partial index rather than a number that
-- can drift from the rows behind it.
-- +goose StatementBegin
CREATE TABLE core.marker_comment_likes (
    comment_id uuid NOT NULL REFERENCES core.marker_comments (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);
-- +goose StatementEnd

-- Reports reuse the forum's queue rather than growing a second one: a moderator
-- should not have to watch two inboxes, and the reasons, the states and the
-- hide/restore flow are identical. A marker comment therefore becomes a third
-- possible target, which the check constraint below widens from two to three.
--
-- The per-reporter uniqueness has to be rebuilt, not extended: a unique constraint
-- cannot gain a column in place, and it must be NULLS NOT DISTINCT for the same
-- reason it was there before — under the default, the two NULL targets compare
-- unequal, so one reporter could file unlimited reports on one marker comment.
-- +goose StatementBegin
ALTER TABLE core.forum_reports
    ADD COLUMN marker_comment_id uuid REFERENCES core.marker_comments (id) ON DELETE CASCADE;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE core.forum_reports
    DROP CONSTRAINT forum_reports_one_target,
    DROP CONSTRAINT forum_reports_once,
    ADD CONSTRAINT forum_reports_one_target
        CHECK (num_nonnulls(post_id, comment_id, marker_comment_id) = 1),
    ADD CONSTRAINT forum_reports_once
        UNIQUE NULLS NOT DISTINCT (reporter_id, post_id, comment_id, marker_comment_id);
-- +goose StatementEnd

-- A marker comment's report has no post to inherit a game from, so the queue's
-- game scope reads the key off the comment itself. This index serves that join.
-- +goose StatementBegin
CREATE INDEX forum_reports_marker_comment_idx
    ON core.forum_reports (marker_comment_id)
    WHERE marker_comment_id IS NOT NULL;
-- +goose StatementEnd

-- Notifications reuse the forum's kinds — 'reply' and 'comment_like' — on purpose.
-- notification_preferences is unique per kind, so sharing them means a reader who
-- muted comment likes on the forum is already muted here instead of having to
-- discover a second switch. The inbox links to the comment through this column.
-- +goose StatementBegin
ALTER TABLE core.notifications
    ADD COLUMN marker_comment_id uuid REFERENCES core.marker_comments (id) ON DELETE CASCADE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX notifications_marker_comment_idx
    ON core.notifications (marker_comment_id)
    WHERE marker_comment_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- Unwound in the reverse order of how it was wound, and each step is load-bearing:
-- the two foreign keys must go before the table they point at, and the reports
-- constraints must be restored to their two-target form before that, or a rollback
-- would leave a schema no application version can write to.
-- +goose StatementBegin
DROP INDEX IF EXISTS core.notifications_marker_comment_idx;
ALTER TABLE core.notifications DROP COLUMN IF EXISTS marker_comment_id;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS core.forum_reports_marker_comment_idx;
ALTER TABLE core.forum_reports
    DROP CONSTRAINT IF EXISTS forum_reports_once,
    DROP CONSTRAINT IF EXISTS forum_reports_one_target,
    DROP COLUMN IF EXISTS marker_comment_id,
    ADD CONSTRAINT forum_reports_one_target
        CHECK (num_nonnulls(post_id, comment_id) = 1),
    ADD CONSTRAINT forum_reports_once
        UNIQUE NULLS NOT DISTINCT (reporter_id, post_id, comment_id);
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS core.marker_comment_likes;
DROP TABLE IF EXISTS core.marker_comments;
-- +goose StatementEnd
