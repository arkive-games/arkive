# User UID — Design

Date: 2026-08-10
Status: accepted

Adds a human-readable account number to the Go backend's `core` module. Accounts today are
identified only by a uuid, which is unusable as something a person reads, types or quotes.

Two numbers, one disjoint space:

- **Real uid** — allocated from 10000 upward, one per account, **never reused**. This is the
  permanent identity, and every permanent link uses it.
- **Special uid** — a vanity number in 0–9999, optional, assignable by an administrator,
  changeable and revocable. An account holding one is reachable by *both* numbers. It exists
  for display; it is never the basis of a permalink, because it can move.

The uuid remains the primary key and the internal handle. Nothing about authentication,
tokens or `auth.Principal` changes.

## 1. Storage

Three shapes were considered.

| | Shape | Verdict |
|---|---|---|
| **A. Two columns** | `uid bigint` identity-allocated; `special_uid integer` nullable unique | **Accepted** |
| B. One `public_id` | values below 10000 mean "special" | Rejected |
| C. Side table | `core.user_special_uids`, FK to users | Rejected for now |

B is rejected because assigning a vanity number would *overwrite* the real uid, so the
account could no longer be found by its permanent number — it defeats the requirement it
exists to serve.

C is rejected because a special uid is a scalar attribute of an account, and a side table
puts a join on every profile read to store it. It earns its cost only alongside a feature
that needs rows without a holder — number *reservation*, or a past-holder audit trail.
Neither is being built (§8), so neither pays for the join today.

### 1.1 Migration

`internal/core/migrations/20260810000001_add_user_uid.sql`:

```sql
ALTER TABLE core.users ADD COLUMN uid bigint;

UPDATE core.users u SET uid = 9999 + o.rn
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM core.users) o
WHERE u.id = o.id;

ALTER TABLE core.users
    ALTER COLUMN uid SET NOT NULL,
    ALTER COLUMN uid ADD GENERATED ALWAYS AS IDENTITY (START WITH 10000 MINVALUE 10000),
    ADD COLUMN special_uid integer,
    ADD CONSTRAINT users_uid_key           UNIQUE (uid),
    ADD CONSTRAINT users_uid_range         CHECK (uid >= 10000),
    ADD CONSTRAINT users_special_uid_key   UNIQUE (special_uid),
    ADD CONSTRAINT users_special_uid_range CHECK (special_uid BETWEEN 0 AND 9999);

SELECT setval(pg_get_serial_sequence('core.users', 'uid'),
              coalesce(max(uid), 10000), count(*) > 0) FROM core.users;
```

Four decisions inside those statements are worth stating, because each one prevents a
specific defect.

**The backfill exists because the table is not empty.** `scripts/import-legacy-users.sh`
imports the Python service's accounts, so production rows predate this column. Ordering by
`created_at` gives the oldest account 10000 — an ordering users can see and would notice
being arbitrary.

**The closing `setval` is load-bearing.** An identity column declared `START WITH 10000` on a
table already backfilled from 10000 hands the *next* registration a number that is already
taken. The first draft of this migration omitted the `setval` and had exactly that bug. The
`count(*) > 0` third argument covers the empty-table case: `setval(…, 10000, false)` makes
10000 the first number issued rather than the second.

**`GENERATED ALWAYS`, not `DEFAULT nextval`.** Postgres then refuses any caller-supplied
value outright, so the guarantee that no code path picks its own uid is enforced by the
schema rather than by the discipline of every future insert.

**Ranges are constrained, not merely conventional.** `users_uid_range` and
`users_special_uid_range` are what make the two number spaces provably disjoint, which §3
depends on for unambiguous lookup.

### 1.2 Verified behaviour

The migration was applied to a throwaway PostgreSQL 18 instance and each guarantee exercised
directly, rather than reasoned about:

| Guarantee | Observation |
|---|---|
| Numbering starts at 10000 | oldest of three backfilled accounts = 10000 |
| Backfill respects account age | 10000/10001/10002 followed `created_at`, not insert order |
| New registrations continue past the backfill | next account = **10003** |
| A removed account's uid is not reissued | deleted 10003, next registration = **10004** |
| A failed registration's uid is not reissued | rolled-back insert burned 10005, next = **10006** |
| No caller may choose a uid | `cannot insert a non-DEFAULT value into column "uid"` |
| Many accounts may hold no special uid | 5 concurrent `NULL`s (UNIQUE treats NULLs as distinct) |
| A special uid cannot be double-assigned | `duplicate key … "users_special_uid_key"` |
| Revoking frees the number | 42 revoked via `NULL`, then assigned to another account |
| The range is enforced at both ends | 10000 and −1 rejected; 0 accepted, per the stated 0–9999 |

**Gaps in the uid sequence are intended.** A burned number is the mechanism by which no
number is reused. A consequence to remember: uids are not an account count, and must never
be presented as one.

## 2. Deactivation

Deactivation is the existing `is_active` flag; this design adds no endpoint for it. The row
survives, so its uid stays bound to it and the question of reuse never arises. Even under the
hard `DELETE /users/{id}` the number is not reissued (§1.2), because the sequence, not the
table, is what remembers.

A deactivated account is **not** publicly resolvable — see §4.

## 3. Resolution

Because the two ranges are disjoint, a single query resolves either kind of number with no
discriminator:

```sql
-- name: GetUserByAnyUID :one
SELECT * FROM core.users WHERE uid = $1 OR special_uid = $1;
```

