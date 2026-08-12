#!/usr/bin/env bash
# Shared helpers for the ff-*.sh gate scripts of fast-forward.yml. Sourced, not run.
#
# Why the gate lives in scripts at all: anything inside a workflow `run:` block is
# untestable by construction. Four of the five defects the review bot shipped with
# were shell bugs of exactly that kind -- no YAML parse, eslint or type check can
# see inside a shell heredoc, so each was found only by running the bot in
# production and reading the logs. The logic therefore lives here, where
# .github/scripts/tests/run.sh can call it with arguments and assert on it, and
# fast-forward.yml is left as plumbing: checkout, env, call, post the comment.
#
# Conventions every ff-*.sh follows:
#
#   A refusal writes its markdown to $REFUSAL_FILE and then calls `refuse` with a
#   one-line reason for the run log. The default is $RUNNER_TEMP/refusal.md, which
#   is the file the workflow's last step posts. NOT the workspace: actions/checkout
#   cleans that, which would delete a reason written before it.
#
#   Nothing requires $GITHUB_OUTPUT or $RUNNER_TEMP to exist. A caller that sets
#   neither still gets the decision on stdout and in the exit status, which is what
#   makes the scripts drivable from a test.
#
#   Attacker-controlled values (a comment body) arrive through the environment or
#   argv and are never interpolated into a shell string.
#
# Do NOT source this from a test file: run.sh sources tests into its own shell, and
# the `set -e` below would abort the whole run on the first failing command. Tests
# invoke the scripts as subprocesses instead.
set -euo pipefail

# Always a real path, so `> "$REFUSAL_FILE"` cannot break on an unset variable.
REFUSAL_FILE="${REFUSAL_FILE:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/refusal.md}"

# refuse <one-line reason for the run log>
# Call after writing the markdown reason to $REFUSAL_FILE. Echoes it so the run log
# carries the same text the pull request comment will, then fails the step.
refuse() {
  if [ -s "$REFUSAL_FILE" ]; then
    echo "--- refusal ($REFUSAL_FILE) ---"
    cat "$REFUSAL_FILE"
    echo "--- end refusal ---"
  fi
  echo "::error::$1"
  exit 1
}

# emit <key> <value>
# A step output when $GITHUB_OUTPUT exists, a log line always. Each key is written
# exactly once per run: two writes of the same key leave which one wins up to the
# reader, which is not something an authorisation gate should rest on.
emit() {
  echo "$1=$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}
