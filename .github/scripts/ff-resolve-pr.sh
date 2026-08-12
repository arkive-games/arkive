#!/usr/bin/env bash
# Reads the pull request and refuses the two states that make a fast-forward
# meaningless: one that is not open, and one that targets something other than
# master.
#
# Environment:
#   PR             pull request number
#   REPO           owner/name
#   PR_QUERY_CMD   optional: a command invoked with the pull request number,
#                  printing five lines -- state, base ref, head oid, head ref,
#                  and "true"/"false" for is-cross-repository. Defaults to the
#                  `gh pr view` below; the seam lets a test drive the decision.
#
# Outputs `head`, `head_ref` and `fork`.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

: "${PR:?PR (the pull request number) is required}"
REPO="${REPO:-}"

pr_query() { # pull request number
  if [ -n "${PR_QUERY_CMD:-}" ]; then
    "$PR_QUERY_CMD" "$1"
  else
    : "${REPO:?REPO is required to read the pull request}"
    gh pr view "$1" --repo "$REPO" \
      --json state,baseRefName,headRefOid,headRefName,isCrossRepository \
      --jq '.state, .baseRefName, .headRefOid, .headRefName, (.isCrossRepository | tostring)'
  fi
}

# Captured rather than piped: a failing query must fail the step, and the exit
# status of a process substitution or a pipeline's left side would be discarded.
fields=$(pr_query "$PR")
state=$(printf '%s\n' "$fields" | sed -n 1p)
base=$(printf '%s\n' "$fields" | sed -n 2p)
head=$(printf '%s\n' "$fields" | sed -n 3p)
head_ref=$(printf '%s\n' "$fields" | sed -n 4p)
fork=$(printf '%s\n' "$fields" | sed -n 5p)

if [ "$state" != "OPEN" ]; then
  echo "This pull request is $state, so there is nothing to fast-forward." > "$REFUSAL_FILE"
  refuse "PR #$PR is $state."
fi

if [ "$base" != "master" ]; then
  echo "This pull request targets \`$base\`, not \`master\`. Only master is landed this way." > "$REFUSAL_FILE"
  refuse "PR #$PR targets $base."
fi

emit head "$head"
emit head_ref "$head_ref"
emit fork "$fork"
