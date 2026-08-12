-- +goose Up
-- The forum: threads and their comments.
--
-- This is the global forum that lives on the meta site, not the game-scoped
-- marker comments the architecture document reserves as core/comments. Games
-- appear here as tags on a post, so a thread can carry five of them or none.

-- +goose StatementBegin
CREATE TABLE core.forum_posts (
    id        uuid   PRIMARY KEY,

    -- The permalink, following the account uid precedent: the uuid stays the
    -- primary key and internal handle, while a number from an identity sequence
    -- is the public identity. GENERATED ALWAYS so no caller can choose one.
    post_no   bigint GENERATED ALWAYS AS IDENTITY NOT NULL,

    author_id uuid   NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,

    -- "hot" is a derived feed, never a stored channel. Posting to "official" is
    -- restricted in the service; see canPostToChannel.
    channel   text   NOT NULL,
    title     text   NOT NULL,

    -- Raw markdown, stored exactly as written and never rendered here. Keeping
    -- rendering out of the server keeps a sanitiser bug out of the stored data;
    -- the corresponding requirement on the client is in the design.
    body      text   NOT NULL,
    topic     text,

    -- Arrays rather than join tables: games are a compile-time registry in Go,
    -- not a table, so there is nothing to join to. A GIN index below answers
    -- containment directly. The caps match the composer's own limits.
    game_ids  text[] NOT NULL DEFAULT '{}',
    tags      text[] NOT NULL DEFAULT '{}',

    -- The allocator for this thread's floor numbers. A counter rather than
    -- max(comment_no) + 1, because deleting the highest comment must not hand
    -- its number to the next one. See the comment on forum_comments.
    next_comment_no bigint NOT NULL DEFAULT 1,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- NULL until an author edits, so a reader can tell "written" from "rewritten".
    edited_at  timestamptz,

    CONSTRAINT forum_posts_post_no_key   UNIQUE (post_no),
    CONSTRAINT forum_posts_channel_check CHECK (channel IN ('general', 'official', 'games')),
    CONSTRAINT forum_posts_topic_check   CHECK (
        topic IS NULL OR topic IN ('guide', 'question', 'testing', 'discussion')),
    CONSTRAINT forum_posts_title_length  CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT forum_posts_body_length   CHECK (char_length(btrim(body))  BETWEEN 1 AND 20000),
    CONSTRAINT forum_posts_games_count   CHECK (cardinality(game_ids) <= 5),
    CONSTRAINT forum_posts_tags_count    CHECK (cardinality(tags)     <= 10)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX forum_posts_feed_idx     ON core.forum_posts (created_at DESC, id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_posts_channel_idx  ON core.forum_posts (channel, created_at DESC);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_posts_author_idx   ON core.forum_posts (author_id, created_at DESC);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_posts_game_ids_idx ON core.forum_posts USING GIN (game_ids);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_posts_tags_idx     ON core.forum_posts USING GIN (tags);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER forum_posts_set_updated_at
    BEFORE UPDATE ON core.forum_posts
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- A thread has comments; a comment has replies; nothing nests further.
--
-- That rule is enforced here rather than in Go, and without a trigger:
--
--   * depth is GENERATED, so no caller can supply it or disagree with parent_id;
--   * parent_depth is 0 whenever there is a parent, and the composite foreign
--     key requires (parent_id, 0) to exist -- so a reply's parent must itself be
--     top level.
--
-- An ordinary depth column with CHECK (depth IN (0,1)) is not enough: a row
-- could claim depth 0 while holding a parent, which would make it a legitimate
-- parent for a further reply and produce three levels through the back door.
-- +goose StatementBegin
CREATE TABLE core.forum_comments (
    id        uuid PRIMARY KEY,
    post_id   uuid NOT NULL REFERENCES core.forum_posts (id) ON DELETE CASCADE,
    parent_id uuid,
    author_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    body      text NOT NULL,

    -- The floor number, unique within the thread and never reused. NULL on a
    -- reply: only top-level comments are numbered.
    comment_no bigint,

    depth        smallint NOT NULL GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END) STORED,
    parent_depth smallint GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN NULL ELSE 0 END) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    edited_at  timestamptz,

    CONSTRAINT forum_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),

    -- A floor number belongs to a top-level comment and to nothing else.
    CONSTRAINT forum_comments_no_iff_top_level
        CHECK ((parent_id IS NULL) = (comment_no IS NOT NULL)),

    -- NULLs are distinct under a unique constraint, so every reply may carry
    -- NULL while floor numbers stay unique within the thread.
    CONSTRAINT forum_comments_floor_key UNIQUE (post_id, comment_no),

    -- The referenced side of the composite foreign key below.
    CONSTRAINT forum_comments_id_depth_key UNIQUE (id, depth),
    CONSTRAINT forum_comments_parent_is_top_level
        FOREIGN KEY (parent_id, parent_depth)
        REFERENCES core.forum_comments (id, depth) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX forum_comments_thread_idx ON core.forum_comments (post_id, comment_no, created_at);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_comments_parent_idx ON core.forum_comments (parent_id, created_at);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX forum_comments_author_idx ON core.forum_comments (author_id, created_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER forum_comments_set_updated_at
    BEFORE UPDATE ON core.forum_comments
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.forum_comments;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE core.forum_posts;
-- +goose StatementEnd
