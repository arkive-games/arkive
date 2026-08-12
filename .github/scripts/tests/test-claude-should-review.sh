# Tests for claude-should-review.sh -- the ~$4-per-run decision.

SR="$SCRIPTS_DIR/claude-should-review.sh"

sr() { # delta, comments-file-contents
  local cf; cf="$(mktemp)"
  printf '%s' "${2:-}" > "$cf"
  SR_OUT="$(DELTA="$1" COMMENTS_FILE="$cf" bash "$SR" 2>&1)"
  rm -f "$cf"
}
v() { printf '%s\n' "$SR_OUT" | sed -n "s/^$1=//p" | head -1; }

marker() { printf '<!-- claude-reviewed delta=%s verdict=%s -->' "$1" "$2"; }

# --- nothing to reuse ----------------------------------------------------------
sr abc1234 ''
assert_eq "false" "$(v skip)" "no previous review means review"

# --- the case that cost \$4: identical contribution, already judged ------------
sr abc1234 "$(marker abc1234 HOLD)"
assert_eq "true" "$(v skip)" "unchanged contribution is not re-reviewed"
assert_eq "HOLD" "$(v previous_verdict)" "and the previous verdict is carried forward"

sr abc1234 "$(marker abc1234 LAND)"
assert_eq "true" "$(v skip)" "unchanged LAND is reusable too"
assert_eq "LAND" "$(v previous_verdict)" "carries LAND"

# --- the change moved ----------------------------------------------------------
sr def5678 "$(marker abc1234 LAND)"
assert_eq "false" "$(v skip)" "a changed contribution is reviewed again"
assert_eq "LAND" "$(v previous_verdict)" "previous verdict still reported, for context"

# --- several reviews: the LAST one describes the current state -----------------
sr def5678 "$(printf '%s\n%s\n' "$(marker abc1234 HOLD)" "$(marker def5678 LAND)")"
assert_eq "true" "$(v skip)" "the newest marker wins"
assert_eq "LAND" "$(v previous_verdict)" "and its verdict is the one reused"

sr abc1234 "$(printf '%s\n%s\n' "$(marker abc1234 LAND)" "$(marker def5678 HOLD)")"
assert_eq "false" "$(v skip)" "an older matching marker does not authorise a skip"

# --- fail open -------------------------------------------------------------------
# Anything unreadable must cost a review, never skip one: paying twice wastes
# money, skipping wrongly puts an unreviewed defect on master.
sr abc1234 'claude-reviewed delta= verdict='
assert_eq "false" "$(v skip)" "a malformed marker falls back to reviewing"
sr abc1234 'some unrelated bot comment about delta=abc1234'
assert_eq "false" "$(v skip)" "a delta mentioned in prose is not a marker"
sr abc1234 "$(marker abc1234 MAYBE)"
assert_eq "false" "$(v skip)" "an unrecognised verdict falls back to reviewing"
