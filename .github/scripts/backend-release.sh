#!/usr/bin/env bash
set -euo pipefail

image=${IMAGE_REPOSITORY:?set BACKEND_IMAGE_REPOSITORY}
registry=${image%%/*}
if [[ ! $image =~ ^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9]+([._-]+[a-z0-9]+)*)+$ ]] ||
   [[ $registry != *.* && $registry != *:* && $registry != localhost ]]; then
  echo 'BACKEND_IMAGE_REPOSITORY must be a fully qualified, lowercase image name without a tag.' >&2
  exit 1
fi

# Use a path revision so unrelated master pushes neither rebuild nor redeploy.
release_paths=(backend-go .github/workflows/backend-release.yml .github/scripts/backend-release.sh)
revision=$(git log -1 --format=%H HEAD -- "${release_paths[@]}")
[[ $revision =~ ^[a-f0-9]{40}$ ]]
is_current() {
  local tip_revision
  git fetch --quiet --no-tags origin refs/heads/master || exit 1
  tip_revision=$(git log -1 --format=%H FETCH_HEAD -- "${release_paths[@]}") || exit 1
  [[ $revision == "$tip_revision" ]]
}

if ! is_current; then
  echo 'A newer backend revision is on master; wait for its CI instead.'
  exit 0
fi

if [[ $registry == ghcr.io && -z ${REGISTRY_USERNAME:-} && -z ${REGISTRY_PASSWORD:-} ]]; then
  REGISTRY_USERNAME=$GHCR_USERNAME
  REGISTRY_PASSWORD=$GHCR_PASSWORD
fi
printf '%s\n' "${REGISTRY_PASSWORD:?missing registry password}" |
  docker login "$registry" --username "${REGISTRY_USERNAME:?missing registry username}" --password-stdin

# An absent manifest is expected on the first release. Other registry errors
# must fail the run so an existing release tag isn't accidentally overwritten.
manifest_digest() {
  local result
  if result=$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>&1); then
    if [[ ! $result =~ ^sha256:[a-f0-9]{64}$ ]]; then
      printf 'Registry returned an invalid digest for %s\n' "$1" >&2
      return 1
    fi
    printf '%s\n' "$result"
  elif [[ ${result,,} == *'manifest unknown'* || ${result,,} == *'name unknown'* || ${result,,} == *'not found'* ]]; then
    return 0
  else
    printf '%s\n' "$result" >&2
    return 1
  fi
}

version="$image:git-$revision"
channel="$image:komodo"
digest=$(manifest_digest "$version")
if [[ -z $digest ]]; then
  docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
    --build-arg GOPROXY=https://proxy.golang.org,direct \
    --label "org.opencontainers.image.revision=$revision" \
    --label 'org.opencontainers.image.source=https://github.com/arkive-games/arkive' \
    --tag "$version" --push backend-go
  digest=$(manifest_digest "$version")
  : "${digest:?published image is not visible in the registry}"
fi

deployed_candidate=$(manifest_digest "$channel")
if [[ $deployed_candidate == "$digest" ]]; then
  printf 'Komodo channel already points to %s@%s\n' "$image" "$digest"
  exit 0
fi

if ! is_current; then
  echo 'Backend changed during the build; leaving the Komodo channel untouched.'
  exit 0
fi

# Copy the exact manifest rather than wrapping it in a new OCI index.
docker buildx imagetools create --prefer-index=false --tag "$channel" "$image@$digest"
[[ $(manifest_digest "$channel") == "$digest" ]]
printf 'Promoted %s@%s to %s\n' "$image" "$digest" "$channel" | tee -a "${GITHUB_STEP_SUMMARY:?}"
