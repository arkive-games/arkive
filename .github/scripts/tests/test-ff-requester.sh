# ff-requester.sh -- who may land a pull request, and what the bot's marker says.
#
# Sourced by run.sh into its shell, so everything here is prefixed to avoid
# colliding with another test file.

ffreq_dir="$(mktemp -d)"
ffreq_out_file="$ffreq_dir/output"
ffreq_perm="$ffreq_dir/perm.sh"
ffreq_called="$ffreq_dir/perm-was-called"

# Stands in for `gh api .../collaborators/<login>/permission`. Records that it ran,
# so a test can prove the bot path never asks about permissions.
cat > "$ffreq_perm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "$FFREQ_CALLED"
case "$1" in
  boss)      echo admin ;;
  dev)       echo write ;;
  keeper)    echo maintain ;;
  passerby)  echo read ;;
  *)         echo none ;;
esac
STUB
chmod +x "$ffreq_perm"

# ffreq_run <requester> <bot-login> <body>
ffreq_run() {
  : > "$ffreq_out_file"
  : > "$ffreq_called"
  ffreq_stdout=$(
    REQUESTER="$1" \
    BOT_LOGIN="$2" \
    BODY="$3" \
    REPO="arkive-games/arkive" \
    PERM_QUERY_CMD="$ffreq_perm" \
    FFREQ_CALLED="$ffreq_called" \
    GITHUB_OUTPUT="$ffreq_out_file" \
    "$SCRIPTS_DIR/ff-requester.sh" 2>&1
  )
  ffreq_rc=$?
  ffreq_outputs=$(cat "$ffreq_out_file")
}

# --- a stranger is refused ----------------------------------------------------

ffreq_run passerby 'arkive-bot[bot]' '/fast-forward'
assert_status 1 "$ffreq_rc" "a reader is refused"
assert_contains "$ffreq_stdout" "may not land pull requests" "the refusal says why"

ffreq_run nobody 'arkive-bot[bot]' '/fast-forward'
assert_status 1 "$ffreq_rc" "a non-collaborator is refused"

# --- THE security property ----------------------------------------------------
# Authorisation is by login. The chain marker is text anyone can paste into a
# comment, and if it were what authorised the run, pasting it would be a way past
# the permission gate. A stranger carrying a perfectly-formed marker must be
# refused exactly as if they had not.
ffreq_run passerby 'arkive-bot[bot]' '/fast-forward
<!-- claude-land chain=1 attempt=1 -->'
assert_status 1 "$ffreq_rc" "a stranger pasting the chain marker is still refused"
assert_contains "$ffreq_stdout" "may not land pull requests" "and is refused for the permission reason"
assert_not_contains "$ffreq_outputs" "chain=1" "the pasted chain is never adopted as an output"

# The same body from the bot IS honoured, which is what makes the case above a
# statement about the login rather than about the marker being unparseable.
ffreq_run 'arkive-bot[bot]' 'arkive-bot[bot]' '/fast-forward
<!-- claude-land chain=1 attempt=1 -->'
assert_status 0 "$ffreq_rc" "the same body from the bot is accepted"
assert_contains "$ffreq_outputs" "chain=1" "and its chain is read"

# --- push-capable humans are accepted -----------------------------------------

for ffreq_login in boss dev keeper; do
  ffreq_run "$ffreq_login" 'arkive-bot[bot]' '/fast-forward'
  assert_status 0 "$ffreq_rc" "$ffreq_login may land"
  assert_eq "chain=
attempt=" "$ffreq_outputs" "$ffreq_login lands with an empty chain and attempt"
done

# --- the bot ------------------------------------------------------------------

ffreq_run 'arkive-bot[bot]' 'arkive-bot[bot]' 'Cannot land yet.
<!-- claude-land chain=4242 attempt=3 -->'
assert_status 0 "$ffreq_rc" "the bot login is accepted"
assert_eq "chain=4242
attempt=3" "$ffreq_outputs" "chain and attempt are parsed from the marker"
assert_eq "" "$(cat "$ffreq_called")" "the bot path never asks for a permission level"

# A marker written before attempt= existed, or one whose attempt could not be
# parsed, must still yield a usable chain rather than failing the step.
ffreq_run 'arkive-bot[bot]' 'arkive-bot[bot]' '/fast-forward
<!-- claude-land chain=7 -->'
assert_status 0 "$ffreq_rc" "a marker with no attempt= is accepted"
assert_eq "chain=7
attempt=" "$ffreq_outputs" "chain parses, attempt stays empty"

# No marker at all: still the bot, still authorised, nothing to reply on.
ffreq_run 'arkive-bot[bot]' 'arkive-bot[bot]' '/fast-forward'
assert_status 0 "$ffreq_rc" "the bot with no marker is accepted"
assert_eq "chain=
attempt=" "$ffreq_outputs" "and reports no chain"

# Unset CLAUDE_BOT_LOGIN means no bot is recognised: the login that would be the
# bot's falls through to the permission query like anyone else.
ffreq_run 'arkive-bot[bot]' '' '/fast-forward
<!-- claude-land chain=9 -->'
assert_status 1 "$ffreq_rc" "with no BOT_LOGIN configured the bot is just an unknown login"

# --- the body is data, never shell --------------------------------------------

ffreq_run 'arkive-bot[bot]' 'arkive-bot[bot]' '/fast-forward `touch '"$ffreq_dir"'/pwned` $('"$ffreq_dir"'/pwned)
<!-- claude-land chain=5 attempt=2 -->'
assert_status 0 "$ffreq_rc" "a body full of shell metacharacters is just text"
assert_eq "chain=5
attempt=2" "$ffreq_outputs" "and the marker still parses around it"
if [ -e "$ffreq_dir/pwned" ]; then
  assert_eq "no file" "a file" "the comment body must not be able to run a command"
else
  assert_eq "no file" "no file" "the comment body cannot run a command"
fi

rm -rf "$ffreq_dir"
