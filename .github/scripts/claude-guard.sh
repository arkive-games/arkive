#!/usr/bin/env bash
# Decides whether the files an agent run changed are allowed under its verb.
#
# Reads the changed paths on stdin, one per line. Prints a human-readable refusal
# to stdout and exits 1 when the run must be blocked; prints a one-line summary
# and exits 0 when it may proceed.
#
# Usage:  printf '%s\n' path... | claude-guard.sh <verb>
#
# WHY THIS IS A SCRIPT AND NOT A `run:` BLOCK
#
# The first version of this rule lived in the workflow and was INERT for its
# entire life. It identified the agent's commits by author email, but
# claude-code-action commits as `claude[bot]`, never the configured identity, so
# the filter matched nothing, the guard printed "the agent authored no file
# changes" and passed every single run. It was found by accident, while looking
# into an unrelated signature question, and for that whole period the only thing
# preventing the bot from editing .github/workflows/ was the App's withheld
# Workflows permission.
#
# The caller now derives the path list by diffing the pre-agent TREE against HEAD,
# which no identity can fool and which survives the rebase that rewrites every
# commit on the branch. This script takes that list and nothing else, so the rule
# it enforces can be asserted directly. See tests/test-claude-guard.sh.

set -euo pipefail

VERB="${1:?usage: claude-guard.sh <verb>}"

# Files that decide what CI runs, what an agent is instructed to do, and what
# hooks execute -- the machinery that reviews and lands code. The bot may not
# edit the rules it is judged by, under ANY verb: `@claude fix` is consent to
# change the code under review, not the pipeline reviewing it. Without that
# separation the two are one permission, because a fix commit could rewrite
# claude.yml and ride to master on the bot's own approval.
#
# .claude/ is the sharpest of these and looks the most harmless: hooks configured
# there RUN COMMANDS, so a settings change landing on master is remote code
# execution on every later checkout.
#
# `(^|/)` and not `^`, because these files nest: apm compile GENERATES
# tools/CLAUDE.md, and .claude/ and .apm/ are both honoured in subdirectories. An
# anchored pattern would protect the root copy and wave the rest through, which
# is worse than no rule because it reads as covered.
PROTECTED_RE='(^|/)(\.github|\.claude|\.apm)/|(^|/)(CLAUDE|AGENTS)\.md$|(^|/)apm\.ya?ml$'

# The only path the `review` verb may touch: re-pointing a changelog entry whose
# commit a rebase rewrote is mechanical, not a judgement call.
REVIEW_ALLOWED_RE='/changelog\.json$'

touched="$(grep -v '^[[:space:]]*$' || true)"

if [ -z "$touched" ]; then
  echo "The agent changed no files."
  exit 0
fi

protected="$(printf '%s\n' "$touched" | grep -E "$PROTECTED_RE" || true)"
if [ -n "$protected" ]; then
  cat <<EOF
**This run was blocked.** The agent changed files it is never allowed to change, so nothing was pushed:

$(printf '%s\n' "$protected" | sed 's/^/- \`/; s/$/\`/')

Workflows, agent instructions and \`.claude/\` configuration are the machinery that reviews and lands code, so the bot cannot edit them under any verb. Make this change yourself.
EOF
  exit 1
fi

if [ "$VERB" = "fix" ]; then
  echo "Verb is 'fix'; changes outside the protected paths are authorised."
  exit 0
fi

bad="$(printf '%s\n' "$touched" | grep -v -E "$REVIEW_ALLOWED_RE" || true)"
if [ -n "$bad" ]; then
  cat <<EOF
**This run was blocked.** \`@claude\` reviews but does not edit code, and the agent changed:

$(printf '%s\n' "$bad" | sed 's/^/- \`/; s/$/\`/')

Nothing was pushed. Reply \`@claude fix\` if you want these implemented.
EOF
  exit 1
fi

echo "Only changelog.json was changed. Verb policy satisfied."
