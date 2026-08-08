# Go Backend — Architecture and Core Module Design

Date: 2026-08-08
Status: accepted (architecture), in progress (core module)

Replaces the Python FastAPI backend (`backend/`) with a Go service that serves every
Arkive game rather than aion2 alone.

## 1. Scope of the backend

**The backend owns dynamic and user data only.** All game *content* — markers, maps,
regions, subtypes, categories, translations — is owned by the `tools` pipeline and shipped
as the static `data/` artifacts over HTTP.

This resolves a contradiction in the current system: aion2 stores markers/maps/regions as
Postgres rows and edits them through the API, while palworld, sts2 and V Rising read
everything from `data/`. Going forward there is one answer, and it is the static one.

Consequence: identifiers that used to be database UUIDs become **opaque string keys**
produced by the pipeline (`map`, `layer`, `marker`). The backend stores them as `text` and
never resolves them — it has no `maps` table to join against.

### 1.1 Risk: marker progress is index-addressed

`user_marker_progress` stores a **bitset** whose bit positions are `markers.index_in_subtype`,
assigned by the database today. Once content moves to the pipeline, those indices are
assigned by a data build. If a rebuild reorders markers, **every user's progress silently
shifts to the wrong markers** — a data-corruption bug with no error and no obvious symptom.

Mitigation, required before progress ships (not part of the core module):

- The pipeline must emit marker indices as **append-only per (map, layer)**: an existing
  marker keeps its index forever; removed markers leave a tombstoned hole; new markers
  append at the end.
- `tools` gets a test asserting this across data versions.
- Progress rows record the `data_version` they were written against so a violation is
  detectable after the fact.

## 2. Service topology

Three options were considered:

| | Deploy isolation | Migration isolation | Shared-code cost |
|---|---|---|---|
| 1. One binary, one deployment | ✘ | ✔ (by schema) | none |
| 2. Service per game | ✔ | ✔ | version skew across N modules |
| 3. One binary, N deployments (role-gated) | ✔ | ✔ | none |

**Decision: start at 1, stay upgradeable to 3.** Option 2 is rejected: with one
genuinely game-specific feature (aion2 abyss artifacts) and a single operator on a single
VPS, separate services buy isolation that option 3 already provides, and charge a permanent
shared-library version-skew tax for it.

Approach 1 → 3 is a deploy-configuration change, not a refactor, **provided three
invariants hold from day one**:

1. **Migrations are split per schema** — one independent `goose` stream per module, each
   with its own version table (`core.goose_db_version`, `aion2.goose_db_version`, …). A
   module's stream cannot see another module's tables.
2. **No cross-schema foreign keys**, and no game module imports another game module.
3. **Modules register through a registry**, so "which modules does this process serve" is a
   config value (`ARKIVE_MODULES`), never a hardcoded list.

Violating these is what turns the upgrade from ten lines into a month.

## 3. Module layout

```
backend-go/
  cmd/arkive/            main + `openapi` subcommand
  internal/
    platform/            config, db, log, ratelimit — no domain knowledge
    module/              Module interface + registry
    core/                users, auth, uploads, comments, progress, feedback
    games/aion2/         abyss artifacts (later)
  migrations/core/       independent goose stream per schema
  db/queries/core/       sqlc sources
  openapi/               committed generated specs
```

```go
type Module interface {
    Name() string          // "core", "aion2"
    Schema() string        // the only Postgres schema it may write
    Migrations() fs.FS     // its own stream, its own version table
    Mount(chi.Router, Deps)
}
```

`main.go` mounts only the modules named in `ARKIVE_MODULES` (default: all). Today that is
one process serving all; later it is N processes each serving one. The binary is identical.

### 3.1 `core` merges "meta" and "shared"

An earlier draft split global concerns (`meta`: users, auth) from cross-game features
(`shared`: comments, progress, feedback). These are merged into one `core` module.

Two modules that can never be deployed or migrated independently are one module. `meta` and
`shared` fail that test on every axis: every shared feature is user-scoped, so they always
change together, and neither is ever game-specific. Splitting them would put a cross-schema
seam on the hottest join in the system (`comments → users`, on every comment list) and,
under the no-cross-schema-FK invariant, cost real referential integrity for a boundary that
would never be exercised.

Boundaries live at the **package** level inside `core`, where they are compile-time
enforced and free:

