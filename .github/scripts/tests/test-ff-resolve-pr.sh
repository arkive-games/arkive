# ff-resolve-pr.sh -- the two states that make a fast-forward meaningless.

ffpr_dir="$(mktemp -d)"
ffpr_stub="$ffpr_dir/pr-query.sh"
ffpr_refusal="$ffpr_dir/refusal.md"
ffpr_out_file="$ffpr_dir/output"

cat > "$ffpr_stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
cat "$FFPR_ANSWER"
STUB
chmod +x "$ffpr_stub"

# ffpr_run <state> <base> <head-oid> <head-ref> <is-fork>
ffpr_run() {
  printf '%s\n%s\n%s\n%s\n%s\n' "$1" "$2" "$3" "$4" "$5" > "$ffpr_dir/answer"
  rm -f "$ffpr_refusal"
  : > "$ffpr_out_file"
  ffpr_stdout=$(
    PR=17 REPO="arkive-games/arkive" \
    PR_QUERY_CMD="$ffpr_stub" FFPR_ANSWER="$ffpr_dir/answer" \
    REFUSAL_FILE="$ffpr_refusal" GITHUB_OUTPUT="$ffpr_out_file" \
    "$SCRIPTS_DIR/ff-resolve-pr.sh" 2>&1
  )
  ffpr_rc=$?
  ffpr_reason=$(cat "$ffpr_refusal" 2>/dev/null || true)
  ffpr_outputs=$(cat "$ffpr_out_file")
}

ffpr_run OPEN master 1234abcd worktree-thing false
assert_status 0 "$ffpr_rc" "an open pull request against master resolves"
assert_eq "head=1234abcd
head_ref=worktree-thing
fork=false" "$ffpr_outputs" "and hands on the head, the branch and the fork flag"
assert_eq "" "$ffpr_reason" "with no refusal"

# The fork flag decides whether the branch is deleted afterwards, so it has to
# survive as written rather than being normalised to a shell truth value.
ffpr_run OPEN master 1234abcd patch-1 true
assert_contains "$ffpr_outputs" "fork=true" "a fork pull request is reported as one"

ffpr_run MERGED master 1234abcd worktree-thing false
assert_status 1 "$ffpr_rc" "an already-merged pull request is refused"
assert_contains "$ffpr_reason" "This pull request is MERGED" "the reason names the state"
assert_contains "$ffpr_stdout" "::error::PR #17 is MERGED." "and so does the run log"

ffpr_run CLOSED master 1234abcd worktree-thing false
assert_status 1 "$ffpr_rc" "a closed pull request is refused"
assert_contains "$ffpr_reason" "This pull request is CLOSED" "with its own state named"

ffpr_run OPEN develop 1234abcd worktree-thing false
assert_status 1 "$ffpr_rc" "a pull request against another branch is refused"
assert_contains "$ffpr_reason" "targets \`develop\`, not \`master\`" "the reason names both branches"
assert_contains "$ffpr_stdout" "::error::PR #17 targets develop." "and so does the run log"
assert_eq "" "$ffpr_outputs" "a refused pull request hands on nothing"

rm -rf "$ffpr_dir"
