-- +goose Up
-- Per-game roles: who administers or moderates a game's corner of the platform.
--
-- Site-wide administration is deliberately NOT here. It stays `core.users.is_superuser`,
-- which already carries a last-administrator invariant enforced under a membership
-- lock, a bootstrap route, and every existing route guard. Re-homing it would mean
-- reimplementing that invariant against a different shape and living with a window
-- in which the column and this table disagree about who is an administrator. So
-- every row here is game-scoped, which is why `game` is NOT NULL and there is no
-- nullable-scope case to get wrong.

-- +goose StatementBegin
CREATE TABLE core.role_grants (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES core.users (id) ON DELETE CASCADE,
    role       text NOT NULL,
    game       text NOT NULL,

    -- Who granted it. SET NULL rather than CASCADE: deleting the administrator who
    -- granted a role must not silently revoke the role.
    granted_by uuid REFERENCES core.users (id) ON DELETE SET NULL,

    -- created_at only, and no updated_at trigger, against the usual convention. A
    -- grant is immutable: changing someone's role is a revoke and a grant, so
    -- granted_by and created_at always describe *this* grant rather than an earlier
    -- one that was edited into it. A column nothing ever updates would only invite
    -- the opposite.
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT role_grants_role_check CHECK (role IN ('game_admin', 'game_moderator')),
    CONSTRAINT role_grants_game_check CHECK (game = ANY (core.game_keys())),

    -- One row per person per role per game. Both columns are NOT NULL, so the
    -- default NULL-distinctness of UNIQUE cannot defeat this the way it would if
    -- `game` were nullable for a site-wide row.
    CONSTRAINT role_grants_unique UNIQUE (user_id, role, game)
);
-- +goose StatementEnd

-- Reading direction decides the index: "who staffs this game" is the public cabin
-- query, and "what may this account do" is the authorization query on every
-- moderation action.
-- +goose StatementBegin
CREATE INDEX role_grants_game_idx ON core.role_grants (game, role);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX role_grants_user_game_idx ON core.role_grants (user_id, game);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.role_grants;
-- +goose StatementEnd