```
internal/core/users  auth  uploads          — no game dimension
internal/core/comments  progress  feedback  — game-scoped, take a game key parameter
```

**Future option, not built now:** if auth ever needs an independent security blast radius
(separate DB credentials, separate audit), `users`/`sessions` move to their own schema with
grants exposing only a `core.public_users` view. That is a security boundary, not a deploy
boundary, and needs a reason before it earns its cost.

### 3.2 Dependency rule, enforced in CI

```
games/*    → may import platform, core/api        ✔
games/*    → may import games/<other>             ✘
core/*     → may import platform                  ✔
platform/* → imports nothing internal             ✔
```

`core/api` is a narrow read-only interface (`UserByID`, `VerifySession`) with a DB-direct
implementation now and an HTTP implementation later, so game modules never learn whether
core is in-process or across the network.

## 4. API contract and client generation

**Framework: `huma` v2 on `chi`.** Huma derives OpenAPI 3.1 from Go types, so the spec
cannot drift from the code — the property FastAPI provided. `swaggo/swag` is rejected: its
comment annotations drift silently.

**One `huma.API` per module ⇒ one spec per module**, falling straight out of the module
boundary and requiring no change under topology 3:

```
/api/core/openapi.json
/api/aion2/openapi.json
```

**Every operation declares an explicit camelCase `OperationID`,** enforced in CI. The
current Python client demonstrates the cost of not doing this: FastAPI's default produced
`abyss_artifacts_create_abyss_artifact_api_v_1_maps_map_artifacts_post`. This single rule
matters more to generated-client quality than the framework choice.

**Specs are generated to committed artifacts** by `go run ./cmd/arkive openapi`, with a CI
job that regenerates and fails on diff. The frontend then generates clients without a
running server or database, and a breaking API change appears as a reviewable diff rather
than a production 422.

**TypeScript clients: `@hey-api/openapi-ts`,** one package per spec
(`frontend/packages/api-core`, `api-aion2`), output committed under the same drift gate.
The generated client uses **fetch**, not axios: ~13 KB gzipped saved on a tile-heavy site,
and hey-api's middleware hooks cover the token-refresh interceptors that would be axios's
only real advantage. Accepted cost: shared types such as `User` are duplicated across specs,
because `$ref`s into a shared components document break most TS generators. The structural
types stay compatible, so call sites are unaffected.

**Python client:** `tools/packages/backend-client` continues to be generated by
`openapi-python-client` from the same committed specs.

## 5. Core data model

One `core` schema. Timestamps (`created_at`, `updated_at`) on every table, `updated_at`
maintained by a trigger rather than application code.

```sql
core.users (
  id             uuid primary key,
  name           text not null unique,
  email          text not null unique,   -- citext-style: stored lowercased
  hashed_password text not null,
  is_active      boolean not null default true,
  is_superuser   boolean not null default false,
  is_verified    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
)
```

