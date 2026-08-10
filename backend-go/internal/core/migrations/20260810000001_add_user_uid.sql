-- +goose Up
-- Adds the account number people actually read and quote.
--
-- Two numbers in one disjoint space: `uid` is permanent and allocated from
-- 10000 up, `special_uid` is an optional vanity alias in 0-9999 that an
-- administrator may assign, move or revoke. Keeping them in separate columns is
-- what lets an account be found by either one; folding them into a single
-- column would make assigning an alias destroy the permanent number.

-- +goose StatementBegin
ALTER TABLE core.users ADD COLUMN uid bigint;
-- +goose StatementEnd

-- Existing accounts predate this column, so they are numbered here. The order
-- is by account age, which is the only ordering a user would not find
-- arbitrary: the oldest account becomes 10000.
-- +goose StatementBegin
UPDATE core.users u SET uid = 9999 + o.rn
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM core.users) o
WHERE u.id = o.id;
-- +goose StatementEnd

-- GENERATED ALWAYS rather than DEFAULT nextval: Postgres then rejects any
-- caller-supplied value outright, so "no code path chooses its own uid" is a
-- schema guarantee instead of a convention every future INSERT has to honour.
--
-- The two range checks are what make the number spaces provably disjoint, which
-- is why one lookup can accept either kind without a discriminator column.
-- +goose StatementBegin
ALTER TABLE core.users
    ALTER COLUMN uid SET NOT NULL,
    ALTER COLUMN uid ADD GENERATED ALWAYS AS IDENTITY (START WITH 10000 MINVALUE 10000),
    ADD COLUMN special_uid integer,
    ADD CONSTRAINT users_uid_key           UNIQUE (uid),
    ADD CONSTRAINT users_uid_range         CHECK (uid >= 10000),
    ADD CONSTRAINT users_special_uid_key   UNIQUE (special_uid),
    ADD CONSTRAINT users_special_uid_range CHECK (special_uid BETWEEN 0 AND 9999);
-- +goose StatementEnd

-- Without this the identity sequence would still be sitting at its declared
-- START WITH 10000 while the backfill above has already handed 10000 out, so
-- the next registration would collide with the oldest account. The third
-- argument covers a fresh install: setval(..., 10000, false) makes 10000 the
-- first number issued rather than the second.
-- +goose StatementBegin
SELECT setval(pg_get_serial_sequence('core.users', 'uid'),
              coalesce(max(uid), 10000), count(*) > 0) FROM core.users;
-- +goose StatementEnd

-- +goose Down
-- Dropping the columns takes their constraints and the identity sequence with
-- them. Note that rolling back and re-applying renumbers every account, so the
-- Down path is for development only -- a uid is a permanent public identifier
-- once it has been shown to anyone.
-- +goose StatementBegin
ALTER TABLE core.users DROP COLUMN uid, DROP COLUMN special_uid;
-- +goose StatementEnd
