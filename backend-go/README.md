# Arkive Backend (Go)

Replacement for the Python FastAPI service in `backend/`. Serves every Arkive game rather
than aion2 alone, and holds **dynamic and user data only** — all game content is owned by
the `tools` pipeline and shipped as the static `data/` artifacts.

Design: `docs/superpowers/specs/2026-08-08-go-backend-architecture-design.md`.

Status: the `core` module (accounts + authentication) is implemented. Comments, progress,
feedback, uploads and the aion2 abyss-artifact module are not yet.

## Layout

```
cmd/arkive/            entrypoint; `serve` (default) and `openapi`
internal/platform/     config, db, api envelope, error vocabulary — no domain knowledge
internal/module/       the Module interface + registry
internal/core/         accounts and authentication
  auth/                argon2id/bcrypt hashing, JWTs, Altcha, rate limiting, identity
  users/               account use cases
  httpapi/             huma handlers — the only package that knows about HTTP
  coredb/              sqlc-generated queries (checked in, do not edit)
  migrations/          this module's own goose stream
db/queries/core/       sqlc sources
openapi/               generated OpenAPI documents (checked in)
```

## Topology

One binary. Which modules a process serves is `ARKIVE_MODULES` (default: all), so running
everything in one process and running one process per game are the same binary with
different environments. Three invariants keep that true:

1. Each module migrates only its own schema, via its own goose version table.
2. No cross-schema foreign keys; no game module imports another game module.
3. Modules register through a registry, never a hardcoded list.

## Running

```sh
# Requires PostgreSQL. DEBUG=true fills in development secrets; outside debug,
# JWT_SECRET_KEY and ALTCHA_HMAC_KEY are required and placeholders are rejected.
DEBUG=true POSTGRES_URL='postgres://arkive:pass@localhost:5432/arkive?sslmode=disable' \
  go run ./cmd/arkive
```

Then `http://localhost:9000/api/v1/core/docs` for the API reference, and
`/api/v1/core/openapi.json` for the document itself.

## Local stack

```sh
docker compose up -d postgres      # database only, on host port 15432
docker compose up -d --build       # database + the Go service on host port 19000
```

`docker-compose.yml` replaces the Python service's compose: no Python image, no Celery,
no Redis (the Go service uses none of them), the database is named `arkive` rather than
`aion2`, and the API is published on **19000** because 9000 collides with MinIO on a typical
dev box.

## Working with production data locally

Restore the production database alongside the new one, then import the accounts:

```sh
# 1. Dump production (read-only; nothing is written to the server)
ssh root@<host> 'docker exec -i <pg-container> pg_dump -U aion2 -Fc --no-owner --no-acl aion2' \
  > aion2.dump

# 2. Restore it as a separate database in the local instance
docker exec arkive-backend-postgres-1 psql -U arkive -d arkive -c 'CREATE DATABASE aion2_legacy'
docker exec -i arkive-backend-postgres-1 pg_restore -U arkive -d aion2_legacy --no-owner --no-acl < aion2.dump

# 3. Create the new schema, then import the accounts into it
POSTGRES_URL='postgres://arkive:pass@127.0.0.1:15432/arkive?sslmode=disable' \
  go run ./cmd/arkive migrate
docker cp scripts/import-legacy-users.sh arkive-backend-postgres-1:/tmp/import.sh
docker exec \
  -e SOURCE_DSN='postgres://arkive:pass@localhost:5432/aion2_legacy' \
  -e TARGET_DSN='postgres://arkive:pass@localhost:5432/arkive' \
  arkive-backend-postgres-1 bash /tmp/import.sh
```

`aion2_legacy` keeps the full legacy dataset — markers, regions, abyss artifacts — for
reference while the remaining modules are ported. `arkive` holds only what `core` owns.

**The dump contains real addresses and password hashes. Keep it outside this repository.**
Nothing under `backend-go/` should ever hold one; `.dockerignore` excludes `*.dump` so a
stray copy cannot reach an image either.

After importing, confirm every hash is readable by this service — a hash it cannot parse is
a user who cannot log in:

```sh
ARKIVE_VERIFY_HASHES_URL='postgres://arkive:pass@127.0.0.1:15432/arkive?sslmode=disable' \
  go test ./internal/core/auth/ -run TestEveryStoredHashIsReadable -v
```

## Code generation

Both tools are pinned as `go tool` dependencies; neither needs a global install.

```sh
go tool sqlc generate      # regenerate internal/core/coredb from db/queries + migrations
go run ./cmd/arkive openapi # regenerate openapi/*.json
```

Both outputs are committed. CI regenerates them and fails on any diff, so a query that
does not match the schema, or an API change that was not intended, shows up in review
rather than at runtime.

The OpenAPI documents are captured from the real router, so a committed spec is
byte-for-byte what a running server serves.

## Tests

```sh
go test ./...   # unit tests only; database-backed tests skip
```

The integration tests need a real PostgreSQL, because the queries are generated against a
real schema and a fake would only prove the fake works:

```sh
docker run --rm -d --name arkive-test-pg -p 15499:5432 \
  -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=arkive_test postgres:18

ARKIVE_TEST_POSTGRES_URL='postgres://postgres:pass@127.0.0.1:15499/arkive_test?sslmode=disable' \
  go test ./...

docker rm -f arkive-test-pg
```

They drop and recreate the `core` schema on each run, so point them at a throwaway
database, never a real one.

## Notes on the port

Behaviour carried over deliberately:

- **Existing password hashes keep working.** Argon2id and bcrypt hashes written by
  `pwdlib` both verify, asserted against real vectors from that library; a bcrypt hash is
  upgraded to Argon2id on the next successful login.
Behaviour deliberately not carried over:

- **Existing access tokens stop working.** The audiences are Arkive's own
  (`arkive:auth`, not `fastapi-users:auth`), so a token minted by the old service is
  rejected. Every signed-in user is logged out once and signs in again. That is the point:
  a token issued before the rewrite should not keep granting access after it, and the
  vocabulary should not be named after a dependency the project no longer has.
  **Passwords are unaffected — nobody is asked to reset one.**

Behaviour deliberately changed:

- **Emails are stored lowercased** with a real unique constraint. The Python schema was
  case-sensitive and looked accounts up with `ILIKE`, so two accounts could share an
  address while both matching one login.
- **`become_superuser` works.** It was guarded by `get_current_superuser` and then refused
  if any superuser existed, so it could never succeed. It now requires only an
  authenticated caller and still refuses once an administrator exists. It also moved from
  `GET` to `POST`, since it mutates state.
- **Altcha challenges expire and are single-use.** They previously had no expiry and no
  replay check, so one solved challenge could register unlimited accounts.
- **The response envelope is applied consistently.** `fastapi-users`' generated routes
  returned bare objects while hand-written routes returned an envelope.

Not implemented, and explicit about it: **mail is not sent.** `auth.Mailer` has only a
logging implementation, matching the Python service, which printed reset and verification
tokens to stdout.
