#!/usr/bin/env bash
# Decides whether this run needs to pay for a review, or can reuse the last one.
#
# Environment:
#   DELTA          id of what this branch contributes (see below)
#   COMMENTS_FILE  file holding every comment body on the pull request
# Output keys: skip, previous_verdict
#
# WHY
#
# A review costs about $4 and ten minutes. The retry chain re-entered the agent
# because the fast-forward gate refused for "CI is still queued" -- a timing
# problem -- and it answered by re-reviewing the entire diff, unchanged, for full
# price. A rebase-only repair has the same shape: nothing about the change under
# review is different, so a fresh opinion is worth nothing.
#
# DELTA is the identity of the branch's own contribution --
# `git diff <base>...HEAD | git hash-object --stdin` -- and NOT the tree id. A
# rebase moves the tree every time master moves, so a tree comparison would
# almost never match and this would never fire. The three-dot diff is against the
# merge base, so it is stable across a rebase that changes nothing of substance,
# which is exactly the case worth skipping.
#
# Fails open: anything unparsable means review. Paying twice is a waste; skipping
# a review that was needed is a defect on master.

set -euo pipefail

DELTA="${DELTA:?}"
COMMENTS_FILE="${COMMENTS_FILE:-/dev/null}"

# The last marker wins: earlier reviews describe earlier states of the branch.
#
# The verdict alternation is spelled out rather than matched as four capitals.
# `[A-Z]{4}` looked equivalent and was not: it matches the first four letters of
# any longer word, so a marker reading `verdict=MAYBE` parsed as `MAYB`, compared
# equal on the delta, and authorised a skip. Anything this does not recognise must
# fall through to a review.
last=$(grep -oE 'claude-reviewed delta=[0-9a-f]{7,} verdict=(LAND|HOLD)\b' "$COMMENTS_FILE" 2>/dev/null | tail -1 || true)

if [ -z "$last" ]; then
  printf 'skip=false\nprevious_verdict=\nreason=no previous review on this pull request\n'
  exit 0
fi

prev_delta=${last#claude-reviewed delta=}
prev_delta=${prev_delta%% *}
prev_verdict=${last##*verdict=}

if [ "$prev_delta" != "$DELTA" ]; then
  printf 'skip=false\nprevious_verdict=%s\nreason=the change moved since the last review\n' "$prev_verdict"
  exit 0
fi

# Same contribution, already judged. Reuse the verdict rather than re-buying it.
printf 'skip=true\nprevious_verdict=%s\nreason=unchanged since the last review\n' "$prev_verdict"
