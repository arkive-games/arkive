-- +goose Up
-- Saved Lord of Mysteries characters: the score page's inputs, never a score.
--
-- `data` is an envelope the frontend owns and versions (`schemaVersion` inside it,
-- copied to its own column so a future migration can find the rows it has to read).
-- The backend checks its outer shape only; the sections inside are opaque here.
--
-- `owner_id` names a core.users row but carries no foreign key: modules never hold
-- cross-schema references (see backend-go/README.md), so this schema can be served
-- and migrated by a process that does not own core.

-- The runtime creates the schema before goose runs (goose's version table lives in
-- it); repeated so that sqlc, which reads only these files, can resolve the names.
-- +goose StatementBegin
CREATE SCHEMA IF NOT EXISTS gmzz;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE gmzz.characters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The only identifier that leaves the server: the link a character is shared by,
    -- and the path its owner edits it at. Random, so links cannot be enumerated.
    public_id text NOT NULL UNIQUE,

    owner_id uuid NOT NULL,

    name text NOT NULL,
    -- Display metadata. Free text for now; `server` is a column of its own rather than
    -- part of `data` so a later public listing can filter and index on it.
    server text,
    uid text,
    show_uid boolean NOT NULL DEFAULT false,

    -- 'link': anyone holding the link may read it. 'private': its owner only. A later
    -- 'public' (listed and searchable) widens the CHECK and nothing else.
    visibility text NOT NULL DEFAULT 'link',

    sort_order integer NOT NULL,
    schema_version integer NOT NULL,
    data jsonb NOT NULL,

    -- Incremented by every write and required by every update, so two devices editing
    -- one character cannot silently overwrite each other.
    revision bigint NOT NULL DEFAULT 1,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT characters_visibility CHECK (visibility IN ('private', 'link')),
    CONSTRAINT characters_name_length CHECK (char_length(name) BETWEEN 1 AND 32),
    CONSTRAINT characters_server_length CHECK (server IS NULL OR char_length(server) BETWEEN 1 AND 32),
    CONSTRAINT characters_uid_length CHECK (uid IS NULL OR char_length(uid) BETWEEN 1 AND 32),
    CONSTRAINT characters_schema_version CHECK (schema_version >= 1),
    CONSTRAINT characters_data_object CHECK (jsonb_typeof(data) = 'object')
);
-- +goose StatementEnd

CREATE INDEX characters_owner_order ON gmzz.characters (owner_id, sort_order);

-- +goose Down
DROP TABLE gmzz.characters;
