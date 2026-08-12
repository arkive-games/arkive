#!/usr/bin/env bash
# The gate that protects the reason this workflow exists. HEAD is the pull request
# head when this runs, so it asserts every pinned SHA survives what we are about to
# land -- catching an entry stamped before a rebase rewrote it.
#
# Usage: ff-changelog-verify.sh [frontend-dir]   (default: frontend)
#
# Environment:
#   VERIFY_CMD  optional: the command to run instead of
#               `node scripts/changelog-verify.mjs`, for tests. It is run with the
#               frontend directory as its working directory, and is word-split on
#               purpose so a test can pass arguments. That is safe because it is a
#               test seam set by the caller, never anything a commenter can reach.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ff-common.sh"

dir="${1:-frontend}"

# changelog-verify.mjs imports only node builtins, so it needs a Node but no
# `pnpm install`.
log=$(cd "$dir" && ${VERIFY_CMD:-node scripts/changelog-verify.mjs} 2>&1) && ok=true || ok=false

if [ "$ok" != true ]; then
  {
    echo "Refusing: a \`changelog.json\` entry pins a commit this branch does not contain, so its compare link would 404 once landed."
    echo
    echo '```'
    echo "$log"
    echo '```'
  } > "$REFUSAL_FILE"
  echo "$log"
  refuse "changelog-verify failed for PR #${PR:-?}."
fi
echo "$log"