This mirrors the current `users` table (`fastapi-users`' `SQLAlchemyBaseUserTableUUID` plus
the project's `name` column and `TimestampMixin`), with two deliberate changes:

- `email` is **stored lowercased** with a unique constraint, instead of relying on a
  case-sensitive unique index plus `ilike` lookups. The current schema permits
  `A@x.com` and `a@x.com` to coexist as separate accounts.
- `varchar(320)`/`varchar(1024)` become `text`. Postgres stores them identically and the
  length caps only produce late, unhelpful errors.

`games` is a **compile-time registry in Go**, not a table. Game keys are referenced by
game-scoped tables as plain `text` with a check constraint; there is no FK, because games
are code, not data.

## 6. Authentication

Ported from `fastapi-users` with the same primitives, deliberately compatible where
compatibility is free.

**Password hashing.** Argon2id for all new hashes, in PHC string format
(`$argon2id$v=19$m=65536,t=3,p=4$…`) matching what `pwdlib` writes. **bcrypt verification is
retained** so existing hashes keep working, and any bcrypt hash is transparently rehashed to
Argon2id on the next successful login.

**Tokens.** HS256 JWT, `sub` = user id, `aud` = `fastapi-users:auth`, 14-day lifetime. The
audience string is retained so tokens issued by the Python service survive cutover; it is
configurable. Two transports over one strategy, as today:

- `Authorization: Bearer <token>` for API clients.
- An httpOnly cookie for browsers.

Reset-password and verify-email tokens are separate JWTs with distinct audiences and short
lifetimes, keyed to the current password hash so a reset link dies once used.

**Registration is Altcha-gated.** The proof-of-work challenge/verify pair is implemented
directly (~60 lines, fully specified) rather than pulled from a dependency, with tests
asserting byte-compatibility against the Python `altcha` package's output format.

**Mail is not implemented.** The Python service `print()`s reset and verification tokens and
never sends anything. The Go port defines a `Mailer` interface with a logging implementation,
so the gap is explicit rather than hidden.

**Rate limiting** is per-IP and in-process (`5/minute` on register, matching slowapi today).
Under topology 3 this becomes per-process; that is acceptable for the abuse it prevents, and
the interface allows a Redis-backed implementation later.

## 7. Response envelope

Every endpoint returns the existing envelope, camelCase:

```json
{ "errorCode": "Success", "errorMessage": "", "showType": 0, "data": { } }
```

Applied **consistently**, which the current API is not: `fastapi-users`' generated routes
return bare objects while hand-written routes return the envelope. There is no compatibility
cost to fixing this — `VITE_API_BASE_URL` appears only in `.env.example` and no frontend
source reads it, so the frontend calls no backend endpoint today.

The token endpoint is the one exception, returning `{accessToken, tokenType}` at the top
level to stay usable by standard OAuth2 tooling.

Errors carry a stable `errorCode` string, ported from the existing `ErrorCode` enum, with
the aion2 domain codes moved out of `core` into the aion2 module.

## 8. Endpoints in the core module

```
GET    /auth/altcha              getAltchaChallenge
POST   /auth/register            register            (altcha-gated, 5/min per IP)
POST   /auth/jwt/login           loginJWT            (form: username, password)
POST   /auth/jwt/logout          logoutJWT
POST   /auth/cookie/login        loginCookie
POST   /auth/cookie/logout       logoutCookie
POST   /auth/forgot-password     forgotPassword
POST   /auth/reset-password      resetPassword
POST   /auth/request-verify-token requestVerifyToken
POST   /auth/verify              verifyUser

GET    /users/me                 getCurrentUser
PATCH  /users/me                 updateCurrentUser
GET    /users/search             searchUsers         (superuser)
POST   /users/become-superuser   becomeSuperuser     (first user only)
GET    /users/{id}               getUser             (superuser)
PATCH  /users/{id}               updateUser          (superuser)
DELETE /users/{id}               deleteUser          (superuser)
```

`become-superuser` changes from `GET` to `POST`: it mutates state, and the current `GET`
form is reachable by prefetchers and browser address bars. Its guard is unchanged — it
succeeds only when no superuser exists yet.

## 9. Data layer

`pgx` v5 with `sqlc`-generated queries. No ORM: the current SQLAlchemy code relies on
`lazy="joined"` relationship loading whose emitted SQL is invisible at the call site, which
is the main reason its query behaviour is hard to reason about. sqlc makes every query
explicit and checks it against the real schema at build time.

`sqlc` and `goose` are pinned as `go tool` dependencies in `go.mod`; neither requires a
global install.

## 10. Testing

- **Unit** — Argon2id/bcrypt verification and rehash-on-login; Altcha challenge/verify
  including tampered payloads and expiry; JWT audience and expiry rejection.
- **Integration** — every endpoint against a real Postgres via `testcontainers-go`, since
  sqlc queries are only meaningful against a real schema. Covers the authorization matrix
  (anonymous / user / superuser) per endpoint, not just happy paths.
- **Migration** — `goose up` then `goose down` to zero on an empty database, asserting the
  down path is real rather than a stub.
- **Contract** — CI regenerates `openapi/*.json` and the TS clients and fails on diff.

## 11. Migration and cutover

The Go module is developed at `backend-go/` so the running Python service is untouched. At
cutover, `backend/` becomes `backend-python-archive/` and `backend-go/` becomes `backend/`.

Because aion2's live data lives in the public schema of an existing database, cutover moves
`users` into the new `core` schema. Existing password hashes (bcrypt or Argon2id) and
existing JWTs both remain valid, so no user is logged out and no password reset is forced.

## 12. Out of scope for this iteration

Comments, progress, feedback, uploads and the aion2 abyss-artifact module. Their tables and
packages are named here to fix the boundaries, but only `users` and `auth` are implemented
now.
