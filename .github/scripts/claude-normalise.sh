#!/usr/bin/env bash
# Makes the agent's commits landable: folds its `fixup!`s into the commits they
# amend, and puts the bot's identity on anything it committed.
#
# Usage:  claude-normalise.sh <base-ref> <pre-agent-sha>
# Environment: BOT_NAME (committer to normalise to), AGENT_COMMITTER (default
# `claude[bot]`), and the repository as $PWD.
#
# WHY EACH PIECE
#
# claude-code-action commits as `claude[bot]`, overriding the configured identity.
# GitHub looks for the signing key on the COMMITTER's account, so those commits
# arrive verified=false / unknown_key and fast-forward.yml refuses the branch.
# They are signed -- just by somebody GitHub cannot tie to the committer.
# Recreating them puts the bot's identity on them and re-signs with its key
# (rebase.gpgSign). The AUTHOR stays `claude[bot]`, which is honest: the agent did
# write them, and GitHub verifies the committer.
#
# The autosquash exists because a re-pointed changelog SHA belongs IN the commit
# that owns the entry, not in a trailing "re-point after the rebase" commit. One
# of those is produced per bot run, so they accumulate; PR #22 collected two. The
# agent chooses which commit to amend, because that is judgement, and writes a
# `fixup!`; the rewrite is mechanical and happens here, so `git rebase` never
# enters the model's toolset.
#
# NO --force-rebase on the autosquash. It looks like the thorough choice and is
# the wrong one: it recreates every commit on the branch, including the one a
# changelog entry pins, so the fold would orphan the re-point it had just applied
# and changelog:verify would refuse the branch one hop later. Unforced, git
# fast-forwards the commits before the amended one -- pinned SHAs survive -- while
# everything from the amendment onward still picks up the bot as committer.

set -euo pipefail

BASE_REF="${1:?usage: claude-normalise.sh <base-ref> <pre-agent-sha>}"
BEFORE="${2:?usage: claude-normalise.sh <base-ref> <pre-agent-sha>}"
BOT_NAME="${BOT_NAME:?BOT_NAME is required}"
AGENT_COMMITTER="${AGENT_COMMITTER:-claude[bot]}"

if [ "$(git rev-parse HEAD)" = "$BEFORE" ]; then
  echo "The agent committed nothing; nothing to normalise."
  exit 0
fi

echo "Before:"
git log --format='  %h author=%an committer=%cn %s' "$BASE_REF..HEAD"

GIT_SEQUENCE_EDITOR=true git rebase --interactive --autosquash "$BASE_REF"

if git log --format='%s' "$BASE_REF..HEAD" | grep -q '^fixup!'; then
  echo "::error::A fixup! commit survived the autosquash -- its target is not on this branch."
  git log --format='  %h %s' "$BASE_REF..HEAD" | grep 'fixup!' || true
  exit 1
fi

# With no fixup in the range git fast-forwards the whole todo list and rewrites
# nothing, so an agent commit that needed no folding would keep its own committer
# and stay unverifiable. Rewrite from the OLDEST such commit only -- never from
# the base, because anything older than it may be pinned by a changelog entry.
oldest=$(git log --reverse --format='%H%x09%cn' "$BASE_REF..HEAD" \
         | awk -F'\t' -v a="$AGENT_COMMITTER" '$2 == a { print $1; exit }')
if [ -n "$oldest" ]; then
  echo "Normalising from $oldest (oldest commit still committed by $AGENT_COMMITTER)."
  git rebase --force-rebase "${oldest}^"
fi

echo "After:"
git log --format='  %h author=%an committer=%cn %s' "$BASE_REF..HEAD"

# Nothing may escape, or it would escape the signature check too.
#
# The assertion is "no commit is still committed by the AGENT", not "every commit
# is committed by the bot". The stronger form is wrong and the tests caught it: a
# branch that was already rebased never had its contributors' commits rewritten,
# so they legitimately carry their own committers, and demanding otherwise fails
# every such run. Only the agent's identity is a problem, because only it is
# unverifiable.
strays=$(git log --format='%H %cn' "$BASE_REF..HEAD" | grep " $AGENT_COMMITTER$" || true)
if [ -n "$strays" ]; then
  echo "::error::These commits are still committed by '$AGENT_COMMITTER' and would be unverifiable:"
  echo "$strays"
  exit 1
fi
