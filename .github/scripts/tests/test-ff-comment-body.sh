# ff-comment-body.sh -- the comment posted back, and whether it must wake the bot.
#
# The two properties that matter are structural rather than editorial: a
# bot-directed refusal has to begin with `@claude` (claude.yml's trigger requires
# it to be the first thing in the body) and has to carry a retry marker that is NOT
# the sentinel the far side counts.

ffcb_dir="$(mktemp -d)"
ffcb_refusal="$ffcb_dir/refusal.md"
ffcb_body="$ffcb_dir/body.md"

# ffcb_run <pushed> <chain> <attempt>
ffcb_run() {
  rm -f "$ffcb_body"
  ffcb_retry=$(
    PUSHED="$1" CHAIN="$2" ATTEMPT="$3" \
    HEAD_SHA=deadbeef RUN_URL="https://runs/7" \
    REFUSAL_FILE="$ffcb_refusal" \
    "$SCRIPTS_DIR/ff-comment-body.sh" "$ffcb_body" 2>&1
  )
  ffcb_rc=$?
  ffcb_text=$(cat "$ffcb_body" 2>/dev/null || true)
  ffcb_first=$(head -1 "$ffcb_body" 2>/dev/null || true)
}

ffcb_reason() { printf '%s\n' "$1" > "$ffcb_refusal"; }

# --- landed -------------------------------------------------------------------

rm -f "$ffcb_refusal"
ffcb_run success "" ""
assert_status 0 "$ffcb_rc" "the success body builds"
assert_eq false "$ffcb_retry" "a landed pull request needs no retry"
assert_contains "$ffcb_text" "Fast-forwarded \`master\` to \`deadbeef\`" "it says what happened"
assert_contains "$ffcb_text" "<sub>[fast-forward run](https://runs/7)</sub>" "and links the run"
assert_not_contains "$ffcb_text" "claude-land" "and carries no marker"

# A landed pull request that the BOT asked for is still not a retry: the chain
# ends when master moves.
ffcb_reason "Refusing: something."
ffcb_run success 12 2
assert_eq false "$ffcb_retry" "a success is never a retry, even on a bot chain"
assert_not_contains "$ffcb_text" "claude-land-retry" "and carries no retry marker"
assert_not_contains "$ffcb_text" "Refusing" "and does not read out a stale refusal"

# --- refused, human-initiated -------------------------------------------------

ffcb_reason "Refusing: this branch is not rebased on \`master\`."
ffcb_run failure "" ""
assert_status 0 "$ffcb_rc" "the human refusal body builds"
assert_eq false "$ffcb_retry" "a human refusal wakes nobody"
assert_contains "$ffcb_text" "not rebased on \`master\`" "it carries the reason"
assert_not_contains "$ffcb_text" "@claude" "and is addressed to nobody"
assert_not_contains "$ffcb_text" "claude-land-retry" "and carries no retry marker"

# --- refused, bot-initiated ---------------------------------------------------

ffcb_reason "Refusing: this branch contains merge commit(s)."
ffcb_run failure 4242 2
assert_eq true "$ffcb_retry" "a bot refusal must be posted with the PAT"
assert_eq "@claude the fast-forward refused this attempt:" "$ffcb_first" "and must START with @claude, which is claude.yml's trigger"
assert_contains "$ffcb_text" "contains merge commit(s)" "it carries the reason"
assert_contains "$ffcb_text" "<!-- claude-land-retry chain=4242 attempt=2 -->" "and the retry marker with the attempt it refused"
# The counted sentinel is `claude-land chain=`; reusing it here would make every
# refusal spend a second attempt out of the chain's budget.
assert_not_contains "$ffcb_text" "<!-- claude-land chain=" "and NOT the counted sentinel"

# A marker the requester step could not read an attempt out of yields a marker
# without the field, rather than a dangling `attempt=` the far side would match
# and read nothing out of.
ffcb_reason "Refusing: CI concluded \`failure\`."
ffcb_run failure 4242 ""
assert_eq true "$ffcb_retry" "still a retry with no attempt parsed"
assert_contains "$ffcb_text" "<!-- claude-land-retry chain=4242 -->" "the marker omits the attempt entirely"
assert_not_contains "$ffcb_text" "attempt=" "leaving nothing empty for the far side to parse"

# --- the marker as the OTHER workflow reads it --------------------------------
# claude.yml pulls the attempt back out of the retry marker with this expression
# and adds one to it. A marker it cannot parse is not a cosmetic problem: it drops
# that side back onto counting `claude-land chain=` comments through the list API,
# which is the undercount the marker exists to defeat. So assert the round trip
# rather than the string.
#
# The sed is inlined rather than read out of claude.yml on purpose: this asserts
# the contract, and a test that reads the other file would only ever agree with
# whatever it currently says.
ffcb_parse_attempt() { # body text
  printf '%s' "$1" | sed -n 's/.*claude-land-retry chain=[0-9]\{1,\} attempt=\([0-9]\{1,\}\).*/\1/p' | head -1
}
ffcb_parse_chain() { # body text
  printf '%s' "$1" | sed -n 's/.*claude-land-retry chain=\([0-9]\{1,\}\).*/\1/p' | head -1
}

ffcb_reason "Refusing: CI concluded \`failure\`."
ffcb_run failure 4242 2
assert_eq 4242 "$(ffcb_parse_chain "$ffcb_text")" "claude.yml can read the chain back out"
assert_eq 2 "$(ffcb_parse_attempt "$ffcb_text")" "and the attempt, which it increments to 3"

# The whole chain, end to end: the bot's own marker goes into ff-requester.sh and
# the refusal that comes back out has to name the same chain and attempt.
ffcb_req_out="$ffcb_dir/requester-output"
: > "$ffcb_req_out"
REQUESTER='arkive-bot[bot]' BOT_LOGIN='arkive-bot[bot]' \
  BODY='/fast-forward
<!-- claude-land chain=808 attempt=2 -->' \
  REPO="arkive-games/arkive" GITHUB_OUTPUT="$ffcb_req_out" \
  "$SCRIPTS_DIR/ff-requester.sh" > /dev/null 2>&1
ffcb_chain=$(sed -n 's/^chain=//p' "$ffcb_req_out")
ffcb_attempt=$(sed -n 's/^attempt=//p' "$ffcb_req_out")
ffcb_reason "Refusing: this branch is not rebased on \`master\`."
ffcb_run failure "$ffcb_chain" "$ffcb_attempt"
assert_eq true "$ffcb_retry" "a refusal of the bot's own request is a retry"
assert_contains "$ffcb_text" "<!-- claude-land-retry chain=808 attempt=2 -->" "and echoes the chain and attempt it was asked on"

# --- failed before any check ran ----------------------------------------------

rm -f "$ffcb_refusal"
ffcb_run failure "" ""
assert_eq false "$ffcb_retry" "an infrastructure failure is not a retry"
assert_contains "$ffcb_text" "failed before it could check this pull request" "it says the run broke"
assert_contains "$ffcb_text" "https://runs/7" "and links the log"

# An empty refusal file is the same as none: a step that touched it without
# writing must not produce an empty comment.
: > "$ffcb_refusal"
ffcb_run failure 4242 2
assert_eq false "$ffcb_retry" "an empty refusal file is not a refusal"
assert_contains "$ffcb_text" "failed before it could check this pull request" "so the generic message is used"

rm -rf "$ffcb_dir"
