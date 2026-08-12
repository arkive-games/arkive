#!/usr/bin/env bash
# Decides whether the requester of a fast-forward may have one, and reads the
# review bot's chain/attempt marker when the requester is the bot.
#
# Not `author_association`: that reports MEMBER/CONTRIBUTOR from org and commit
# history, neither of which is push access. Ask about permission.
#
# The review bot is the one requester with no permission level to ask about: a
# GitHub App is not a collaborator. It is recognised by login instead, against
# $BOT_LOGIN (vars.CLAUDE_BOT_LOGIN) -- and by login ONLY. Recognising it by the
# chain marker in its comment would let any stranger paste that marker and walk
# straight past this gate, so the marker is read only AFTER the login matched, and
# only to learn which chain to reply on.
#
# Environment:
#   REQUESTER        login that asked (comment author, or github.actor on dispatch)
#   BOT_LOGIN        login of the review bot App, e.g. `arkive-bot[bot]`. Empty
#                    means no bot is recognised, which is the safe default and
#                    leaves this behaving exactly as it did before the bot existed.
#   BODY             the comment body. Attacker-controlled: it reaches this script
#                    through the environment, never interpolated into a shell
#                    string, and is only ever fed to sed on stdin.
#   REPO             owner/name, for the permission query
#   PERM_QUERY_CMD   optional: a command invoked with the login, printing that
#                    login's permission level. Defaults to the `gh api` call below.
#                    The seam exists so a test can drive every branch of the
#                    decision without a GitHub token.
#
# Outputs `chain` and `attempt` (empty for a human request).
#
# An unauthorised requester gets `::error::` and a failed step but NO refusal file,
# so the workflow's last step posts its generic "the run failed" line rather than
# an explanation. That is deliberate and pre-existing: this repository is public,
# and replying usefully to a drive-by commenter invites more of them.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

: "${REQUESTER:?REQUESTER (the login that asked) is required}"
BOT_LOGIN="${BOT_LOGIN:-}"
BODY="${BODY:-}"
REPO="${REPO:-}"

permission_of() { # login
  if [ -n "${PERM_QUERY_CMD:-}" ]; then
    "$PERM_QUERY_CMD" "$1"
  else
    : "${REPO:?REPO is required to query permissions}"
    gh api "repos/$REPO/collaborators/$1/permission" --jq .permission
  fi
}

chain=""
attempt=""

if [ -n "$BOT_LOGIN" ] && [ "$REQUESTER" = "$BOT_LOGIN" ]; then
  echo "$REQUESTER is the review bot."
  # Only now is the marker read, and only to learn which chain to reply on. It is
  # not what authorised this run.
  chain=$(printf '%s' "$BODY" | sed -n 's/.*claude-land chain=\([0-9]\{1,\}\).*/\1/p' | head -1)
  # The attempt number travels in the marker as well as being counted on the far
  # side. Counting alone undercounted: on PR #22 the marker comment was 12 seconds
  # old and the comments-list API still did not return it, so a retry that was
  # attempt 2 announced itself as attempt 1 and the chain would have run four
  # times, not three. This value comes from the event payload, which cannot lag.
  attempt=$(printf '%s' "$BODY" | sed -n 's/.*claude-land chain=[0-9]\{1,\} attempt=\([0-9]\{1,\}\).*/\1/p' | head -1)
  echo "chain=${chain:-<none>} attempt=${attempt:-<none>}"
else
  level=$(permission_of "$REQUESTER")
  echo "$REQUESTER has $level permission"
  case "$level" in
    admin | write | maintain) ;;
    *)
      echo "::error::$REQUESTER has '$level' permission on $REPO and may not land pull requests."
      exit 1
      ;;
  esac
fi

emit chain "$chain"
emit attempt "$attempt"
