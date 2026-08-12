#!/usr/bin/env bash
# Runs every test-*.sh beside this file.
#
# Why this exists: four of the five defects the review bot shipped with were
# shell-logic bugs inside workflow `run:` blocks -- a filter that made the
# protected-path guard match nothing and pass every run, `%G?` rejecting keys it
# could not see, two writes of the same $GITHUB_OUTPUT key, and a rebase flag that
# orphaned the changelog SHAs it had just re-pointed. None was catchable by YAML
# parsing, by eslint, or by any check in this repository; each was found by
# running the bot in production and reading the logs.
#
# So the logic lives in .github/scripts/*.sh, where it can be called with
# arguments and asserted against. Anything embedded in a workflow is by
# construction untestable, which is the reason to keep workflows to plumbing.
#
# No bats, no npm dependency: a runner is thirty lines and the alternative is a
# toolchain to install on every job.
#
# Usage:  .github/scripts/tests/run.sh [name-fragment]
# Add a test by dropping in `test-<thing>.sh`; the glob picks it up, so nothing
# here needs editing and two people can add tests without conflicting.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPTS_DIR="$(cd "$HERE/.." && pwd)"
FILTER="${1:-}"

PASS=0
FAIL=0
FAILED_TESTS=()

# --- assertions, available to every test file -------------------------------

assert_eq() { # want, got, label
  if [ "$1" = "$2" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS+=("$CURRENT_FILE :: ${3:-assert_eq}")
    printf '    FAIL %s\n      want: %q\n      got:  %q\n' "${3:-assert_eq}" "$1" "$2"
  fi
}

assert_contains() { # haystack, needle, label
  case "$1" in
    *"$2"*) PASS=$((PASS + 1)) ;;
    *)
      FAIL=$((FAIL + 1)); FAILED_TESTS+=("$CURRENT_FILE :: ${3:-assert_contains}")
      printf '    FAIL %s\n      expected to contain: %q\n      in: %q\n' "${3:-assert_contains}" "$2" "$1"
      ;;
  esac
}

assert_not_contains() { # haystack, needle, label
  case "$1" in
    *"$2"*)
      FAIL=$((FAIL + 1)); FAILED_TESTS+=("$CURRENT_FILE :: ${3:-assert_not_contains}")
      printf '    FAIL %s\n      expected NOT to contain: %q\n      in: %q\n' "${3:-assert_not_contains}" "$2" "$1"
      ;;
    *) PASS=$((PASS + 1)) ;;
  esac
}

assert_status() { # want-exit-code, got-exit-code, label
  assert_eq "$1" "$2" "${3:-exit status}"
}

# A throwaway git repo with deterministic identity and no signing, so tests never
# depend on the developer's gitconfig or on a key being present.
new_repo() {
  local d
  d="$(mktemp -d)"
  git -C "$d" init -q -b main
  git -C "$d" config user.name "Test User"
  git -C "$d" config user.email "test@example.com"
  git -C "$d" config commit.gpgsign false
  git -C "$d" config gpg.format openpgp
  printf '%s' "$d"
}

commit_file() { # repo, path, content, message
  mkdir -p "$(dirname "$1/$2")"
  printf '%s\n' "$3" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit -q -m "$4"
}

# --- run ---------------------------------------------------------------------

echo "Running workflow-script tests from $SCRIPTS_DIR"
shopt -s nullglob
for f in "$HERE"/test-*.sh; do
  name="$(basename "$f")"
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then continue; fi
  CURRENT_FILE="$name"
  echo "  $name"
  # shellcheck disable=SC1090
  source "$f"
done

echo
echo "passed: $PASS   failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf 'failing assertions:\n'
  printf '  %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
if [ "$PASS" -eq 0 ]; then
  echo "::error::No assertions ran. A test glob that matches nothing must not read as success."
  exit 1
fi
