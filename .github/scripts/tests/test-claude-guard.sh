# Tests for claude-guard.sh -- the rule that was INERT in production.
#
# The bug it shipped with was not a wrong regex; it was that the guard never saw
# any files at all, so every pattern below would have passed just as happily
# against an empty list. That is why the "must block" cases assert a non-zero
# exit AND the naming of the offending path: a guard that exits 0 quietly is
# indistinguishable from one that works, right up until it matters.

GUARD="$SCRIPTS_DIR/claude-guard.sh"

guard() { # verb, paths...
  local verb="$1"; shift
  local out status
  out="$(printf '%s\n' "$@" | bash "$GUARD" "$verb" 2>&1)" && status=0 || status=$?
  GUARD_OUT="$out"
  return $status
}

# --- protected paths are refused under BOTH verbs ---------------------------
for verb in review fix; do
  for p in \
    ".github/workflows/claude.yml" \
    ".claude/settings.json" \
    ".apm/instructions/workspace.instructions.md" \
    "CLAUDE.md" \
    "AGENTS.md" \
    "apm.yml"
  do
    guard "$verb" "$p" && s=0 || s=$?
    assert_status 1 "$s" "[$verb] blocks $p"
    assert_contains "$GUARD_OUT" "$p" "[$verb] names $p in the refusal"
  done

  # Nesting. apm compile GENERATES tools/CLAUDE.md, and .claude/ and .apm/ are
  # honoured in subdirectories -- an anchored pattern protects only the root.
  for p in \
    "tools/CLAUDE.md" \
    "tools/AGENTS.md" \
    "frontend/.claude/settings.json" \
    "frontend/apps/aion2/.claude/hooks.json" \
    "backend-go/.apm/instructions/x.md"
  do
    guard "$verb" "$p" && s=0 || s=$?
    assert_status 1 "$s" "[$verb] blocks nested $p"
  done

  # A protected path hidden among innocuous ones must still block.
  guard "$verb" "frontend/apps/meta/src/App.tsx" ".github/workflows/ci.yml" && s=0 || s=$?
  assert_status 1 "$s" "[$verb] blocks when a protected path is mixed in"
done

# --- near misses must NOT be treated as protected ---------------------------
for p in \
  "docs/github-notes.md" \
  "docs/CLAUDE.md.template" \
  "frontend/.claude-old/x.json" \
  "docs/apm.yml.md" \
  "tools/apps/aion2/claude.py" \
  "README.md"
do
  guard fix "$p" && s=0 || s=$?
  assert_status 0 "$s" "[fix] allows $p"
done

# --- verb policy -------------------------------------------------------------
guard review "frontend/apps/palworld/src/changelog.json" && s=0 || s=$?
assert_status 0 "$s" "[review] allows a changelog re-point"

guard review "frontend/apps/meta/src/changelog.json" "frontend/apps/aion2/src/changelog.json" && s=0 || s=$?
assert_status 0 "$s" "[review] allows several changelog files"

guard review "frontend/apps/palworld/src/App.tsx" && s=0 || s=$?
assert_status 1 "$s" "[review] blocks a code edit"
assert_contains "$GUARD_OUT" "@claude fix" "[review] tells the reader how to authorise it"

guard review "frontend/apps/palworld/src/changelog.json" "frontend/apps/palworld/src/App.tsx" && s=0 || s=$?
assert_status 1 "$s" "[review] blocks code even alongside an allowed changelog"
assert_not_contains "$GUARD_OUT" "changelog.json\`" "[review] does not name the allowed file as an offender"

guard fix "frontend/apps/palworld/src/App.tsx" && s=0 || s=$?
assert_status 0 "$s" "[fix] allows a code edit"

# --- empty input ---------------------------------------------------------------
# Reaching this state means the agent committed nothing, which is legitimate.
# It is ALSO exactly what the inert version produced on every run, so the message
# must say "changed no files" rather than anything that reads as approval.
guard fix "" && s=0 || s=$?
assert_status 0 "$s" "empty list passes"
assert_contains "$GUARD_OUT" "no files" "empty list says so plainly"
