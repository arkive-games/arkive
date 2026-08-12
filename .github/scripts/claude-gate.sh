#!/usr/bin/env bash
# Decides whether an `@claude` comment starts a run, with what verb, and which
# attempt of the chain it is. Prints `key=value` lines for $GITHUB_OUTPUT.
#
# Deliberately PURE: the permission lookup and the comment list are resolved by
# the caller and passed in, so every branch below can be asserted without a
# network. See tests/test-claude-gate.sh.
#
# Environment:
#   COMMENTER      login of whoever commented
#   BOT_LOGIN      login of the review bot App, e.g. `arkive-review[bot]`
#   PERMISSION     what the API said about COMMENTER: admin|write|maintain|read|none
#   BODY           the comment body, verbatim
#   COMMENT_ID     its id, which names a new chain
#   COMMENTS_FILE  file holding every comment body on the pull request
#   MAX_ATTEMPTS   budget for one chain
#
# Output keys: go, verb, chain, attempt, reason

set -euo pipefail

: "${COMMENTER:?}" "${BODY:?}" "${COMMENT_ID:?}" "${MAX_ATTEMPTS:?}"
BOT_LOGIN="${BOT_LOGIN:-}"
PERMISSION="${PERMISSION:-none}"
COMMENTS_FILE="${COMMENTS_FILE:-/dev/null}"

deny() { printf 'go=false\nreason=%s\n' "$1"; exit 0; }

# --- who asked ---------------------------------------------------------------
if [ -n "$BOT_LOGIN" ] && [ "$COMMENTER" = "$BOT_LOGIN" ]; then
  # A retry the gatekeeper asked for. Authorised because of WHO commented, and
  # only then is the marker read -- to learn which chain to continue. Authorising
  # on the marker's presence would let any stranger paste that text and walk past
  # the permission check below.
  if ! printf '%s' "$BODY" | grep -q 'claude-land-retry chain='; then
    deny "bot comment with no retry marker"
  fi
  chain=$(printf '%s' "$BODY" | sed -n 's/.*claude-land-retry chain=\([0-9]\{1,\}\).*/\1/p' | head -1)
  [ -n "$chain" ] || deny "retry marker with no parsable chain id"
  prev_attempt=$(printf '%s' "$BODY" \
    | sed -n 's/.*claude-land-retry chain=[0-9]\{1,\} attempt=\([0-9]\{1,\}\).*/\1/p' | head -1)
else
  case "$PERMISSION" in
    admin | write | maintain) ;;
    # Silent. The repository is public; replying to a drive-by commenter invites
    # more comments, and every trigger spends gateway tokens.
    *) deny "commenter has '$PERMISSION' permission" ;;
  esac
  chain="$COMMENT_ID"
  prev_attempt=""
fi

# --- which verb --------------------------------------------------------------
# First line only: a body whose later prose happens to contain "fix" must not
# silently upgrade a review request into permission to edit code.
first=$(printf '%s' "$BODY" | head -1 | tr '[:upper:]' '[:lower:]')
case "$first" in
  '@claude fix'*) verb=fix ;;
  *)              verb=review ;;
esac

# --- how much budget is left --------------------------------------------------
# Counted AND parsed, higher wins, because each source covers the other's
# failure. Counting alone UNDERCOUNTS: the comments-list API lags its own writes,
# and on PR #22 a marker 12 seconds old was still absent, so attempt 2 called
# itself attempt 1 and the chain would have run four times against a budget of
# three. Parsing alone is resettable: a number in a comment can be written as 1
# forever. Lag pushes only the count down; a forged marker only spends the budget
# faster; under-reporting needs both wrong at once, in opposite directions.
counted=$(grep -c "claude-land chain=$chain" "$COMMENTS_FILE" 2>/dev/null || true)
counted=${counted:-0}
from_count=$(( counted + 1 ))
from_marker=$(( ${prev_attempt:-0} + 1 ))
attempt=$(( from_count > from_marker ? from_count : from_marker ))

if [ "$attempt" -gt "$MAX_ATTEMPTS" ]; then
  printf 'go=false\nreason=budget exhausted\nchain=%s\nattempt=%s\nexhausted=true\n' "$chain" "$attempt"
  exit 0
fi

printf 'go=true\nverb=%s\nchain=%s\nattempt=%s\ncounted=%s\n' \
  "$verb" "$chain" "$attempt" "$counted"
