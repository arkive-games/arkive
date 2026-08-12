#!/usr/bin/env bash
# THE precondition, plus the one that keeps master linear.
#
# If master is not already an ancestor of the head then a fast-forward is
# impossible, and the fix belongs to whoever owns the branch. This workflow
# deliberately CANNOT rebase for you: rebasing here would rewrite the very commits
# it exists to preserve -- every changelog.json entry pins a full 40-char SHA -- and
# the runner has no signing key to re-sign them with. "Already rebased" is the
# precondition, not something we fix.
#
# Fast-forwarding a branch that contains a merge would put a bubble in master,
# which is the thing the merge button does and we do not want.
#
# Usage: ff-branch-state.sh <repo-dir> <base-ref> <head-ref>
#   The caller resolves the base itself. In the workflow that is FETCH_HEAD after
#   `git fetch origin master`, and not origin/master, because that fetch updates no
#   remote-tracking ref and the checkout fetched only refs/pull/N/head.
#
# Environment: PR (optional) only decorates the run-log line.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

repo="${1:?usage: ff-branch-state.sh <repo-dir> <base-ref> <head-ref>}"
base_ref="${2:?usage: ff-branch-state.sh <repo-dir> <base-ref> <head-ref>}"
head_ref="${3:?usage: ff-branch-state.sh <repo-dir> <base-ref> <head-ref>}"
PR="${PR:-?}"

base=$(git -C "$repo" rev-parse "$base_ref")
head=$(git -C "$repo" rev-parse "$head_ref")
echo "master is $base, head is $head"

if ! git -C "$repo" merge-base --is-ancestor "$base" "$head"; then
  behind=$(git -C "$repo" rev-list --count "$head..$base")
  {
    echo "Refusing: this branch is not rebased on \`master\` (it is missing $behind commit(s) from it), so it cannot be fast-forwarded."
    echo
    echo "Rebase it, re-stamp any \`changelog.json\` entry whose commit the rebase rewrote (\`pnpm changelog:verify\` finds them), force-push with \`--force-with-lease\`, then comment \`/fast-forward\` again."
  } > "$REFUSAL_FILE"
  refuse "PR #$PR is $behind commit(s) behind master. Rebase and re-request."
fi

if [ -n "$(git -C "$repo" rev-list --merges "$base..$head")" ]; then
  {
    echo "Refusing: this branch contains merge commit(s), so landing it would put a bubble in \`master\`."
    echo
    echo "Rebase onto \`master\` instead of merging it in, then comment \`/fast-forward\` again."
  } > "$REFUSAL_FILE"
  refuse "PR #$PR contains merge commits."
fi

echo "Branch is rebased on master and contains no merge commits."
