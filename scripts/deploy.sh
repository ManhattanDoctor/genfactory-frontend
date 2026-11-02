#!/usr/bin/env bash
# Invoked on the Docker host by genfactory-deploy.yml. No backend changes.
set -Eeuo pipefail
image=${1:?Image digest is required}
port=${2:-8081}
api_url=${3:-https://api.gnosisai.ru}
[[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid image digest' >&2; exit 1; }
[[ "$port" =~ ^[0-9]{2,5}$ ]] && ((10#$port <= 65535)) || { echo 'Invalid port' >&2; exit 1; }
[[ "$api_url" =~ ^https?://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$ ]] || { echo 'Invalid API origin' >&2; exit 1; }
name=genfactory-frontend
old_moved=0
old_stopped=0
new_moved=0
rollback() {
    result=$?
    trap - EXIT
    if ((result != 0)); then
        echo 'Deployment failed; restoring previous container.' >&2
        if ((new_moved)); then docker rm -f "$name" || true; fi
        if ((old_moved)); then
            docker rename "$name-previous" "$name" || true
            docker start "$name" || true
        elif ((old_stopped)); then
            docker start "$name" || true
        fi
        docker rm -f "$name-next" >/dev/null 2>&1 || true
    fi
    exit "$result"
}
# Pull before changing the running service. Retain one previous container for rollback.
docker pull "$image"
docker rm -f "$name-next" >/dev/null 2>&1 || true
trap rollback EXIT
docker create --name "$name-next" --restart unless-stopped \
    -p "127.0.0.1:$port:8080" -e "API_URL=$api_url" "$image" >/dev/null
if docker container inspect "$name" >/dev/null 2>&1; then
    docker rm -f "$name-previous" >/dev/null 2>&1 || true
    docker stop --time 30 "$name" >/dev/null
    old_stopped=1
    docker rename "$name" "$name-previous"
    old_moved=1
fi
docker rename "$name-next" "$name"
new_moved=1
docker start "$name" >/dev/null
for ((attempt=0; attempt<30; attempt++)); do
    if [[ $(docker inspect --format '{{.State.Health.Status}}' "$name") == healthy ]]; then
        echo "Deployed $image on 127.0.0.1:$port; health check passed."
        exit 0
    fi
    sleep 2
done
echo 'Container did not become healthy within 60 seconds.' >&2
exit 1
