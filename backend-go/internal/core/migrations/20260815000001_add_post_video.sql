-- +goose Up
-- A post may link one video.
--
-- The composer has collected a Bilibili or Douyin URL since the forum was a set
-- of fixtures, storing it in the browser because there was nowhere else to put
-- it. Wiring the composer to this API without this column would not have left
-- the feature where it was — it would have silently discarded what the author
-- typed at the moment publishing started working, which is worse than the
-- placeholder it replaced.
--
-- One URL rather than a list: the composer offers one field, and a post that
-- needs several videos is better served by links in its body, which already
-- renders markdown.
--
-- The length bound matches the client's `maxLength={300}`. It is a guard against
-- an unbounded value rather than a judgement about URLs — the host allowlist is
-- enforced in the service, because it is a policy that will change (a third
-- platform, a new short-link domain) and a CHECK constraint would make every
-- such change a migration, applied to a table that already holds rows the new
-- rule would reject.
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    ADD COLUMN video_url text,
    ADD CONSTRAINT forum_posts_video_url_length
        CHECK (video_url IS NULL OR char_length(video_url) BETWEEN 1 AND 300);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE core.forum_posts
    DROP CONSTRAINT forum_posts_video_url_length,
    DROP COLUMN video_url;
-- +goose StatementEnd
