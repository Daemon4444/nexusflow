#!/usr/bin/env bash
set -euo pipefail

ROOT="${NEXUSFLOW_ROOT:-/root/distiny/nexusflow}"
PEER_HOST="${NEXUSFLOW_PEER_HOST:-172.27.219.55}"
PEER_ROOT="${NEXUSFLOW_PEER_ROOT:-/root/distiny/nexusflow}"
LOCAL_NGINX_SITE="${NEXUSFLOW_LOCAL_NGINX_SITE:-/etc/nginx/conf.d/nexusflow.conf}"
PEER_NGINX_SITE="${NEXUSFLOW_PEER_NGINX_SITE:-/etc/nginx/conf.d/nexusflow-ha.conf}"

cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy a dirty local working tree." >&2
  exit 1
fi

BUILD_SHA="$(git rev-parse HEAD)"
git fetch --quiet origin main
if [[ "$(git rev-parse origin/main)" != "$BUILD_SHA" ]]; then
  echo "Refusing to deploy: local HEAD is not origin/main." >&2
  exit 1
fi

BUNDLE="$(mktemp /tmp/nexusflow-deploy.XXXXXX.bundle)"
trap 'rm -f "$BUNDLE"' EXIT
REMOTE_BUNDLE="/tmp/nexusflow-deploy-${BUILD_SHA}.bundle"

ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" \
  "cd '$PEER_ROOT' && test -z \"\$(git status --porcelain)\""

git bundle create "$BUNDLE" HEAD
scp -q "$BUNDLE" "root@$PEER_HOST:$REMOTE_BUNDLE"

ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" \
  "cd '$PEER_ROOT' \
   && git fetch '$REMOTE_BUNDLE' HEAD \
   && git merge --ff-only FETCH_HEAD \
   && rm -f '$REMOTE_BUNDLE' \
   && bash scripts/deploy-production.sh \
   && bash scripts/install-nginx-v1-guards.sh '$PEER_NGINX_SITE'"

bash scripts/deploy-production.sh
bash scripts/install-nginx-v1-guards.sh "$LOCAL_NGINX_SITE"

LOCAL_VERSION="$(curl --fail --silent --show-error http://127.0.0.1:3001/api/version)"
PEER_VERSION="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$PEER_HOST" \
  "curl --fail --silent --show-error http://127.0.0.1:3001/api/version")"

case "$LOCAL_VERSION" in
  *"$BUILD_SHA"*) ;;
  *)
    echo "Local version mismatch: expected $BUILD_SHA, received $LOCAL_VERSION" >&2
    exit 1
    ;;
esac

case "$PEER_VERSION" in
  *"$BUILD_SHA"*) ;;
  *)
    echo "Peer version mismatch: expected $BUILD_SHA, received $PEER_VERSION" >&2
    exit 1
    ;;
esac

curl --fail --silent --show-error https://nexusflow.hk/api/health >/dev/null
PUBLIC_VERSION="$(curl --fail --silent --show-error https://nexusflow.hk/api/version)"
case "$PUBLIC_VERSION" in
  *"$BUILD_SHA"*) ;;
  *)
    echo "Public version mismatch: expected $BUILD_SHA, received $PUBLIC_VERSION" >&2
    exit 1
    ;;
esac

echo "Both production nodes are running $BUILD_SHA"
