#!/usr/bin/env bash
#
# One-time import of accounts from the Python service's database into core.users.
#
# Run `arkive migrate` against the target first: this script only moves rows and
# will not create the schema.
#
# Decisions this script makes, and why:
#
#   - Emails are lowercased and trimmed. The legacy column was case-sensitively
#     unique and looked up with ILIKE; the new one is stored lowercased under a
#     real unique constraint. Verified safe before writing this: the production
#     data contains zero addresses that collide once lowercased.
#
#   - Display names are copied VERBATIM, not trimmed. Eleven pairs of production
#     accounts differ only by a trailing space ('a' and 'a '), so trimming would
#     silently rename real users and then collide on the unique constraint.
#     Preserving them keeps the import faithful; the duplicates are a
#     pre-existing data-quality question for a separate decision.
#
#   - One account whose name is a single space would violate the
#     users_name_not_blank check. It gets a deterministic placeholder derived
#     from its own id ("user_<first 8 hex>"), which cannot collide and is
#     traceable back to the row.
#
#   - Password hashes are copied unchanged. Every production hash is argon2id in
#     PHC form, which this service verifies natively, so no password is reset
#     and no user is locked out. (Bcrypt is also accepted and upgraded on login,
#     but the production data contains none.)
#
#   - Timestamps are preserved, so "member since" stays true.
#
# Re-running is safe: rows already present are left alone rather than
# overwritten, so a partial run can simply be repeated.

set -euo pipefail

SOURCE_DSN="${SOURCE_DSN:?set SOURCE_DSN to the legacy database, e.g. postgres://user:pass@host:5432/aion2_legacy}"
TARGET_DSN="${TARGET_DSN:?set TARGET_DSN to the new database, e.g. postgres://user:pass@host:5432/arkive}"

PSQL_SOURCE=(psql "$SOURCE_DSN" --no-psqlrc -v ON_ERROR_STOP=1)
PSQL_TARGET=(psql "$TARGET_DSN" --no-psqlrc -v ON_ERROR_STOP=1)

echo "==> Pre-flight checks on the source"

# Any of these would break the import; fail loudly before writing anything
# rather than half-way through.
blockers=$("${PSQL_SOURCE[@]}" -Atc "
  SELECT 'email collides once lowercased: '||(count(*)-count(DISTINCT lower(btrim(email)))) FROM users
   HAVING count(*) <> count(DISTINCT lower(btrim(email)))
  UNION ALL
  SELECT 'duplicate names: '||(count(*)-count(DISTINCT name)) FROM users
   HAVING count(*) <> count(DISTINCT name)
  UNION ALL
  SELECT 'email without a local part: '||count(*) FROM users
   WHERE position('@' in btrim(email)) <= 1 HAVING count(*) > 0
  UNION ALL
  SELECT 'unsupported password hash: '||count(*) FROM users
   WHERE hashed_password NOT LIKE '\$argon2id\$%' AND hashed_password !~ '^\\\$2[aby]\\\$'
   HAVING count(*) > 0
")

if [[ -n "$blockers" ]]; then
  echo "ABORTING; the source data would violate the target schema:" >&2
  echo "$blockers" >&2
  exit 1
fi

source_count=$("${PSQL_SOURCE[@]}" -Atc "SELECT count(*) FROM users")
echo "    source accounts: $source_count"

echo "==> Copying accounts"

# Rows are staged through a file rather than a pipe. psql's "\copy FROM STDIN"
# reads its inline data from wherever psql is reading commands — which, under
# -f, is the script itself, not the process's stdin. Naming the file explicitly
# removes that ambiguity. Both temporary files hold password hashes, so they are
# created private and removed on exit, including on failure.
loader="$(mktemp)"
data="$(mktemp)"
chmod 600 "$loader" "$data"
trap 'rm -f "$loader" "$data"' EXIT

# The heredoc is unquoted so that $data is substituted: \copy is parsed by psql
# itself and does not interpolate psql variables, so the path has to be literal.
cat >"$loader" <<SQL
-- Staged through a temp table so the insert can skip accounts that are already
-- present instead of failing the whole batch, which makes a partial run safe to
-- repeat.
CREATE TEMP TABLE legacy_users (
    id              uuid,
    name            text,
    email           text,
    hashed_password text,
    is_active       boolean,
    is_superuser    boolean,
    is_verified     boolean,
    created_at      timestamptz,
    updated_at      timestamptz
);

\copy legacy_users FROM '$data'

INSERT INTO core.users (
    id, name, email, hashed_password,
    is_active, is_superuser, is_verified, created_at, updated_at
)
SELECT id, name, email, hashed_password,
       is_active, is_superuser, is_verified, created_at, updated_at
FROM legacy_users
ON CONFLICT (id) DO NOTHING;
SQL

# Server-side COPY rather than psql's \copy: a meta-command has to fit on one
# line, and this projection does not. Streaming to STDOUT also means the size of
# the users table does not matter.
"${PSQL_SOURCE[@]}" -Atc "COPY (
  SELECT
    id,
    CASE WHEN btrim(name) = '' THEN 'user_' || left(id::text, 8) ELSE name END,
    lower(btrim(email)),
    hashed_password,
    is_active,
    is_superuser,
    is_verified,
    created_at,
    updated_at
  FROM users
  ORDER BY created_at
) TO STDOUT" >"$data"

"${PSQL_TARGET[@]}" -q -f "$loader"

target_count=$("${PSQL_TARGET[@]}" -Atc "SELECT count(*) FROM core.users")
echo "    target accounts: $target_count"

if [[ "$source_count" != "$target_count" ]]; then
  echo "WARNING: counts differ (source $source_count, target $target_count)." >&2
  echo "         Expected if the target already held accounts of its own." >&2
fi

echo "==> Verifying"
"${PSQL_TARGET[@]}" -Atc "
  SELECT 'accounts        : '||count(*) FROM core.users
  UNION ALL SELECT 'administrators  : '||count(*) FROM core.users WHERE is_superuser
  UNION ALL SELECT 'argon2id hashes : '||count(*) FROM core.users WHERE hashed_password LIKE '\$argon2id\$%'
  UNION ALL SELECT 'lowercase emails: '||count(*) FROM core.users WHERE email = lower(email)
  UNION ALL SELECT 'placeholder name: '||count(*) FROM core.users WHERE name LIKE 'user\_%' AND length(name)=13
"
echo "==> Done"
