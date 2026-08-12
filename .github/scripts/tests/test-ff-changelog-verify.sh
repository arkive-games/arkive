# ff-changelog-verify.sh -- the gate that protects the reason the workflow exists.

ffcv_dir="$(mktemp -d)"
ffcv_refusal="$ffcv_dir/refusal.md"
mkdir -p "$ffcv_dir/frontend"

cat > "$ffcv_dir/verify-ok.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "checked 4 apps in $(basename "$PWD")"
STUB
cat > "$ffcv_dir/verify-bad.sh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "palworld 1.19.0 pins 0123456789abcdef, which is not in this branch"
exit 1
STUB
chmod +x "$ffcv_dir/verify-ok.sh" "$ffcv_dir/verify-bad.sh"

# ffcv_run <verify-command>
ffcv_run() {
  rm -f "$ffcv_refusal"
  ffcv_stdout=$(
    PR=17 VERIFY_CMD="$1" REFUSAL_FILE="$ffcv_refusal" \
    "$SCRIPTS_DIR/ff-changelog-verify.sh" "$ffcv_dir/frontend" 2>&1
  )
  ffcv_rc=$?
  ffcv_reason=$(cat "$ffcv_refusal" 2>/dev/null || true)
}

ffcv_run "bash $ffcv_dir/verify-ok.sh"
assert_status 0 "$ffcv_rc" "a branch whose pinned SHAs all exist passes"
assert_contains "$ffcv_stdout" "checked 4 apps" "and the verifier's output reaches the log"
assert_contains "$ffcv_stdout" "in frontend" "the verifier runs inside the frontend directory"
assert_eq "" "$ffcv_reason" "with no refusal"

ffcv_run "bash $ffcv_dir/verify-bad.sh"
assert_status 1 "$ffcv_rc" "an orphaned changelog pin is refused"
assert_contains "$ffcv_reason" "pins a commit this branch does not contain" "the reason explains the consequence"
assert_contains "$ffcv_reason" "compare link would 404" "in the terms that matter to a reader"
assert_contains "$ffcv_reason" "palworld 1.19.0 pins 0123456789abcdef" "and quotes the verifier"
assert_contains "$ffcv_stdout" "::error::changelog-verify failed for PR #17." "the run log agrees"

rm -rf "$ffcv_dir"
