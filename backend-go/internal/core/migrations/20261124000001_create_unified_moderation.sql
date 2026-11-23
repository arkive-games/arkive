-- +goose Up

-- Unified publication policy. Existing rows remain public legacy snapshots; new
-- writes are assigned a publication unit and an account tier by the policy service.

-- +goose StatementBegin
CREATE TABLE core.moderation_trust (
    user_id             uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
    tier                text NOT NULL DEFAULT 'new' CHECK (tier IN ('new', 'trusted', 'restricted')),
    qualifying_approvals integer NOT NULL DEFAULT 0 CHECK (qualifying_approvals >= 0),
    restricted_until    timestamptz,
    administrator_hold  text,
    updated_at          timestamptz NOT NULL DEFAULT now()
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.content_units (
    id              uuid PRIMARY KEY,
    author_id       uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    content_type    text NOT NULL CHECK (content_type IN ('map', 'forum', 'profile', 'build')),
    source_table    text NOT NULL CHECK (source_table IN ('marker_comments', 'marker_images', 'forum_posts', 'forum_comments', 'users', 'tool_outputs')),
    source_id       uuid,
    scope_game      text,
    revision        bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    state           text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'published', 'rejected', 'hidden', 'withdrawn', 'deleted')),
    review_reason   text NOT NULL CHECK (review_reason IN ('new', 'restricted', 'unverified', 'queued', 'restoration')),
    title           text NOT NULL DEFAULT '',
    body            text NOT NULL DEFAULT '',
    fields          jsonb NOT NULL DEFAULT '{}'::jsonb,
    media           jsonb NOT NULL DEFAULT '[]'::jsonb,
    previous_public jsonb,
    policy_version  text NOT NULL DEFAULT '1.0.0',
    submitted_at    timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_table, source_id, revision)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX content_units_queue_idx ON core.content_units (state, submitted_at, id)
    WHERE state = 'pending';
CREATE INDEX content_units_author_idx ON core.content_units (author_id, submitted_at DESC, id);
CREATE INDEX content_units_scope_idx ON core.content_units (content_type, submitted_at, id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.moderation_decisions (
    id                 uuid PRIMARY KEY,
    unit_id            uuid NOT NULL REFERENCES core.content_units(id) ON DELETE CASCADE,
    expected_revision  bigint NOT NULL,
    actor_id           uuid NOT NULL REFERENCES core.users(id),
    decision           text NOT NULL CHECK (decision IN ('approve', 'reject', 'hide', 'restore')),
    classification     text NOT NULL CHECK (classification IN ('quality', 'ordinary', 'serious')),
    qualification_credit boolean NOT NULL DEFAULT false,
    reason             text NOT NULL,
    evidence           text NOT NULL DEFAULT '',
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_decisions_unit_idx ON core.moderation_decisions (unit_id, created_at DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.moderation_violations (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    unit_id     uuid REFERENCES core.content_units(id) ON DELETE SET NULL,
    severity    text NOT NULL CHECK (severity IN ('ordinary', 'serious')),
    evidence    text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    overturned_at timestamptz
);
CREATE INDEX moderation_violations_user_idx ON core.moderation_violations (user_id, created_at DESC)
    WHERE overturned_at IS NULL;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.moderation_credits (
    id          uuid PRIMARY KEY,
    unit_id     uuid NOT NULL UNIQUE REFERENCES core.content_units(id) ON DELETE CASCADE,
    reviewer_id uuid NOT NULL REFERENCES core.users(id),
    author_id   uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    reason      text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_credits_author_idx ON core.moderation_credits (author_id, created_at);
-- +goose StatementEnd

-- Existing map/forum records are legacy public snapshots. New writes can move to
-- pending without fabricating approval history for these rows.
-- +goose StatementBegin
ALTER TABLE core.marker_comments ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('pending', 'published', 'rejected', 'hidden'));
ALTER TABLE core.forum_posts ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('pending', 'published', 'rejected', 'hidden'));
ALTER TABLE core.forum_comments ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('pending', 'published', 'rejected', 'hidden'));
-- +goose StatementEnd

-- Forum attachments are part of the same publication unit as their post. Legacy
-- rows remain public; new uploads inherit the account's publication tier.
-- +goose StatementBegin
ALTER TABLE core.forum_post_images ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('pending', 'published', 'rejected'));
CREATE INDEX forum_post_images_publication_idx ON core.forum_post_images (post_id, position)
    WHERE publication_status = 'published';
-- +goose StatementEnd

-- +goose Down
ALTER TABLE core.forum_comments DROP COLUMN publication_status;
ALTER TABLE core.forum_posts DROP COLUMN publication_status;
ALTER TABLE core.marker_comments DROP COLUMN publication_status;
DROP INDEX core.forum_post_images_publication_idx;
ALTER TABLE core.forum_post_images DROP COLUMN publication_status;
DROP TABLE core.moderation_credits;
DROP TABLE core.moderation_violations;
DROP TABLE core.moderation_decisions;
DROP TABLE core.content_units;
DROP TABLE core.moderation_trust;
