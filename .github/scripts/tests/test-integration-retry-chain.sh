# The contract BETWEEN the two workflows: fast-forward.yml writes a retry marker,
# claude.yml parses it. Neither side's own tests can see this seam, and that is
# exactly where it broke.
#
# fast-forward.yml wrote `<!-- claude-land-retry chain=N -->` while
# claude-gate.sh parsed `attempt=` out of it. The field was never emitted, so
# `prev_attempt` was always empty, `from_marker` was always 1, and the whole
# defence against the comments-list API undercounting was dead code from the day
# it was written. Both halves passed their own tests throughout.
#
# So this file asserts the round trip, end to end, in both directions.

BODY_SH="$SCRIPTS_DIR/ff-comment-body.sh"
GATE_SH="$SCRIPTS_DIR/claude-gate.sh"
BOT="arkive-review[bot]"

# Produce a refusal exactly as fast-forward.yml would, then feed the resulting
# comment straight into the gate exactly as claude.yml would.
round_trip() { # chain, attempt, comments-file-contents
  local body refusal cf
  body="$(mktemp)"; refusal="$(mktemp)"; cf="$(mktemp)"
  printf 'Refusing: [CI](x) is still `queued` for `abc`.\n' > "$refusal"
  printf '%s' "${3:-}" > "$cf"

  RETRY="$(PUSHED=failure HEAD_SHA=abc CHAIN="$1" ATTEMPT="$2" RUN_URL=http://run \
           REFUSAL_FILE="$refusal" bash "$BODY_SH" "$body")"
  MARKER_BODY="$(cat "$body")"

  GATE_OUT="$(BODY="$MARKER_BODY" COMMENTER="$BOT" PERMISSION=none \
              COMMENTS_FILE="$cf" COMMENT_ID=1 BOT_LOGIN="$BOT" MAX_ATTEMPTS=3 \
              bash "$GATE_SH" 2>&1)"
  rm -f "$body" "$refusal" "$cf"
}
g() { printf '%s\n' "$GATE_OUT" | sed -n "s/^$1=//p" | head -1; }

# --- the round trip ------------------------------------------------------------
round_trip 4242 1
assert_eq "true" "$RETRY" "a bot-initiated refusal asks to be posted with the PAT"
assert_contains "$MARKER_BODY" "@claude" "the refusal addresses the bot"
assert_eq "@claude" "$(printf '%s' "$MARKER_BODY" | head -c 7)" "and does so FIRST, or claude.yml will not trigger"
assert_contains "$MARKER_BODY" "attempt=1" "THE REGRESSION: the marker carries the attempt"
assert_eq "true" "$(g go)" "the gate accepts it"
assert_eq "4242" "$(g chain)" "the chain survives the round trip"
assert_eq "2" "$(g attempt)" "attempt 1 refused becomes attempt 2 -- no off-by-one in either direction"

# The marker must carry the attempt it REFUSED, not that plus one: the gate adds
# the one. Writing N+1 on this side would burn an extra attempt per refusal and
# quietly cut the budget from three to two.
round_trip 4242 2
assert_eq "3" "$(g attempt)" "attempt 2 refused becomes attempt 3"
round_trip 4242 3
assert_eq "false" "$(g go)" "attempt 3 refused exhausts a budget of 3"
assert_eq "true" "$(g exhausted)" "and reports it, so the caller can say so"

# --- the marker must survive a lagging comments list ---------------------------
# This is the entire reason the field exists. The list returns nothing; the marker
# alone must still advance the count.
round_trip 4242 2 ''
assert_eq "3" "$(g attempt)" "with an empty comments list the marker still advances the attempt"

# --- and the count must still override a marker pinned low ---------------------
round_trip 4242 1 "$(printf '<!-- claude-land chain=4242 attempt=1 -->\n<!-- claude-land chain=4242 attempt=2 -->\n')"
assert_eq "3" "$(g attempt)" "two counted markers beat a marker claiming attempt 1"

# --- a human-initiated refusal must NOT wake the bot ---------------------------
body="$(mktemp)"; refusal="$(mktemp)"
printf 'Refusing: not rebased.\n' > "$refusal"
RETRY="$(PUSHED=failure CHAIN="" ATTEMPT="" RUN_URL=http://run REFUSAL_FILE="$refusal" \
         bash "$BODY_SH" "$body")"
HUMAN_BODY="$(cat "$body")"
assert_eq "false" "$RETRY" "a human's refusal is not posted with the PAT"
assert_not_contains "$HUMAN_BODY" "claude-land-retry" "and carries no retry marker"
assert_not_contains "$HUMAN_BODY" "@claude" "and does not address the bot"
rm -f "$body" "$refusal"

# --- an unparsable attempt must fall back cleanly, not match-and-read-nothing ---
round_trip 4242 ""
assert_not_contains "$MARKER_BODY" "attempt=" "an absent attempt is omitted, not written empty"
assert_eq "true" "$(g go)" "the gate still accepts the marker"
assert_eq "1" "$(g attempt)" "and falls back to counting rather than parsing a blank"
