# Exercise the real publisher with a disposable registry and Git-command stub.
backend_release_case() {
  local scenario=$1 expected_status=$2 want_build=$3 want_promotion=$4 temp status=0 log
  temp=$(mktemp -d)
  (
    export IMAGE_REPOSITORY=ghcr.io/arkive-games/backend-go
    export GHCR_USERNAME=fixture GHCR_PASSWORD=fixture REGISTRY_USERNAME= REGISTRY_PASSWORD=
    export GITHUB_STEP_SUMMARY="$temp/summary"
    export TEST_LOG="$temp/commands" TEST_SCENARIO="$scenario"
    export TEST_REVISION=1111111111111111111111111111111111111111
    export TEST_DIGEST=sha256:2222222222222222222222222222222222222222222222222222222222222222
    git() {
      case "$1:$4" in
        fetch:*) [[ $TEST_SCENARIO != fetch-error ]] ;;
        log:HEAD) printf '%s\n' "$TEST_REVISION" ;;
        log:FETCH_HEAD)
          if [[ $TEST_SCENARIO == stale || ($TEST_SCENARIO == stale-after-build && -f $TEST_LOG) ]]; then
            printf '%040d\n' 0
          else
            printf '%s\n' "$TEST_REVISION"
          fi ;;
        *) return 1 ;;
      esac
    }
    docker() {
      case "$1:$2:${3:-}" in
        login:*) read -r -s _password ;;
        buildx:build:*) printf 'build\n' >> "$TEST_LOG" ;;
        buildx:imagetools:create)
          [[ ${*: -1} == "$IMAGE_REPOSITORY@$TEST_DIGEST" ]] || return 1
          printf 'promote\n' >> "$TEST_LOG" ;;
        buildx:imagetools:inspect)
          if [[ $TEST_SCENARIO == registry-error ]]; then
            printf 'registry connection timed out\n' >&2
            return 1
          fi
          if [[ $TEST_SCENARIO == up-to-date ||
                ($4 == *:git-* && ($TEST_SCENARIO == resume || -f $TEST_LOG)) ]] ||
             { [[ $4 == *:komodo && -f $TEST_LOG ]] && grep -qx promote "$TEST_LOG"; }; then
            printf '%s\n' "$TEST_DIGEST"
          else
            printf 'manifest unknown\n' >&2
            return 1
          fi ;;
        *) return 1 ;;
      esac
    }
    export -f git docker
    bash "$SCRIPTS_DIR/backend-release.sh"
  ) > "$temp/output" 2>&1 || status=$?
  log=$(cat "$temp/commands" 2>/dev/null || :)
  assert_status "$expected_status" "$status" "$scenario exit status"
  assert_eq "$want_build" "$(grep -cx build <<< "$log" || :)" "$scenario builds"
  assert_eq "$want_promotion" "$(grep -cx promote <<< "$log" || :)" "$scenario promotions"
  if [[ $status != "$expected_status" ]]; then cat "$temp/output"; fi
  rm -f "$temp/output" "$temp/commands" "$temp/summary"
  rmdir "$temp"
}

backend_release_case new 0 1 1
backend_release_case resume 0 0 1
backend_release_case up-to-date 0 0 0
backend_release_case stale 0 0 0
backend_release_case stale-after-build 0 1 0
backend_release_case registry-error 1 0 0
backend_release_case fetch-error 1 0 0
