#!/usr/bin/env bash
# Builds the comment the workflow posts back on the pull request, and says whether
# it has to be posted as the retry PAT.
#
# Usage: ff-comment-body.sh <body-file>
#   Writes the markdown to <body-file>. Prints `true` or `false` on stdout -- and
#   nothing else, so the caller can capture it -- meaning "this is a refusal the
#   review bot must be woken by".
#
# Environment:
#   PUSHED      outcome of the push step: `success` when master moved
#   HEAD_SHA    the commit master was moved to
#   CHAIN       chain id from the bot's marker; empty for a human request
#   ATTEMPT     attempt number from the bot's marker; may be empty
#   RUN_URL     link to this workflow run
#   REFUSAL_FILE  where the failing step wrote its reason (see ff-common.sh)
#
# A refusal addressed to the bot must WAKE the bot, and a comment authored by
# GITHUB_TOKEN triggers no workflow -- hence the retry flag, which tells the caller
# to post with FAST_FORWARD_TOKEN instead. Everything else stays
# github-actions[bot], the better author for a comment nobody needs to act on.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

body="${1:?usage: ff-comment-body.sh <body-file>}"
PUSHED="${PUSHED:-}"
HEAD_SHA="${HEAD_SHA:-}"
CHAIN="${CHAIN:-}"
ATTEMPT="${ATTEMPT:-}"
RUN_URL="${RUN_URL:-}"

retry=false

if [ "$PUSHED" = "success" ]; then
  printf '%s\n' "Fast-forwarded \`master\` to \`$HEAD_SHA\`. Nothing was rewritten, so every commit keeps its SHA and its signature." > "$body"
elif [ -s "$REFUSAL_FILE" ]; then
  if [ -n "$CHAIN" ]; then
    # The bot asked, and this is why it cannot have it. Addressed so claude.yml
    # re-enters -- its trigger requires `@claude` to be the first thing in the
    # body, so this line must come first.
    retry=true
    {
      echo "@claude the fast-forward refused this attempt:"
      echo
      cat "$REFUSAL_FILE"
    } > "$body"
  else
    cp "$REFUSAL_FILE" "$body"
  fi
else
  # A step failed before writing a reason: infrastructure, not a refusal.
  printf '%s\n' "The fast-forward run failed before it could check this pull request. See [the run log]($RUN_URL)." > "$body"
fi

printf '\n%s\n' "<sub>[fast-forward run]($RUN_URL)</sub>" >> "$body"

if [ "$retry" = true ]; then
  # A DIFFERENT sentinel from the `claude-land chain=` marker the bot writes: that
  # one is counted to bound the chain, and reusing it here would make every
  # refusal spend a second attempt.
  #
  # `attempt=` carries the attempt this run just refused, which claude.yml reads
  # and adds one to. Omitting it (which this did until 2026-08-12) left that side
  # falling back to counting `claude-land chain=` comments through the list API --
  # the very undercount the marker exists to defeat, measured on PR #22 where a
  # 12-second-old comment was still absent from the list and attempt 2 called
  # itself attempt 1. A marker whose attempt could not be parsed is written
  # without the field rather than with an empty one, so the far side falls back
  # cleanly instead of matching `attempt=` and reading nothing.
  marker="<!-- claude-land-retry chain=$CHAIN"
  if [ -n "$ATTEMPT" ]; then
    marker="$marker attempt=$ATTEMPT"
  fi
  marker="$marker -->"
  printf '\n%s\n' "$marker" >> "$body"
fi

printf '%s\n' "$retry"
