# ff-verified-commits.sh -- every commit arrives already signed, or it does not land.

ffvc_dir="$(mktemp -d)"
ffvc_stub="$ffvc_dir/commits-query.sh"
ffvc_refusal="$ffvc_dir/refusal.md"

cat > "$ffvc_stub" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
cat "$FFVC_ANSWER"
STUB
chmod +x "$ffvc_stub"

# ffvc_run <unverified-listing>
ffvc_run() {
  printf '%s' "$1" > "$ffvc_dir/answer"
  rm -f "$ffvc_refusal"
  ffvc_stdout=$(
    PR=17 REPO="arkive-games/arkive" \
    COMMITS_QUERY_CMD="$ffvc_stub" FFVC_ANSWER="$ffvc_dir/answer" \
    REFUSAL_FILE="$ffvc_refusal" \
    "$SCRIPTS_DIR/ff-verified-commits.sh" 2>&1
  )
  ffvc_rc=$?
  ffvc_reason=$(cat "$ffvc_refusal" 2>/dev/null || true)
}

ffvc_run ""
assert_status 0 "$ffvc_rc" "a fully verified branch passes"
assert_contains "$ffvc_stdout" "All commits verified." "and says so"
assert_eq "" "$ffvc_reason" "with no refusal"

ffvc_run 'aabbccddeeff unsigned
112233445566 unknown_key
'
assert_status 1 "$ffvc_rc" "an unverified commit is refused"
assert_contains "$ffvc_reason" "must be signed and verified by GitHub" "the reason states the rule"
assert_contains "$ffvc_reason" "aabbccddeeff unsigned" "and lists the first offender"
assert_contains "$ffvc_reason" "112233445566 unknown_key" "and the second"
assert_contains "$ffvc_reason" '```' "inside a code fence, so the listing survives markdown"
assert_contains "$ffvc_stdout" "::error::PR #17 has unverified commit(s)." "the run log agrees"

rm -rf "$ffvc_dir"
