# Tests for claude-normalise.sh.
#
# The property that matters most is the one that is easy to lose: a changelog
# entry pins a commit SHA, so the commit it pins must come out of this UNCHANGED.
# An earlier version passed --force-rebase, which recreates everything and
# orphaned the very re-point the autosquash had just folded in.

NORM="$SCRIPTS_DIR/claude-normalise.sh"

# Builds: base <- feat (PINNED by the changelog) <- owner (holds the entry)
# then whatever the caller adds as the "agent".
setup_branch() {
  REPO="$(new_repo)"
  commit_file "$REPO" base.txt base "base"
  BASE="$(git -C "$REPO" rev-parse HEAD)"
  commit_file "$REPO" feat.txt one "feat: the PINNED commit"
  PINNED="$(git -C "$REPO" rev-parse HEAD)"
  commit_file "$REPO" changelog.json "pins $PINNED" "chore: holds the changelog entry"
  OWNER="$(git -C "$REPO" rev-parse HEAD)"
  BEFORE="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" config user.name "claude[bot]"
}
agent_done() { git -C "$REPO" config user.name "Arkive Review Bot"; }
run_norm() {
  NORM_OUT="$(cd "$REPO" && BOT_NAME="Arkive Review Bot" bash "$NORM" "$BASE" "$BEFORE" 2>&1)" \
    && NORM_STATUS=0 || NORM_STATUS=$?
}
subjects() { git -C "$REPO" log --format='%s' "$BASE..HEAD" | tr '\n' '|'; }
committers() { git -C "$REPO" log --format='%cn' "$BASE..HEAD" | sort -u | tr '\n' '|'; }
first_sha() { git -C "$REPO" rev-list --reverse "$BASE..HEAD" | head -1; }

# --- a fixup is folded, and the pinned commit survives ------------------------
setup_branch
printf 'pins REPOINTED\n' > "$REPO/changelog.json"
git -C "$REPO" add changelog.json
git -C "$REPO" commit -q --fixup="$OWNER"
agent_done; run_norm
assert_status 0 "$NORM_STATUS" "[fixup] succeeds"
assert_eq "$PINNED" "$(first_sha)" "[fixup] THE PINNED COMMIT KEEPS ITS SHA"
assert_not_contains "$(subjects)" "fixup!" "[fixup] no fixup! survives"
assert_eq "chore: holds the changelog entry|feat: the PINNED commit|" "$(subjects)" "[fixup] no extra commit is left behind"
assert_contains "$(cat "$REPO/changelog.json")" "REPOINTED" "[fixup] the amendment is in the tree"
assert_eq "Arkive Review Bot|Test User|" "$(committers)" "[fixup] the amended commit is now the bot's; the untouched one is not rewritten"

# --- no fixup: the fallback still normalises, without touching the pinned commit
setup_branch
commit_file "$REPO" fix.txt tip "fix: a plain agent commit"
agent_done; run_norm
assert_status 0 "$NORM_STATUS" "[no fixup] succeeds"
assert_eq "$PINNED" "$(first_sha)" "[no fixup] the pinned commit keeps its SHA"
assert_eq "Arkive Review Bot|Test User|" "$(committers)" "[no fixup] the agent commit was normalised"
assert_contains "$NORM_OUT" "oldest commit still committed by" "[no fixup] the fallback ran"

# --- the agent committed nothing ------------------------------------------------
setup_branch; agent_done; run_norm
assert_status 0 "$NORM_STATUS" "[nothing] succeeds"
assert_contains "$NORM_OUT" "committed nothing" "[nothing] says so"
assert_eq "$PINNED" "$(first_sha)" "[nothing] rewrites nothing at all"

# --- a fixup whose target is not on the branch must fail, not silently persist --
setup_branch
printf 'x\n' > "$REPO/changelog.json"; git -C "$REPO" add changelog.json
git -C "$REPO" commit -q -m "fixup! a commit that does not exist here"
agent_done; run_norm
assert_status 1 "$NORM_STATUS" "[orphan fixup] fails"
assert_contains "$NORM_OUT" "survived the autosquash" "[orphan fixup] explains itself"

# --- several agent commits, mixed ------------------------------------------------
setup_branch
commit_file "$REPO" a.txt a "fix: first agent change"
printf 'pins REPOINTED2\n' > "$REPO/changelog.json"; git -C "$REPO" add changelog.json
git -C "$REPO" commit -q --fixup="$OWNER"
commit_file "$REPO" b.txt b "fix: second agent change"
agent_done; run_norm
assert_status 0 "$NORM_STATUS" "[mixed] succeeds"
assert_eq "$PINNED" "$(first_sha)" "[mixed] the pinned commit keeps its SHA"
assert_not_contains "$(subjects)" "fixup!" "[mixed] fixup folded"
assert_eq "Arkive Review Bot|Test User|" "$(committers)" "[mixed] every agent commit normalised"
assert_contains "$(cat "$REPO/changelog.json")" "REPOINTED2" "[mixed] the amendment landed in the owning commit"
