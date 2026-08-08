-- +goose Up
-- The runtime creates this schema before goose runs, because goose's own
-- version table lives inside it. It is repeated here so that sqlc, which reads
-- only these files to model the schema, can resolve "core."-qualified names.
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS core;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION core.set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE core.users (
    id              uuid        PRIMARY KEY,
    name            text        NOT NULL,
    email           text        NOT NULL,
    hashed_password text        NOT NULL,
    is_active       boolean     NOT NULL DEFAULT true,
    is_superuser    boolean     NOT NULL DEFAULT false,
    is_verified     boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_name_key       UNIQUE (name),
    CONSTRAINT users_email_key      UNIQUE (email),

    -- Emails are stored lowercased so the unique constraint actually prevents
    -- duplicate accounts. The Python schema used a case-sensitive unique index
    -- and looked rows up with ILIKE, which let "A@x.com" and "a@x.com" coexist
    -- as separate accounts while both matching the same login attempt.
    CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT users_email_shape     CHECK (position('@' in email) > 1),
    CONSTRAINT users_name_not_blank  CHECK (btrim(name) <> '')
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON core.users
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE core.users;
-- +goose StatementEnd

-- +goose StatementBegin
DROP FUNCTION core.set_updated_at();
-- +goose StatementEnd
