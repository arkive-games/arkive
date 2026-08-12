# Tests for claude-signature.sh.
#
# Both shipped versions of this check were wrong in opposite directions, so the
# cases below pin down exactly which commits it may judge:
#   v1 judged everyone      -> rejected contributor commits GitHub called valid
#   v2 scoped by committer email -> the bot uses the OWNER's email, so it judged
#                                   the owner's own commits too
# Only the committer NAME is unique to the bot.

SIG="$SCRIPTS_DIR/claude-signature.sh"
BOT="Arkive Review Bot"

sig() { # lines...
  local input=""
  for l in "$@"; do input+="$l"$'\n'; done
  SIG_OUT="$(printf '%s' "$input" | bash "$SIG" "$BOT" 2>&1)" && SIG_STATUS=0 || SIG_STATUS=$?
}
line() { printf '%s\t%s\t%s' "$1" "$2" "$3"; }  # sha, %G?, committer

# --- the bot's own commits are judged -------------------------------------------
sig "$(line aaa G "$BOT")"
assert_status 0 "$SIG_STATUS" "bot commit, good signature, passes"

sig "$(line aaa U "$BOT")"
assert_status 0 "$SIG_STATUS" "bot commit, untrusted-but-present signature, passes"

for s in N E B X Y R; do
  sig "$(line aaa "$s" "$BOT")"
  assert_status 1 "$SIG_STATUS" "bot commit with '$s' is rejected"
  assert_contains "$SIG_OUT" "aaa" "and names the offender ($s)"
done

# --- everyone else is NOT judged (v1's bug) ---------------------------------------
# A contributor's signature is verifiable by GitHub and not by this runner, whose
# allowed-signers file holds only the bot's key. Judging it rejected commits that
# GitHub reported verified=true.
for who in "Contributor" "tc-imba" "suyn231-sudo"; do
  sig "$(line bbb E "$who")"
  assert_status 0 "$SIG_STATUS" "'$who' with E is ignored, not rejected"
done

# --- the owner's own commits are NOT judged (v2's bug) -----------------------------
# The bot commits under the owner's EMAIL, so email could never separate them.
# These lines differ from the bot's only by name, which is the whole point.
sig "$(line ccc E "tc-imba")" "$(line ddd G "$BOT")"
assert_status 0 "$SIG_STATUS" "the owner's unverifiable-locally commit does not fail the run"

# --- mixtures ---------------------------------------------------------------------
sig "$(line aaa G "$BOT")" "$(line bbb E "Contributor")" "$(line ccc G "$BOT")"
assert_status 0 "$SIG_STATUS" "signed bot commits alongside unjudged others pass"

sig "$(line aaa G "$BOT")" "$(line bbb E "Contributor")" "$(line ccc N "$BOT")"
assert_status 1 "$SIG_STATUS" "one unsigned bot commit fails the batch"
assert_contains "$SIG_OUT" "ccc" "and names it"
assert_not_contains "$SIG_OUT" "bbb" "without blaming the contributor"

# --- nothing to check ---------------------------------------------------------------
sig ""
assert_status 0 "$SIG_STATUS" "an empty range passes"

# --- a committer name containing spaces must not be split -----------------------------
sig "$(line aaa N "Arkive Review Bot")"
assert_status 1 "$SIG_STATUS" "the multi-word bot name still matches"
sig "$(line aaa N "Arkive")"
assert_status 0 "$SIG_STATUS" "a prefix of the bot name does not match"
