# ff-branch-state.sh -- is the branch already rebased, and is it free of merges.
#
# Real repositories, built with the runner's new_repo/commit_file: the checks are
# `git merge-base --is-ancestor` and `git rev-list --merges`, and a fake would only
# test the fake.

ffbs_dir="$(mktemp -d)"
ffbs_refusal="$ffbs_dir/refusal.md"

# ffbs_run <repo> <base-ref> <head-ref>
ffbs_run() {
  rm -f "$ffbs_refusal"
  ffbs_stdout=$(
    REFUSAL_FILE="$ffbs_refusal" PR=99 \
    "$SCRIPTS_DIR/ff-branch-state.sh" "$1" "$2" "$3" 2>&1
  )
  ffbs_rc=$?
  ffbs_reason=$(cat "$ffbs_refusal" 2>/dev/null || true)
}

# --- ahead of master: the case that lands -------------------------------------

ffbs_ahead="$(new_repo)"
commit_file "$ffbs_ahead" a.txt one "first"
git -C "$ffbs_ahead" checkout -q -b feature
commit_file "$ffbs_ahead" b.txt two "second"
commit_file "$ffbs_ahead" c.txt three "third"

ffbs_run "$ffbs_ahead" main feature
assert_status 0 "$ffbs_rc" "a branch ahead of master passes"
assert_contains "$ffbs_stdout" "no merge commits" "and says so"
assert_eq "" "$ffbs_reason" "and writes no refusal"

# --- equal to master: nothing to land, but nothing to refuse either ------------

ffbs_run "$ffbs_ahead" feature feature
assert_status 0 "$ffbs_rc" "a branch equal to master passes"

# --- behind master: the refusal this workflow exists to give -------------------

ffbs_behind="$(new_repo)"
commit_file "$ffbs_behind" a.txt one "first"
git -C "$ffbs_behind" checkout -q -b feature
commit_file "$ffbs_behind" b.txt two "the branch's own work"
git -C "$ffbs_behind" checkout -q main
commit_file "$ffbs_behind" c.txt three "landed while the branch waited"
commit_file "$ffbs_behind" d.txt four "and another"

ffbs_run "$ffbs_behind" main feature
assert_status 1 "$ffbs_rc" "a branch behind master is refused"
assert_contains "$ffbs_reason" "not rebased on \`master\`" "the reason names the cause"
assert_contains "$ffbs_reason" "missing 2 commit(s)" "and counts how far behind it is"
assert_contains "$ffbs_reason" "force-push with \`--force-with-lease\`" "and says what to do"
assert_contains "$ffbs_stdout" "::error::PR #99 is 2 commit(s) behind master." "the run log carries the count too"

# --- a merge commit: refused even though it IS fast-forwardable ----------------
# master is an ancestor here, so git would take the push. It is refused anyway,
# because landing it would put a bubble in the history we keep linear.

ffbs_merge="$(new_repo)"
commit_file "$ffbs_merge" a.txt one "first"
ffbs_base=$(git -C "$ffbs_merge" rev-parse main)
git -C "$ffbs_merge" checkout -q -b side
commit_file "$ffbs_merge" side.txt s "side work"
git -C "$ffbs_merge" checkout -q -b feature "$ffbs_base"
commit_file "$ffbs_merge" feat.txt f "branch work"
git -C "$ffbs_merge" merge -q --no-ff --no-edit -m "Merge side into feature" side

ffbs_run "$ffbs_merge" "$ffbs_base" feature
assert_status 1 "$ffbs_rc" "a branch containing a merge is refused"
assert_contains "$ffbs_reason" "contains merge commit(s)" "the reason names the merge"
assert_contains "$ffbs_reason" "bubble in \`master\`" "and why that matters"
assert_contains "$ffbs_stdout" "::error::PR #99 contains merge commits." "the run log agrees"

# The same branch with its merge left out of the range is fine, which proves the
# check looks at base..head rather than at the whole history.
ffbs_run "$ffbs_merge" feature feature
assert_status 0 "$ffbs_rc" "the merge is only counted inside base..head"

rm -rf "$ffbs_dir" "$ffbs_ahead" "$ffbs_behind" "$ffbs_merge"
