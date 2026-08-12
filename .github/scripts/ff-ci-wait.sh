#!/usr/bin/env bash
# Waits for ci.yml to conclude on the head commit, and refuses if it did not
# conclude successfully.
#
# Until this existed nothing here asserted CI had passed. That was safe only
# because a person decided when to comment `/fast-forward`, and supplied the
# judgement implicitly by not commenting on a red pull request. The review bot
# removes the person, so the judgement has to become a check.
#
# It asks ci.yml directly rather than reading every check run on the SHA: the
# fast-forward job is itself a check run on that SHA and is `in_progress` while it
# looks, so a naive "all checks green" test can never pass. Asking the one workflow
# we mean is both precise and readable.
#
# It WAITS rather than refuses while CI is still running, which is not a
# convenience -- it is the difference between a cheap gate and an expensive one.
# The review bot rebases, force-pushes and asks to land in the same run, so CI on
# the new SHA has usually not even STARTED when the request arrives. Refusing then
# sent back "CI is still queued", which re-entered the bot and spent a full ~$4
# review of the whole diff to answer a timing problem. Measured on PR #22, run
# 31517983083. It helps the human path too: `/fast-forward` typed straight after a
# push used to refuse for the same reason.
#
# The cost is that the job holds the `fast-forward-master` concurrency group while
# it waits, so another landing queues behind it. That is why the cap is ten minutes
# and not longer -- CI here runs in about three.
#
# Environment:
#   HEAD_SHA          the commit CI must have passed on
#   REPO              owner/name
#   TIMEOUT_SECONDS   default 600
#   POLL_SECONDS      default 20
#   CI_QUERY_CMD      optional: a command invoked with the head SHA, printing three
#                     lines -- status, conclusion, run url -- or nothing at all when
#                     no run exists yet. Defaults to the `gh api` call below. The
#                     seam is the point: it makes the polling and the decision
#                     testable in milliseconds, while the query itself stays a
#                     one-liner with nothing to get wrong.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

: "${HEAD_SHA:?HEAD_SHA is required}"
REPO="${REPO:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-600}"
POLL_SECONDS="${POLL_SECONDS:-20}"

ci_query() { # head sha
  if [ -n "${CI_QUERY_CMD:-}" ]; then
    "$CI_QUERY_CMD" "$1"
  else
    : "${REPO:?REPO is required to query CI}"
    # Most recent run wins, so a re-run after a fix is what counts. `select` keeps
    # an empty answer empty when the SHA has no run at all.
    gh api --paginate "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$1" \
      --jq '.workflow_runs | sort_by(.created_at) | last | select(. != null)
            | .status, (.conclusion // ""), (.html_url // "")'
  fi
}

deadline=$(( SECONDS + TIMEOUT_SECONDS ))
status=absent
conclusion=
run_url=

while :; do
  answer=$(ci_query "$HEAD_SHA" || true)

  if [ -n "$answer" ] && [ "$answer" != "null" ]; then
    status=$(printf '%s\n' "$answer" | sed -n 1p)
    conclusion=$(printf '%s\n' "$answer" | sed -n 2p)
    run_url=$(printf '%s\n' "$answer" | sed -n 3p)
    status="${status:-absent}"
  else
    # A just-pushed SHA has no run for a few seconds. Absent is a state to wait
    # through, not a verdict.
    status=absent
    conclusion=
    run_url=
  fi
  echo "ci.yml on $HEAD_SHA: status=$status conclusion=${conclusion:-<none>} ($(( deadline - SECONDS ))s left)"
  [ "$status" = "completed" ] && break

  if [ "$SECONDS" -ge "$deadline" ]; then
    {
      if [ "$status" = "absent" ]; then
        echo "Refusing: no CI run appeared for \`$HEAD_SHA\` within $(( TIMEOUT_SECONDS / 60 )) minutes, so there is no evidence this branch builds."
        echo
        echo "Check that \`ci.yml\` is triggering for this branch, then request again."
      else
        echo "Refusing: [CI]($run_url) was still \`$status\` for \`$HEAD_SHA\` after $(( TIMEOUT_SECONDS / 60 )) minutes."
        echo
        echo "Wait for it to finish, then request again."
      fi
    } > "$REFUSAL_FILE"
    refuse "CI did not complete for $HEAD_SHA within ${TIMEOUT_SECONDS}s (last status: $status)."
  fi
  sleep "$POLL_SECONDS"
done

if [ "$conclusion" != "success" ]; then
  {
    echo "Refusing: [CI]($run_url) concluded \`$conclusion\` for \`$HEAD_SHA\`."
    echo
    echo "Fix what it reports, push, and request again."
  } > "$REFUSAL_FILE"
  refuse "CI concluded $conclusion for $HEAD_SHA."
fi

echo "CI passed on $HEAD_SHA."
