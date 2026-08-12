# Tests for claude-gate.sh -- authorisation, verb selection, and the retry budget.
#
# The budget cases below encode a bug that reached production: the count was
# derived from the comments-list API, which lags its own writes, so a retry that
# was attempt 2 announced itself as attempt 1 and the chain would have run four
# times against a budget of three.

GATE="$SCRIPTS_DIR/claude-gate.sh"

gate() { # body, commenter, permission, comments-file-contents, [comment_id]
  local cf; cf="$(mktemp)"
  printf '%s' "${4:-}" > "$cf"
  GATE_OUT="$(BODY="$1" COMMENTER="$2" PERMISSION="$3" COMMENTS_FILE="$cf" \
              COMMENT_ID="${5:-9001}" BOT_LOGIN="arkive-review[bot]" MAX_ATTEMPTS=3 \
              bash "$GATE" 2>&1)"
  rm -f "$cf"
}
val() { printf '%s\n' "$GATE_OUT" | sed -n "s/^$1=//p" | head -1; }

# --- authorisation ------------------------------------------------------------
for p in admin write maintain; do
  gate '@claude' alice "$p"
  assert_eq "true" "$(val go)" "$p may trigger"
done
for p in read none ""; do
  gate '@claude' stranger "$p"
  assert_eq "false" "$(val go)" "'${p:-empty}' may not trigger"
done

# SECURITY: a stranger pasting the marker must not be authorised by it. The
# marker says which chain to continue; it never says who may ask.
gate '@claude <!-- claude-land-retry chain=5 attempt=1 -->' stranger none
assert_eq "false" "$(val go)" "a pasted retry marker does not authorise a stranger"
gate '@claude <!-- claude-land chain=5 -->' stranger read
assert_eq "false" "$(val go)" "a pasted land marker does not authorise a stranger"

# The bot is authorised by login -- but only with a marker, so its own
# /fast-forward comments cannot re-enter the workflow.
gate '@claude the fast-forward refused: ... <!-- claude-land-retry chain=77 attempt=1 -->' 'arkive-review[bot]' none
assert_eq "true" "$(val go)" "bot retry runs"
assert_eq "77" "$(val chain)" "chain comes from the marker, not the comment id"
gate '@claude something without a marker' 'arkive-review[bot]' none
assert_eq "false" "$(val go)" "bot comment without a marker is ignored"

# --- verb ----------------------------------------------------------------------
gate '@claude' alice admin;              assert_eq "review" "$(val verb)" "bare @claude reviews"
gate '@claude review' alice admin;       assert_eq "review" "$(val verb)" "@claude review reviews"
gate '@claude fix' alice admin;          assert_eq "fix"    "$(val verb)" "@claude fix fixes"
gate '@claude FIX the thing' alice admin; assert_eq "fix"   "$(val verb)" "verb is case-insensitive"
# Only the first line counts: prose mentioning "fix" must not silently upgrade
# a review request into permission to edit code.
gate "$(printf '@claude\nplease fix the toy links')" alice admin
assert_eq "review" "$(val verb)" "the word fix on a later line does not upgrade the verb"

# --- budget --------------------------------------------------------------------
gate '@claude' alice admin ''
assert_eq "1" "$(val attempt)" "a fresh human request is attempt 1"

gate '@claude <!-- x -->' alice admin '<!-- claude-land chain=9001 attempt=1 -->'
assert_eq "2" "$(val attempt)" "one prior marker means attempt 2"

# THE REGRESSION: the comments list lagged and returned nothing, but the marker
# carried by the triggering comment cannot lag.
gate '@claude ... <!-- claude-land-retry chain=42 attempt=1 -->' 'arkive-review[bot]' none ''
assert_eq "2" "$(val attempt)" "marker rescues a lagging comments list"

# ...and the converse: a marker pinned at 1 cannot reset a count that has moved on.
gate '@claude ... <!-- claude-land-retry chain=42 attempt=1 -->' 'arkive-review[bot]' none \
  "$(printf '<!-- claude-land chain=42 attempt=1 -->\n<!-- claude-land chain=42 attempt=2 -->\n')"
assert_eq "3" "$(val attempt)" "count overrides a marker pinned low"

# Markers for a DIFFERENT chain must not be counted.
gate '@claude' alice admin '<!-- claude-land chain=1234 attempt=2 -->' 9001
assert_eq "1" "$(val attempt)" "another chain's markers are not counted"

# The retry sentinel must not be counted as an attempt, or every refusal would
# spend two and halve the budget.
gate '@claude' alice admin '<!-- claude-land-retry chain=9001 attempt=1 -->' 9001
assert_eq "1" "$(val attempt)" "the retry sentinel is not itself an attempt"

# --- the cap --------------------------------------------------------------------
gate '@claude' alice admin "$(printf '<!-- claude-land chain=9001 -->\n%.0s' 1 2 3)"
assert_eq "false" "$(val go)" "a fourth attempt is refused"
assert_eq "true" "$(val exhausted)" "and says why, so the caller can post the notice"
