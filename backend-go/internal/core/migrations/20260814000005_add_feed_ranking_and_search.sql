-- +goose Up
-- Feed ranking and search.
--
-- Trigram search rather than a tsvector column, which is the more obvious choice and
-- the wrong one here: the content is mixed Chinese and English, and Postgres' default
-- text-search configurations do not segment CJK, so `to_tsvector('simple', …)` indexes
-- a whole Chinese sentence as one token and matches almost nothing. A trigram index
-- does substring matching that behaves for both scripts — verified on postgres:18
-- against an English title and a Chinese one before this was written.
--
-- The extension is created in this module's own schema, so its functions belong to
-- `core` rather than landing in `public` where another module's stream would see them.
-- IF NOT EXISTS because an extension is database-scoped: a second module asking for
-- the same one must not fail.
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA core;
-- +goose StatementEnd

-- Featuring is editorial and has an actor, unlike the boolean the frontend fixtures
-- used — where one flag stood for "quality author", the Featured tab, and a cabin's
-- Guides tab all at once. Who featured it is worth keeping: it is the only record of
-- why a post is on the shelf.
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    ADD COLUMN featured_at timestamptz,
    ADD COLUMN featured_by uuid REFERENCES core.users (id) ON DELETE SET NULL,
    ADD CONSTRAINT forum_posts_featured_together
        CHECK ((featured_at IS NULL) = (featured_by IS NULL));
-- +goose StatementEnd

-- Partial: only featured posts are ever selected by it, and there will be few.
-- +goose StatementBegin
CREATE INDEX forum_posts_featured_idx ON core.forum_posts (featured_at DESC)
    WHERE featured_at IS NOT NULL;
-- +goose StatementEnd

-- The expression is matched exactly by the search predicate; a query that lowercases
-- or concatenates differently would not use this index.
-- +goose StatementBegin
CREATE INDEX forum_posts_search_idx ON core.forum_posts
    USING GIN (lower(title || ' ' || body) core.gin_trgm_ops);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX core.forum_posts_search_idx;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX core.forum_posts_featured_idx;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    DROP CONSTRAINT forum_posts_featured_together,
    DROP COLUMN featured_by,
    DROP COLUMN featured_at;
-- +goose StatementEnd
-- The extension is left in place: it is database-scoped, so dropping it here could
-- break another module that has since come to depend on it.
