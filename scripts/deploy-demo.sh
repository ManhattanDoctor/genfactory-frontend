#!/usr/bin/env bash
# Installed on the demo host alongside deploy.sh; invoked through a limited sudo rule.
set -euo pipefail
[[ $# -eq 3 ]]
revision=$1
digest=$2
actor=$3
[[ "$revision" =~ ^[0-9a-f]{40}$ && "$digest" =~ ^sha256:[0-9a-f]{64}$ && "$actor" =~ ^[a-zA-Z0-9_-]+$ ]]
image="ghcr.io/manhattandoctor/genfactory-frontend/genfactory-frontend@$digest"
umask 077
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$actor" --password-stdin
docker pull "$image"
test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")" = "$revision"
bash /usr/local/lib/genfactory-frontend/deploy.sh "$image" 8081 https://api.genfactory.ru
