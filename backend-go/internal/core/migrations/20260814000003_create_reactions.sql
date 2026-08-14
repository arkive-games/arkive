-- +goose Up
-- Reactions: likes on posts and comments, bookmarks on posts.
--
-- Three narrow tables rather than one polymorphic `reactions (target_type,
-- target_id, kind)`. A polymorphic target column cannot carry a foreign key, so a
-- like would outlive the post it was for and every count would silently include
-- orphans; it would also force a target_type predicate into every read, on an index
-- the planner uses less well than a purpose-built composite primary key. Three
-- tables cost two extra CREATEs and buy cascade-correct deletes for nothing.
--
-- Each has created_at and no updated_at: a reaction is created or destroyed, never
-- edited. Changing your mind is a delete followed by an insert.

-- The primary key is (post_id, user_id) rather than a surrogate id, which is what
-- makes "like twice" a no-op via ON CONFLICT instead of a duplicate row, and makes
-- the viewer's own state a primary-key lookup.
-- +goose StatementBegin
CREATE TABLE core.forum_post_likes (
    post_id    uuid NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
-- +goose StatementEnd

-- The reverse direction: "what has this account liked", for a profile's likes tab.
-- The primary key already answers the forward direction.
-- +goose StatementBegin
CREATE INDEX forum_post_likes_user_idx ON core.forum_post_likes (user_id, created_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.forum_post_bookmarks (
    post_id    uuid NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_post_bookmarks_user_idx ON core.forum_post_bookmarks (user_id, created_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.forum_comment_likes (
    comment_id uuid NOT NULL REFERENCES core.forum_comments (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_comment_likes_user_idx ON core.forum_comment_likes (user_id, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.forum_comment_likes;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE core.forum_post_bookmarks;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE core.forum_post_likes;
-- +goose StatementEnd