Measured at 60,005 rows: the planner uses a **BitmapOr across both unique indexes** — 8
shared buffer hits, no sequential scan. Probing every value from 0 to 10005, the worst case
was **1 matching row**, so the `:one` cardinality cannot be violated.

Note what this buys: the boundary constant 10000 does not appear in Go at all. Disjointness
is a database invariant, so no Go code needs to decide which kind of number it was handed,
and no Go code can disagree with the schema about where the boundary sits.

## 4. HTTP surface

| Route | Auth | Body / result |
|---|---|---|
| `GET /users/uid/{uid}` *(new)* | public | `UserPublic` |
| `GET /users/me` | user | `UserRead`, now carrying `uid` and `specialUid` |
| `PATCH /users/{id}` | admin | accepts `specialUid` (§5) |
| `GET`/`PATCH`/`DELETE /users/{id}` | admin | otherwise unchanged, uuid-keyed |

`/users/uid/{uid}` is two segments deep and numerically typed, so it cannot be captured by
the uuid-typed `/users/{id}` under any registration order.

Two response types, because the distinction carries weight:

```go
type UserPublic struct { UID, SpecialUID, Name, CreatedAt }   // no email, no flags
type UserRead   struct { …existing fields…, UID, SpecialUID }
```

`UserPublic` is a separate type rather than a `UserRead` with fields blanked out. The reason
is the one that already governs `UserRead` itself, which has no password field: a type that
*cannot* carry an email address cannot be made to leak one by a future endpoint that reuses
it carelessly.

**A public lookup of an inactive account returns 404**, not a tombstone. Distinguishing
"never existed" from "deactivated" would disclose account state to anyone who asks, and this
codebase already refuses that trade in its login, reset and verification flows.

## 5. Assigning a special uid

Assignment rides on the existing admin `PATCH /users/{id}`. That endpoint's convention is
that a `nil` field means "leave unchanged", which a plain `*int32` cannot reconcile with
revocation: an absent field and an explicit `null` both arrive as `nil`, and revoke needs the
second to be distinguishable from the first.

`internal/platform/api` therefore gains a small tri-state:

```go
// Optional distinguishes an absent JSON field from an explicit null.
type Optional[T any] struct {
    Set   bool  // true when the key was present, even if its value was null
    Value *T    // nil when the value was null
}
```

`UnmarshalJSON` is invoked only for a key that is present — including when its value is
`null` — so `Set` separates the three cases: absent leaves the number alone, `null` revokes
it, a number assigns or changes it. Huma needs a `Schema(huma.Registry)` method on the type
to describe it in OpenAPI; if that proves impractical, the fallback is dedicated
`PUT`/`DELETE /users/{id}/special-uid` routes, which avoid the tri-state entirely at the cost
of two extra operations.

`specialUid` sits in the **privileged** branch of `Service.Update`, beside `isSuperuser`, so
a user PATCHing their own profile cannot award themselves a vanity number by adding a field
to the request body. `uid` is writable by nobody through any route.

## 6. Errors

`mapConstraintError` gains two cases: `users_special_uid_key` becomes a 409 naming the
conflict, `users_special_uid_range` a 422. The range is *also* checked in Go beforehand, so
the common mistake gets a message that states the actual bounds instead of the generic
check-violation text.

A note recorded from the verification run: a Postgres constraint violation's `DETAIL` field
echoes the **entire failing row, including `hashed_password`**. `mapConstraintError` reads
only `Code` and `ConstraintName` and must continue to — a test asserts that a conflict
response body contains no hash.

## 7. Tests

Added to `internal/core/integration_test.go`, which runs against a real PostgreSQL gated on
`ARKIVE_TEST_POSTGRES_URL` — the queries are generated against a real schema, so a fake would
only prove the fake works.

1. A first registration's uid is at least 10000.
2. Registrations receive increasing uids, and a deleted account's uid is not reissued.
3. The public route resolves an account by its real uid and by its special uid, to the same
   account.
4. The public payload carries no email address.
5. A non-administrator cannot set `specialUid` through `/users/me`.
6. Assigning an already-held special uid returns 409, and the body leaks no password hash.
7. Revoking with an explicit `null` frees the number for another account.
8. An absent `specialUid` field leaves an existing assignment untouched.
9. A public lookup of an inactive account returns 404.
10. Out-of-range special uids are rejected with 422.

## 8. Out of scope

Administrator search by uid; special-uid history or audit; reserving a number with no holder;
self-service deactivation; frontend display wiring; rate-limiting the public lookup.

The display rule — show the special uid when present, otherwise the real one — belongs to the
shared frontend account component, not the API. The API returns both fields and states no
preference, so presentation policy stays out of the contract.

One consequence is accepted deliberately rather than discovered later: **a public uid lookup
is an enumeration surface.** Walking upward from 10000 lists display names. That is inherent
to public profile permalinks and is how comparable sites behave, but it is a decision, and
rate-limiting that route is the mitigation if abuse appears.

## 9. Generated artifacts

`go tool sqlc generate` (the migration above is confirmed to parse) and
`go run ./cmd/arkive openapi` to refresh the committed `openapi/core.json`, which CI checks
for drift. Section 5 of `2026-08-08-go-backend-architecture-design.md` carries a sketch of
`core.users` and gains the two columns.

No app changelog entry: this is platform infrastructure with no user-visible surface yet, and
per the workspace rules a game's version history records only that game's visible changes.
