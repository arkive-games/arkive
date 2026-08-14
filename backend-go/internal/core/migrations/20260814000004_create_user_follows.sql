-- +goose Up
-- The follow graph: who reads whom.
--
-- One row per direction, so following is not mutual unless both sides do it. The
-- composite primary key is the whole row's identity, which makes "follow twice" a
-- no-op through ON CONFLICT rather than a duplicate edge, and makes "do I follow
-- this person" a primary-key lookup.

-- +goose StatementBegin
CREATE TABLE core.user_follows (
    follower_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    followee_id uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (follower_id, followee_id),

    -- Following yourself is refused by the schema rather than by a service check, so
    -- no code path can create one — including a future bulk import that does not go
    -- through the service at all.
    CONSTRAINT user_follows_not_self CHECK (follower_id <> followee_id)
);
-- +goose StatementEnd

-- The primary key answers "who does this account follow" and the feed filter that
-- reads from it. This index answers the other direction, "who follows this account",
-- which is the follower list and its count.
-- +goose StatementBegin
CREATE INDEX user_follows_followee_idx ON core.user_follows (followee_id, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.user_follows;
-- +goose StatementEnd
