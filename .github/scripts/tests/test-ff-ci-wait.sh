# ff-ci-wait.sh -- polling until ci.yml concludes, and refusing when it does not.
#
# The query is injected through $CI_QUERY_CMD, so the loop and every verdict it can
# reach are exercised in milliseconds and without a token. The stub answers from a
# scripted sequence: answer.1 for the first poll, answer.2 for the second, and
# answer.last for every poll after the sequence runs out.

ffci_dir="$(mktemp -d)"
ffci_stub="$ffci_dir/ci-query.sh"
ffci_refusal="$ffci_dir/refusal.md"

cat > "$ffci_stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
n=$(cat "$FFCI_DIR/polls" 2>/dev/null || echo 0)
n=$(( n + 1 ))
printf '%s' "$n" > "$FFCI_DIR/polls"
answer="$FFCI_DIR/answer.$n"
[ -f "$answer" ] || answer="$FFCI_DIR/answer.last"
if [ -f "$answer" ]; then cat "$answer"; fi
STUB
chmod +x "$ffci_stub"

# ffci_answer <n|last> <status> <conclusion> <url>   -- three lines, as gh prints
ffci_answer() {
  printf '%s\n%s\n%s\n' "$2" "$3" "$4" > "$ffci_dir/answer.$1"
}

# ffci_reset -- forget the scripted answers and the poll count
ffci_reset() {
  rm -f "$ffci_dir"/answer.* "$ffci_dir/polls" "$ffci_refusal"
}

# ffci_run <timeout-seconds>
ffci_run() {
  ffci_stdout=$(
    HEAD_SHA=cafebabe REPO="arkive-games/arkive" \
    TIMEOUT_SECONDS="$1" POLL_SECONDS=0 \
    CI_QUERY_CMD="$ffci_stub" FFCI_DIR="$ffci_dir" \
    REFUSAL_FILE="$ffci_refusal" \
    "$SCRIPTS_DIR/ff-ci-wait.sh" 2>&1
  )
  ffci_rc=$?
  ffci_reason=$(cat "$ffci_refusal" 2>/dev/null || true)
  ffci_polls=$(cat "$ffci_dir/polls" 2>/dev/null || echo 0)
}

# --- queued, queued, success: the case the wait exists for ---------------------
# The review bot rebases, force-pushes and asks to land in one run, so CI has
# usually not finished -- often not started -- when the request arrives.

ffci_reset
ffci_answer 1 queued "" "https://x/1"
ffci_answer 2 in_progress "" "https://x/1"
ffci_answer last completed success "https://x/1"
ffci_run 60
assert_status 0 "$ffci_rc" "a run that ends in success passes"
assert_eq 3 "$ffci_polls" "and it polled until it did"
assert_contains "$ffci_stdout" "status=queued" "the log shows the wait"
assert_contains "$ffci_stdout" "CI passed on cafebabe." "and the verdict"
assert_eq "" "$ffci_reason" "no refusal is written"

# --- absent, then success -----------------------------------------------------
# A just-pushed SHA has no run for a few seconds. Absent is a state to wait
# through, not a verdict -- an empty answer must not be read as a failure.

ffci_reset
ffci_answer last completed success "https://x/2"
# An empty first answer is what gh prints for a SHA that has no run yet.
: > "$ffci_dir/answer.1"
ffci_run 60
assert_status 0 "$ffci_rc" "a SHA whose run has not appeared yet is waited for"
assert_contains "$ffci_stdout" "status=absent" "the missing run is logged as absent"
assert_eq 2 "$ffci_polls" "and the next poll finds it"

# --- concluded failure --------------------------------------------------------

ffci_reset
ffci_answer last completed failure "https://x/3"
ffci_run 60
assert_status 1 "$ffci_rc" "a red CI run is refused"
assert_contains "$ffci_reason" "concluded \`failure\`" "the reason names the conclusion"
assert_contains "$ffci_reason" "https://x/3" "and links the run"
assert_contains "$ffci_reason" "Fix what it reports" "and says what to do"

# A cancelled or timed-out run is not a success either.
ffci_reset
ffci_answer last completed cancelled "https://x/4"
ffci_run 60
assert_status 1 "$ffci_rc" "a cancelled CI run is refused"
assert_contains "$ffci_reason" "concluded \`cancelled\`" "with its own conclusion named"

# --- never completes ----------------------------------------------------------
# TIMEOUT_SECONDS=0 makes the first poll also the last one. The two timeout
# messages must be distinguishable: "no run appeared" is a broken trigger, "still
# running" is a slow build, and they need different fixes.

ffci_reset
ffci_answer last in_progress "" "https://x/5"
ffci_run 0
assert_status 1 "$ffci_rc" "a run that never completes is refused at the deadline"
assert_contains "$ffci_reason" "was still \`in_progress\`" "the reason says it was still running"
assert_contains "$ffci_reason" "https://x/5" "and links the run"
assert_not_contains "$ffci_reason" "no CI run appeared" "and does not claim the run was missing"
assert_contains "$ffci_stdout" "::error::CI did not complete for cafebabe" "the run log records the timeout"

ffci_reset
ffci_run 0
assert_status 1 "$ffci_rc" "a SHA with no run at all is refused at the deadline"
assert_contains "$ffci_reason" "no CI run appeared" "the reason says the run was missing"
assert_contains "$ffci_reason" "no evidence this branch builds" "and why that is refused"
assert_contains "$ffci_reason" "\`ci.yml\` is triggering" "and points at the trigger"
assert_not_contains "$ffci_reason" "was still" "and does not claim it was running"

rm -rf "$ffci_dir"
