#!/usr/bin/env bash
set -euo pipefail
image=${1:-genfactory-check}
network="genfactory-smoke-$$"
upstream="$network-api"
frontend="$network-app"
fixture_dir=$(mktemp -d)
cleanup() {
    docker rm -f "$frontend" "$upstream" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$fixture_dir"
}
trap cleanup EXIT
cat > "$fixture_dir/default.conf" <<'NGINX'
server {
    listen 8080;
    location = /api/check { default_type application/json; return 200 '{"ok":true}'; }
    location /api/ { return 418; }
    location /socket.io/ { return 200 "$http_upgrade"; }
}
NGINX
docker network create "$network" >/dev/null
docker run -d --name "$upstream" --network "$network" \
    --mount "type=bind,source=$fixture_dir/default.conf,target=/etc/nginx/conf.d/default.conf,readonly" \
    nginx:stable-alpine >/dev/null
docker run -d --name "$frontend" --network "$network" -p 127.0.0.1::8080 \
    -e "API_URL=http://$upstream:8080" "$image" >/dev/null
port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' "$frontend")
base="http://127.0.0.1:$port"
ready=false
for ((attempt=0; attempt<30; attempt++)); do
    if [[ $(docker inspect --format '{{.State.Health.Status}}' "$frontend") == healthy ]]; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo 'Smoke frontend did not become healthy' >&2
    docker logs "$frontend" >&2
    exit 1
fi
curl --fail --silent --show-error "$base/healthz" | grep -q '^ok$'
curl -fsS "$base/image?conversation=49" > "$fixture_dir/index.html"
grep -qi '<!doctype html>' "$fixture_dir/index.html"
curl -fsSI "$base/auth/callback?code=smoke-secret-marker" | grep -qi 'cache-control: no-cache'
[[ $(curl -fsS "$base/api/check") == '{"ok":true}' ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' "$base/api/missing") == 418 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' "$base/assets/missing.js") == 404 ]]
[[ $(curl -fsS -H 'Upgrade: websocket' "$base/socket.io/?transport=websocket") == websocket ]]
asset=$(sed -n 's/.*src="\(\/assets\/[^\"]*\.js\)".*/\1/p' "$fixture_dir/index.html" | head -1)
[[ -n "$asset" ]]
curl -fsSI "$base$asset" | grep -qi 'cache-control: public, max-age=31536000, immutable'
if docker logs "$frontend" 2>&1 | grep -q smoke-secret-marker; then
    echo 'Query string appeared in runtime logs' >&2
    exit 1
fi
if docker run --rm -e API_URL=https://example.com/invalid-path "$image" nginx -t >/dev/null 2>&1; then
    echo 'Invalid API_URL was accepted' >&2
    exit 1
fi
echo 'Container smoke passed: SPA, callback, API, upgrade header, cache, query redaction, runtime validation.'
