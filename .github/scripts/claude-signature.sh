#!/usr/bin/env bash
# Checks that everything THIS RUN committed is signed, before it is pushed.
#
# Reads `%H<TAB>%G?<TAB>%cn` lines on stdin -- the caller supplies them with
# `git log --format='%H%x09%G?%x09%cn' <base>..HEAD`. Prints offenders and exits 1
# if any; exits 0 otherwise. Taking the log on stdin rather than running it keeps
# the selection rule assertable without a signing key.
#
# Usage:  git log --format='%H%x09%G?%x09%cn' base..HEAD | claude-signature.sh "<bot name>"
#
# TWO BUGS LIVE HERE, BOTH SHIPPED
#
# The first version checked EVERY commit ahead of the base. But `%G?` can only
# verify signatures whose key is in the local allowed-signers file, and the runner
# writes exactly one key into it -- the bot's. So every contributor commit read as
# `E` (cannot check) even when GitHub reported verified=true, which it did for all
# three commits of the first real run. It only failed harmlessly because that run
# had conflicted and had nothing to push; on the ordinary path -- a branch already
# rebased, keeping its authors' own signatures -- every such branch would have
# been blocked here and never reached /fast-forward. The commonest case was the
# broken one.
#
# The second version scoped it by committer EMAIL, which is still wrong, for a
# reason that only appears once the bot runs on the owner's own pull request: the
# bot COMMITS UNDER THE OWNER'S EMAIL. It must, because GitHub marks a commit
# verified only when the committer address is one the signing key's account has
# verified. So the email identifies the human just as well as the bot, and
# matching on it re-selects every commit the owner ever made.
#
# The NAME is the one field unique to the bot. Everyone else's signatures are
# GitHub's to verify, and fast-forward.yml already asks it about every commit
# through the API.

set -euo pipefail

BOT_NAME="${1:?usage: claude-signature.sh <bot committer name>}"

# `G` good, `U` good-but-untrusted -- both are signatures GitHub can check.
# Anything else (N none, E cannot-check, B bad, X/Y/R expired or revoked) is not.
bad=$(awk -F'\t' -v n="$BOT_NAME" '$3 == n && $2 != "G" && $2 != "U" { print $1 " " $2 }' || true)

mine_count=$(printf '%s' "${bad}" | grep -c . || true)
if [ "${mine_count:-0}" -gt 0 ]; then
  echo "::error::Commits this run created are unsigned, and fast-forward.yml would refuse them:"
  printf '%s\n' "$bad"
  echo "Check BOT_SSH_SIGNING_KEY, and that rebase.gpgSign is set -- commit.gpgsign alone does not cover a rebase."
  exit 1
fi

echo "Every commit committed by '$BOT_NAME' carries a usable signature."
