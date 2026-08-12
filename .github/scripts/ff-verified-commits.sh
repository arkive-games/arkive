#!/usr/bin/env bash
# Refuses a branch carrying any commit GitHub has not verified.
#
# We used to re-sign contributor commits by rebasing them locally with -S. A
# fast-forward cannot: it rewrites nothing. That is the better outcome -- a
# signature should say "I wrote this", not "I merged this" -- so the rule is now
# that commits arrive already verified.
#
# Environment:
#   PR                 pull request number
#   REPO               owner/name
#   COMMITS_QUERY_CMD  optional: a command invoked with the pull request number,
#                      printing one "<short sha> <reason>" line per UNVERIFIED
#                      commit and nothing when they are all verified. Defaults to
#                      the `gh api` call below.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

: "${PR:?PR (the pull request number) is required}"
REPO="${REPO:-}"

commits_query() { # pull request number
  if [ -n "${COMMITS_QUERY_CMD:-}" ]; then
    "$COMMITS_QUERY_CMD" "$1"
  else
    : "${REPO:?REPO is required to read the commits}"
    gh api --paginate "repos/$REPO/pulls/$1/commits" \
      --jq '.[] | select(.commit.verification.verified | not)
                | "\(.sha[0:12]) \(.commit.verification.reason)"'
  fi
}

unverified=$(commits_query "$PR")
if [ -n "$unverified" ]; then
  {
    echo "Refusing: every commit must be signed and verified by GitHub before it can land."
    echo
    echo '```'
    echo "$unverified"
    echo '```'
    echo
    echo "Sign these commits with a key registered on your GitHub account, then force-push with \`--force-with-lease\`."
  } > "$REFUSAL_FILE"
  refuse "PR #$PR has unverified commit(s)."
fi
echo "All commits verified."
